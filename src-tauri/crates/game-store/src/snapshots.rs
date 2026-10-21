use super::{check_database, invalid, mapping::TABLES, ImportOutcome, Kind, Result, StoreError};
use game_core::{parse_snapshot, CampaignSnapshot};
use rusqlite::{
    backup::{Backup, StepResult},
    params, params_from_iter,
    types::Value as SqlValue,
    Connection, OpenFlags, OptionalExtension, TransactionBehavior,
};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, OpenOptions};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

pub(super) struct PreparedImport {
    outcome: ImportOutcome,
    tables: Vec<Vec<Vec<SqlValue>>>,
}
impl PreparedImport {
    pub(super) fn digest(&self) -> &str {
        &self.outcome.source_sha256
    }
}

pub(super) fn prepare(bytes: &[u8]) -> Result<PreparedImport> {
    let snapshot = parse_snapshot(bytes)?;
    let tables = serde_json::to_value(&snapshot.tables)?;
    validate_relationships(&tables)?;
    let campaign = &snapshot.tables.campaigns[0];
    if snapshot.campaign_revision != campaign.revision {
        return Err(invalid("campaign revision mismatch"));
    }
    let outcome = ImportOutcome {
        source_sha256: Sha256::digest(bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect(),
        campaign_id: campaign.id.as_str().to_owned(),
        imported_revision: campaign.revision.get(),
    };
    let converted = TABLES
        .iter()
        .map(|table| {
            tables[table.name]
                .as_array()
                .ok_or_else(|| invalid("missing store"))?
                .iter()
                .map(|row| {
                    table
                        .columns
                        .iter()
                        .map(|column| {
                            let value = &row[column.name];
                            if value.is_null() {
                                return Ok(SqlValue::Null);
                            }
                            Ok(match column.kind {
                                Kind::Text => SqlValue::Text(
                                    value
                                        .as_str()
                                        .ok_or_else(|| invalid("text column"))?
                                        .to_owned(),
                                ),
                                Kind::Integer => SqlValue::Integer(
                                    value.as_i64().ok_or_else(|| invalid("integer column"))?,
                                ),
                                Kind::Bool => SqlValue::Integer(i64::from(
                                    value.as_bool().ok_or_else(|| invalid("bool column"))?,
                                )),
                                Kind::Json => SqlValue::Text(serde_json::to_string(value)?),
                            })
                        })
                        .collect::<Result<Vec<_>>>()
                })
                .collect::<Result<Vec<_>>>()
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(PreparedImport {
        outcome,
        tables: converted,
    })
}

/// Input-only relationship validation: it cannot accidentally resolve an ID against
/// a different existing save. SQL enforces the same scalar references at commit.
fn validate_relationships(tables: &Value) -> Result<()> {
    let campaign = &tables["campaigns"][0];
    let campaign_id = campaign["id"]
        .as_str()
        .ok_or_else(|| invalid("campaign id"))?;
    let mut ids = BTreeMap::<&str, BTreeSet<&str>>::new();
    for table in TABLES {
        let mut seen = BTreeSet::new();
        for row in tables[table.name]
            .as_array()
            .ok_or_else(|| invalid("store array"))?
        {
            let id = row["id"].as_str().ok_or_else(|| invalid("row id"))?;
            if !seen.insert(id) {
                return Err(invalid(format!("duplicate id in {}", table.name)));
            }
            if table.name != "campaigns" && row["campaignId"].as_str() != Some(campaign_id) {
                return Err(invalid("row belongs to another campaign"));
            }
        }
        ids.insert(table.name, seen);
    }
    let reference = |table: &str, value: &Value| -> Result<()> {
        if value.is_null() {
            return Ok(());
        }
        if !value.as_str().is_some_and(|id| ids[table].contains(id)) {
            return Err(invalid(format!("missing {table} reference")));
        }
        Ok(())
    };
    for table in TABLES {
        for row in tables[table.name]
            .as_array()
            .ok_or_else(|| invalid("store array"))?
        {
            for (key, target) in [
                ("leagueId", "leagues"),
                ("clubId", "clubs"),
                ("managedClubId", "clubs"),
                ("bidderClubId", "clubs"),
                ("fromClubId", "clubs"),
                ("toClubId", "clubs"),
                ("playerId", "players"),
                ("seasonId", "seasons"),
                ("activeSeasonId", "seasons"),
                ("matchId", "matchRecords"),
                ("reversesEntryId", "ledgerEntries"),
            ] {
                if let Some(value) = row.get(key) {
                    reference(target, value)?;
                }
            }
        }
    }
    for row in tables["ledgerEntries"]
        .as_array()
        .ok_or_else(|| invalid("ledger"))?
    {
        if row["reversesEntryId"] == row["id"] {
            return Err(invalid("ledger reverses itself"));
        }
    }
    for row in tables["lineups"]
        .as_array()
        .ok_or_else(|| invalid("lineups"))?
    {
        for starter in row["starters"]
            .as_array()
            .ok_or_else(|| invalid("starters"))?
        {
            reference("players", &starter["playerId"])?;
        }
        for player in row["benchPlayerIds"]
            .as_array()
            .ok_or_else(|| invalid("bench"))?
        {
            reference("players", player)?;
        }
    }
    for row in tables["simulationReceipts"]
        .as_array()
        .ok_or_else(|| invalid("receipts"))?
    {
        for outcome in row["outcomeRefs"]
            .as_array()
            .ok_or_else(|| invalid("outcomes"))?
        {
            let target = match outcome["kind"].as_str() {
                Some("campaign") => "campaigns",
                Some("season") => "seasons",
                Some("club") => "clubs",
                Some("player") => "players",
                _ => continue,
            };
            reference(target, &outcome["id"])?;
        }
    }
    // Logical source indexes are part of validation as well as SQL constraints.
    for (table, keys) in UNIQUE_KEYS {
        let mut seen = BTreeSet::new();
        for row in tables[*table]
            .as_array()
            .ok_or_else(|| invalid("unique store"))?
        {
            let key =
                serde_json::to_string(&keys.iter().map(|key| &row[*key]).collect::<Vec<_>>())?;
            if !seen.insert(key) {
                return Err(invalid(format!("duplicate identity in {table}")));
            }
        }
    }
    Ok(())
}

const UNIQUE_KEYS: &[(&str, &[&str])] = &[
    ("seasons", &["ordinal"]),
    ("constitutions", &["version"]),
    ("registrations", &["seasonId", "competitionKey", "playerId"]),
    ("appearances", &["matchId", "playerId"]),
    ("shortlistItems", &["playerId"]),
    ("developmentPlans", &["playerId", "seasonId"]),
    ("auditEvents", &["actionId"]),
    ("simulationStates", &["campaignId"]),
    ("clubSimulationStates", &["clubId"]),
    ("clubSimulationStates", &["simulationKey"]),
    ("playerSimulationStates", &["playerId"]),
    ("playerSimulationStates", &["simulationKey"]),
    ("simulationReceipts", &["operationKey"]),
];

pub(super) fn import(
    connection: &mut Connection,
    prepared: PreparedImport,
) -> Result<ImportOutcome> {
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let outcome = prepared.outcome;
    let existing = transaction
        .query_row(
            "SELECT campaignId, importedRevision FROM transportImports WHERE sourceSha256 = ?1",
            [&outcome.source_sha256],
            |row| {
                Ok(ImportOutcome {
                    source_sha256: outcome.source_sha256.clone(),
                    campaign_id: row.get(0)?,
                    imported_revision: row.get(1)?,
                })
            },
        )
        .optional()?;
    if let Some(existing) = existing {
        return Ok(existing);
    }
    if transaction
        .prepare("SELECT 1 FROM campaigns WHERE id = ?1")?
        .exists([&outcome.campaign_id])?
    {
        return Err(StoreError::Collision(outcome.campaign_id));
    }
    for (table, rows) in TABLES.iter().zip(prepared.tables) {
        let names = table
            .columns
            .iter()
            .map(|c| c.name)
            .collect::<Vec<_>>()
            .join(",");
        let placeholders = vec!["?"; table.columns.len()].join(",");
        let mut statement = transaction.prepare_cached(&format!(
            "INSERT INTO {} ({names}) VALUES ({placeholders})",
            table.name
        ))?;
        for row in rows {
            statement.execute(params_from_iter(row))?;
        }
    }
    transaction.execute(
        "INSERT INTO transportImports VALUES (?1, ?2, ?3)",
        params![
            outcome.source_sha256,
            outcome.campaign_id,
            outcome.imported_revision
        ],
    )?;
    transaction.commit()?;
    Ok(outcome)
}

pub(super) fn read(connection: &mut Connection, campaign_id: &str) -> Result<Value> {
    let transaction = connection.transaction()?;
    let mut tables = Map::new();
    for table in TABLES {
        let names = table
            .columns
            .iter()
            .map(|c| c.name)
            .collect::<Vec<_>>()
            .join(",");
        let scope = if table.name == "campaigns" {
            "id"
        } else {
            "campaignId"
        };
        let mut statement = transaction.prepare(&format!(
            "SELECT {names} FROM {} WHERE {scope} = ?1 ORDER BY id",
            table.name
        ))?;
        let mut cursor = statement.query([campaign_id])?;
        let mut rows = Vec::new();
        while let Some(row) = cursor.next()? {
            let mut object = Map::new();
            for (index, column) in table.columns.iter().enumerate() {
                let value = match column.kind {
                    Kind::Integer => row
                        .get::<_, Option<i64>>(index)?
                        .map_or(Value::Null, Value::from),
                    Kind::Bool => row
                        .get::<_, Option<bool>>(index)?
                        .map_or(Value::Null, Value::from),
                    Kind::Text => row
                        .get::<_, Option<String>>(index)?
                        .map_or(Value::Null, Value::from),
                    Kind::Json => match row.get::<_, Option<String>>(index)? {
                        Some(json) => serde_json::from_str(&json)?,
                        None => Value::Null,
                    },
                };
                object.insert(column.name.to_owned(), value);
            }
            rows.push(Value::Object(object));
        }
        if table.name == "campaigns" && rows.is_empty() {
            return Err(StoreError::NotFound);
        }
        tables.insert(table.name.to_owned(), Value::Array(rows));
    }
    transaction.commit()?;
    Ok(Value::Object(tables))
}

pub(super) fn envelope(
    tables: Value,
    export_id: &str,
    exported_at: &str,
) -> Result<CampaignSnapshot> {
    validate_relationships(&tables)?;
    let value = json!({
        "format": "touchline-campaign", "formatVersion": 1,
        "sourceStorage": "sqlite", "sourceSchemaVersion": 1,
        "exportId": export_id, "exportedAt": exported_at,
        "campaignRevision": tables["campaigns"][0]["revision"], "tables": tables,
    });
    Ok(parse_snapshot(&serde_json::to_vec(&value)?)?)
}

static BACKUP_SEQUENCE: AtomicU64 = AtomicU64::new(0);
pub(super) fn backup(connection: &Connection, source: &Path, target: &Path) -> Result<()> {
    let parent = target
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let parent = fs::canonicalize(parent)?;
    let file_name = target
        .file_name()
        .ok_or_else(|| invalid("backup filename"))?;
    let target = parent.join(file_name);
    let source = fs::canonicalize(source)?;
    let resolved = if target.exists() {
        fs::canonicalize(&target)?
    } else {
        target.clone()
    };
    if resolved == source
        || ["-wal", "-shm", "-journal"]
            .iter()
            .any(|suffix| resolved.as_os_str() == format!("{}{suffix}", source.display()).as_str())
    {
        return Err(invalid("backup must be separate from the live database"));
    }
    // Refuse journalled/open destinations: replacing their main file alone is unsafe.
    for suffix in ["-wal", "-shm", "-journal"] {
        if Path::new(&format!("{}{suffix}", target.display())).exists() {
            return Err(invalid("backup destination is open or journalled"));
        }
    }
    let staging = parent.join(format!(
        ".touchline-backup-{}-{}.sqlite3",
        std::process::id(),
        BACKUP_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ));
    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&staging)?;
    drop(file);
    let result = (|| {
        let mut destination = Connection::open(&staging)?;
        {
            let backup = Backup::new(connection, &mut destination)?;
            let deadline = Instant::now() + Duration::from_secs(30);
            loop {
                match backup.step(128)? {
                    StepResult::Done => break,
                    _ if Instant::now() >= deadline => return Err(invalid("backup timed out")),
                    StepResult::Busy | StepResult::Locked => {
                        std::thread::sleep(Duration::from_millis(10))
                    }
                    _ => {}
                }
            }
        }
        destination.pragma_update(None, "journal_mode", "DELETE")?;
        drop(destination);
        // Reopen the independent file before promotion, with no create/migrate fallback.
        let mut reopened = Connection::open_with_flags(&staging, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        check_database(&reopened)?;
        let ids = reopened
            .prepare("SELECT id FROM campaigns ORDER BY id")?
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        for id in ids {
            envelope(
                read(&mut reopened, &id)?,
                "backup-check",
                "2026-01-01T00:00:00.000Z",
            )?;
        }
        drop(reopened);
        OpenOptions::new().write(true).open(&staging)?.sync_all()?;
        fs::rename(&staging, &target)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&staging);
    }
    result
}
