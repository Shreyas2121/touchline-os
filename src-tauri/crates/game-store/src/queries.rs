use super::{codec, invalid, mapping::TABLES, Result, StoreError};
use game_core::{queries::*, CampaignRow, EntityId, SafeInt, SnapshotTables};
use rusqlite::{params_from_iter, Connection};
use serde_json::Value;
use std::collections::BTreeMap;

pub const PAGE_SIZE: i64 = 50;
pub struct ScreenRead {
    pub model: ScreenModel,
    /// Complete scoped finance inputs stay inside Rust.
    pub financial: SnapshotTables,
    pub selection: SnapshotTables,
}

fn select(
    db: &Connection,
    name: &str,
    predicate: &str,
    values: &[String],
    limit: i64,
    offset: i64,
) -> Result<Vec<Value>> {
    let table = TABLES
        .iter()
        .find(|t| t.name == name)
        .ok_or_else(|| invalid("Unknown read table"))?;
    let columns = table.column_names();
    let mut statement = db.prepare(&format!(
        "SELECT {columns} FROM {name} WHERE {predicate} ORDER BY id LIMIT {limit} OFFSET {offset}"
    ))?;
    let mut cursor = statement.query(params_from_iter(values))?;
    let mut result = Vec::new();
    while let Some(row) = cursor.next()? {
        result.push(codec::decode_row(table, row)?);
    }
    Ok(result)
}
fn count(db: &Connection, table: &str, predicate: &str, values: &[String]) -> Result<SafeInt> {
    let number = db.query_row(
        &format!("SELECT count(*) FROM {table} WHERE {predicate}"),
        params_from_iter(values),
        |r| r.get(0),
    )?;
    SafeInt::new(number).map_err(|e| invalid(e.to_string()))
}
pub(super) fn campaigns(db: &mut Connection, page: i64) -> Result<CampaignPage> {
    if !(0..=10_000).contains(&page) {
        return Err(invalid("Invalid page"));
    }
    let tx = db.transaction()?;
    let rows = select(&tx, "campaigns", "1=1", &[], PAGE_SIZE, page * PAGE_SIZE)?;
    let total = count(&tx, "campaigns", "1=1", &[])?;
    let campaigns = serde_json::from_value(Value::Array(rows))?;
    tx.commit()?;
    Ok(CampaignPage {
        campaigns,
        page: SafeInt::new(page).map_err(|e| invalid(e.to_string()))?,
        total,
    })
}
pub(super) fn screen(db: &mut Connection, query: &ScreenQuery) -> Result<ScreenRead> {
    query.validate().map_err(|e| invalid(e.to_string()))?;
    let tx = db.transaction()?;
    let scope = vec![query.campaign_id.as_str().to_owned()];
    let campaigns = select(&tx, "campaigns", "id = ?1", &scope, 1, 0)?;
    let campaign: CampaignRow =
        serde_json::from_value(campaigns.first().ok_or(StoreError::NotFound)?.clone())?;
    let club = vec![scope[0].clone(), campaign.managed_club_id.as_str().into()];
    let season = vec![scope[0].clone(), campaign.active_season_id.as_str().into()];
    let mut rows = serde_json::to_value(SnapshotTables::default())?;
    rows["campaigns"] = Value::Array(campaigns);
    rows["clubs"] = Value::Array(select(
        &tx,
        "clubs",
        "campaignId = ?1 AND id = ?2",
        &club,
        1,
        0,
    )?);
    rows["seasons"] = Value::Array(select(
        &tx,
        "seasons",
        "campaignId = ?1 AND id = ?2",
        &season,
        1,
        0,
    )?);
    rows["constitutions"] = Value::Array(select(&tx, "constitutions", "campaignId = ?1 AND version = (SELECT max(version) FROM constitutions WHERE campaignId = ?1)", &scope, 1, 0)?);
    rows["simulationStates"] = Value::Array(select(
        &tx,
        "simulationStates",
        "campaignId = ?1",
        &scope,
        1,
        0,
    )?);
    let tables: &[&str] = match query.screen {
        Screen::CommandCenter => &["auditEvents", "offers"],
        Screen::Squad => &["players"],
        Screen::Tactics => &["lineups", "players"],
        Screen::Transfers => &["players", "offers", "transfers"],
        Screen::Finance => &["ledgerEntries"],
        Screen::Registration => &["registrations", "players"],
        Screen::Scouting => &[
            "shortlistItems",
            "scoutingReports",
            "developmentPlans",
            "players",
        ],
        Screen::Matches => &[],
        Screen::Seasons => &["seasons"],
        Screen::Constitution => &["constitutions"],
    };
    let mut totals = BTreeMap::new();
    for table in tables {
        let mut values = scope.clone();
        let predicate = match *table {
            "players" => {
                values.push(if query.screen == Screen::Transfers && query.all_players {
                    String::new()
                } else {
                    club[1].clone()
                });
                values.push(query.search.to_lowercase());
                "campaignId = ?1 AND (?2 = '' OR clubId = ?2) AND instr(lower(name), ?3) > 0"
            }
            "ledgerEntries" => {
                values.push(club[1].clone());
                values.push(season[1].clone());
                "campaignId = ?1 AND clubId = ?2 AND seasonId = ?3"
            }
            "lineups" | "registrations" => {
                values.push(season[1].clone());
                "campaignId = ?1 AND seasonId = ?2"
            }
            _ => "campaignId = ?1",
        };
        totals.insert((*table).into(), count(&tx, table, predicate, &values)?);
        rows[*table] = Value::Array(select(
            &tx,
            table,
            predicate,
            &values,
            PAGE_SIZE,
            query.page.get() * PAGE_SIZE,
        )?);
    }
    let ids = rows["players"]
        .as_array()
        .expect("array")
        .iter()
        .map(|p| p["id"].as_str().expect("id").to_owned())
        .collect::<Vec<_>>();
    if !ids.is_empty() {
        let placeholders = (2..=ids.len() + 1)
            .map(|i| format!("?{i}"))
            .collect::<Vec<_>>()
            .join(",");
        let values = scope
            .iter()
            .cloned()
            .chain(ids.iter().cloned())
            .collect::<Vec<_>>();
        for table in ["contracts", "playerSimulationStates"] {
            rows[table] = Value::Array(select(
                &tx,
                table,
                &format!(
                    "campaignId = ?1 AND playerId IN ({placeholders}){}",
                    if table == "contracts" {
                        " AND status = 'active'"
                    } else {
                        ""
                    }
                ),
                &values,
                100,
                0,
            )?);
        }
    }
    let mut financial = serde_json::to_value(SnapshotTables::default())?;
    financial["constitutions"] = Value::Array(select(&tx, "constitutions", "campaignId = ?1 AND version = (SELECT max(version) FROM constitutions WHERE campaignId = ?1)", &scope, 1, 0)?);
    for table in ["ledgerEntries", "contracts"] {
        financial[table] = Value::Array(select(
            &tx,
            table,
            "campaignId = ?1 AND clubId = ?2",
            &club,
            -1,
            0,
        )?);
    }
    let mut selection = serde_json::to_value(SnapshotTables::default())?;
    selection["fixtures"] = Value::Array(select(
        &tx,
        "fixtures",
        "campaignId = ?1 AND seasonId = ?2",
        &season,
        1,
        0,
    )?);
    if !ids.is_empty() {
        let placeholders = (3..=ids.len() + 2)
            .map(|i| format!("?{i}"))
            .collect::<Vec<_>>()
            .join(",");
        let values = season.iter().cloned().chain(ids).collect::<Vec<_>>();
        selection["simulatedAppearances"] = Value::Array(select(&tx, "simulatedAppearances", &format!("campaignId = ?1 AND playerId IN ({placeholders}) AND fixtureId IN (SELECT id FROM fixtures WHERE campaignId = ?1 AND seasonId = ?2)"), &values, -1, 0)?);
    }
    if matches!(query.screen, Screen::Tactics | Screen::Registration) {
        selection["players"] = Value::Array(select(
            &tx,
            "players",
            "campaignId = ?1 AND clubId = ?2",
            &club,
            -1,
            0,
        )?);
        selection["playerSimulationStates"] = Value::Array(select(&tx, "playerSimulationStates", "campaignId = ?1 AND playerId IN (SELECT id FROM players WHERE campaignId = ?1 AND clubId = ?2)", &club, -1, 0)?);
        selection["registrations"] = Value::Array(select(
            &tx,
            "registrations",
            "campaignId = ?1 AND seasonId = ?2",
            &season,
            -1,
            0,
        )?);
    }
    // Resolve referenced names in the same snapshot; there is no per-row IPC.
    fn refs(value: &Value, ids: &mut std::collections::BTreeSet<String>) {
        match value {
            Value::Array(items) => {
                for item in items {
                    refs(item, ids);
                }
            }
            Value::Object(object) => {
                for (key, item) in object {
                    if key.ends_with("Id") || key == "id" {
                        if let Some(id) = item.as_str() {
                            ids.insert(id.into());
                        }
                    } else if key == "benchPlayerIds" {
                        if let Some(items) = item.as_array() {
                            for id in items.iter().filter_map(Value::as_str) {
                                ids.insert(id.into());
                            }
                        }
                    } else {
                        refs(item, ids);
                    }
                }
            }
            _ => {}
        }
    }
    let mut ids = std::collections::BTreeSet::new();
    refs(&rows, &mut ids);
    let mut labels = BTreeMap::new();
    // Keep parameter counts below SQLite limits even for a page of lineups.
    for chunk in ids.into_iter().collect::<Vec<_>>().chunks(400) {
        let placeholders = (2..=chunk.len() + 1)
            .map(|i| format!("?{i}"))
            .collect::<Vec<_>>()
            .join(",");
        let values = scope
            .iter()
            .cloned()
            .chain(chunk.iter().cloned())
            .collect::<Vec<_>>();
        for table in ["players", "clubs", "leagues"] {
            for row in select(
                &tx,
                table,
                &format!("campaignId = ?1 AND id IN ({placeholders})"),
                &values,
                400,
                0,
            )? {
                labels.insert(
                    row["id"].as_str().expect("id").into(),
                    row["name"].as_str().expect("name").into(),
                );
            }
        }
    }
    let active_constitution = financial["constitutions"]
        .as_array()
        .and_then(|rows| rows.first())
        .cloned()
        .map(serde_json::from_value)
        .transpose()?;
    tx.commit()?;
    Ok(ScreenRead {
        model: ScreenModel {
            revision: campaign.revision,
            rows: serde_json::from_value(rows)?,
            totals,
            page: query.page,
            player_facts: vec![],
            finance: None,
            active_constitution,
            reports: vec![],
            labels,
        },
        financial: serde_json::from_value(financial)?,
        selection: serde_json::from_value(selection)?,
    })
}
pub(super) fn player(
    db: &mut Connection,
    campaign: &EntityId,
    player: &EntityId,
) -> Result<game_core::PlayerRow> {
    let rows = select(
        db,
        "players",
        "campaignId = ?1 AND id = ?2",
        &[campaign.as_str().into(), player.as_str().into()],
        1,
        0,
    )?;
    Ok(serde_json::from_value(
        rows.into_iter().next().ok_or(StoreError::NotFound)?,
    )?)
}
pub(super) fn planning(
    db: &mut Connection,
    campaign: &EntityId,
    player_id: &EntityId,
) -> Result<PlayerPlanning> {
    let tx = db.transaction()?;
    let headers = select(&tx, "campaigns", "id=?1", &[campaign.as_str().into()], 1, 0)?;
    let header: CampaignRow =
        serde_json::from_value(headers.into_iter().next().ok_or(StoreError::NotFound)?)?;
    let scope = vec![campaign.as_str().into(), player_id.as_str().into()];
    let players = select(&tx, "players", "campaignId=?1 AND id=?2", &scope, 1, 0)?;
    let player = serde_json::from_value(players.into_iter().next().ok_or(StoreError::NotFound)?)?;
    let note_scope = vec![
        campaign.as_str().into(),
        player_id.as_str().into(),
        header.active_season_id.as_str().into(),
    ];
    let notes = select(
        &tx,
        "developmentPlans",
        "campaignId=?1 AND playerId=?2 AND seasonId=?3",
        &note_scope,
        1,
        0,
    )?;
    let shortlist = select(
        &tx,
        "shortlistItems",
        "campaignId=?1 AND playerId=?2",
        &scope,
        1,
        0,
    )?;
    let note = notes
        .into_iter()
        .next()
        .map(serde_json::from_value)
        .transpose()?;
    let shortlist = shortlist
        .into_iter()
        .next()
        .map(serde_json::from_value)
        .transpose()?;
    let history = serde_json::from_value(Value::Array(select(
        &tx,
        "developmentSnapshots",
        "campaignId=?1 AND playerId=?2",
        &scope,
        128,
        0,
    )?))?;
    tx.commit()?;
    Ok(PlayerPlanning {
        history,
        player,
        revision: header.revision,
        note,
        shortlist,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::snapshots;

    fn seeded() -> Connection {
        let mut db = Connection::open_in_memory().unwrap();
        db.pragma_update(None, "foreign_keys", true).unwrap();
        crate::migrate(&mut db).unwrap();
        snapshots::import(
            &mut db,
            snapshots::prepare(include_bytes!("../../../fixtures/standalone.json")).unwrap(),
        )
        .unwrap();
        db
    }

    #[test]
    fn snapshot_and_normal_reads_preserve_the_same_mapped_values() {
        let db = seeded();
        db.execute(
            "UPDATE campaigns SET name=?1, revision=?2",
            rusqlite::params!["Quoted ' career 🏟", 9007199254740991_i64],
        )
        .unwrap();
        let payload =
            serde_json::json!({"values": [null, false, true, 0, 9007199254740991_i64, "text"]});
        db.execute("UPDATE auditEvents SET payload=?1", [payload.to_string()])
            .unwrap();
        for compulsory in [false, true] {
            db.execute("UPDATE offers SET compulsory=?1", [compulsory])
                .unwrap();
            let snapshot = snapshots::read_from(&db, "standalone-v2").unwrap();
            assert_eq!(snapshot["campaigns"][0]["revision"], 9007199254740991_i64);
            assert_eq!(snapshot["auditEvents"][0]["payload"], payload);
            assert_eq!(snapshot["offers"][0]["compulsory"], compulsory);
            assert!(snapshot["seasons"][0]["closedAt"].is_null());
            for table in TABLES {
                let predicate = format!("{}=?1", table.scope());
                let rows = select(
                    &db,
                    table.name,
                    &predicate,
                    &["standalone-v2".into()],
                    1000,
                    0,
                )
                .unwrap();
                assert_eq!(Value::Array(rows), snapshot[table.name], "{}", table.name);
            }
        }
    }

    #[test]
    fn malformed_stored_values_fail_both_read_paths() {
        for (table, column, value) in [
            ("auditEvents", "payload", "not-json"),
            ("campaigns", "revision", "not-an-integer"),
            ("offers", "compulsory", "not-a-boolean"),
        ] {
            let db = seeded();
            // A temporary shadow table simulates malformed storage; real
            // STRICT tables correctly refuse these scalar types at write time.
            db.execute_batch(&format!(
                "CREATE TEMP TABLE {table} AS SELECT * FROM main.{table}"
            ))
            .unwrap();
            db.execute(&format!("UPDATE {table} SET {column}=?1"), [value])
                .unwrap();
            assert!(select(&db, table, "1=1", &[], 1000, 0).is_err(), "{column}");
            assert!(
                snapshots::read_from(&db, "standalone-v2").is_err(),
                "{column}"
            );
        }
    }
}
