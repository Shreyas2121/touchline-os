use super::{invalid, mapping::TABLES, snapshots, Kind, Result, StoreError};
use game_core::{
    guards::{next_revision, require_revision},
    management::*,
    CommandError, EntityId, SnapshotTables,
};
use rusqlite::{
    params_from_iter, types::Value as SqlValue, Connection, OptionalExtension, TransactionBehavior,
};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

fn reject(message: &str) -> StoreError {
    StoreError::Command(CommandError::Conflict {
        message: message.into(),
    })
}
fn sql_value(value: &Value, kind: Kind) -> Result<SqlValue> {
    if value.is_null() {
        return Ok(SqlValue::Null);
    }
    Ok(match kind {
        Kind::Text => SqlValue::Text(value.as_str().ok_or_else(|| invalid("text"))?.into()),
        Kind::Integer => SqlValue::Integer(value.as_i64().ok_or_else(|| invalid("integer"))?),
        Kind::Bool => SqlValue::Integer(i64::from(
            value.as_bool().ok_or_else(|| invalid("boolean"))?,
        )),
        Kind::Json => SqlValue::Text(serde_json::to_string(value)?),
    })
}
fn write_diff(db: &Connection, before: &Value, after: &Value, campaign: &str) -> Result<()> {
    for table in TABLES.iter().rev() {
        let retained = after[table.name]
            .as_array()
            .ok_or_else(|| invalid("after rows"))?
            .iter()
            .map(|row| row["id"].as_str().expect("validated id"))
            .collect::<std::collections::BTreeSet<_>>();
        for row in before[table.name]
            .as_array()
            .ok_or_else(|| invalid("before rows"))?
        {
            if !retained.contains(row["id"].as_str().expect("validated id")) {
                let scope = if table.name == "campaigns" {
                    "id"
                } else {
                    "campaignId"
                };
                db.execute(
                    &format!("DELETE FROM {} WHERE id=?1 AND {scope}=?2", table.name),
                    [row["id"].as_str().ok_or_else(|| invalid("id"))?, campaign],
                )?;
            }
        }
    }
    for table in TABLES {
        let old = before[table.name]
            .as_array()
            .ok_or_else(|| invalid("old rows"))?
            .iter()
            .map(|r| (r["id"].as_str().expect("validated id"), r))
            .collect::<BTreeMap<_, _>>();
        for row in after[table.name]
            .as_array()
            .ok_or_else(|| invalid("new rows"))?
        {
            let existing = old.get(row["id"].as_str().ok_or_else(|| invalid("id"))?);
            if existing.is_some_and(|old| **old == *row) {
                continue;
            }
            let mut values = table
                .columns
                .iter()
                .map(|c| sql_value(&row[c.name], c.kind))
                .collect::<Result<Vec<_>>>()?;
            if existing.is_some() {
                let assignments = table
                    .columns
                    .iter()
                    .map(|c| format!("{}=?", c.name))
                    .collect::<Vec<_>>()
                    .join(",");
                values.push(SqlValue::Text(row["id"].as_str().expect("id").into()));
                values.push(SqlValue::Text(campaign.into()));
                let scope = if table.name == "campaigns" {
                    "id"
                } else {
                    "campaignId"
                };
                if db.execute(
                    &format!(
                        "UPDATE {} SET {assignments} WHERE id=? AND {scope}=?",
                        table.name
                    ),
                    params_from_iter(values),
                )? != 1
                {
                    return Err(reject("The saved row changed."));
                }
            } else {
                let names = table
                    .columns
                    .iter()
                    .map(|c| c.name)
                    .collect::<Vec<_>>()
                    .join(",");
                let placeholders = vec!["?"; values.len()].join(",");
                db.execute(
                    &format!(
                        "INSERT INTO {} ({names}) VALUES ({placeholders})",
                        table.name
                    ),
                    params_from_iter(values),
                )?;
            }
        }
    }
    Ok(())
}
fn empty() -> Value {
    serde_json::to_value(SnapshotTables::default()).expect("empty tables")
}
pub(super) fn manage(db: &mut Connection, command: ManagementCommand) -> Result<ManagementOutcome> {
    let canonical = fingerprint(&command).map_err(StoreError::Command)?;
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let before = match snapshots::read_from(&tx, command.campaign_id.as_str()) {
        Err(StoreError::NotFound) if matches!(command.action, ManagementAction::Delete) => {
            return Ok(ManagementOutcome {
                campaign_id: command.campaign_id,
                revision: None,
                replayed: true,
                deleted: true,
            });
        }
        other => other?,
    };
    let mut tables: SnapshotTables = serde_json::from_value(before.clone())?;
    let signature = Sha256::digest(canonical.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    let result = apply(&mut tables, &command, &signature).map_err(StoreError::Command)?;
    if result.replayed {
        return Ok(result);
    }
    if result.deleted {
        tx.execute(
            "DELETE FROM campaigns WHERE id=?1",
            [command.campaign_id.as_str()],
        )?;
    } else {
        let after = serde_json::to_value(tables)?;
        snapshots::envelope(after.clone(), "native-management", &command.now)?;
        write_diff(&tx, &before, &after, command.campaign_id.as_str())?;
    }
    tx.commit()?;
    Ok(result)
}
pub(super) fn probe(
    db: &Connection,
    request: &CreationRequest,
    signature: &str,
) -> Result<Option<ManagementOutcome>> {
    require_supported_creation(request).map_err(StoreError::Command)?;
    let id = request.career.campaign_id.as_str();
    let saved: Option<(i64, String)> = db
        .query_row(
            "SELECT revision,mode FROM campaigns WHERE id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    let Some((revision, mode)) = saved else {
        return Ok(None);
    };
    if mode != "standalone" {
        return Err(StoreError::Command(CommandError::Scope {
            message: "Historical manual saves cannot be recreated or reset.".into(),
        }));
    }
    let prior: Option<(String, String)> = db
        .query_row(
            "SELECT actionId,payload FROM auditEvents WHERE campaignId=?1 AND actionId=?2",
            [id, request.career.action_id.as_str()],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    let stored: Option<String> = db.query_row("SELECT inputFingerprint FROM simulationReceipts WHERE campaignId=?1 AND operationKey='career:initialize'",[id],|r| r.get(0)).optional()?;
    let retry = if request.reset_revision.is_some() {
        prior.as_ref().is_some_and(|(_, payload)| {
            serde_json::from_str::<Value>(payload)
                .ok()
                .is_some_and(|p| p["creationFingerprint"].as_str() == Some(signature))
        })
    } else {
        stored.as_deref() == Some(signature)
    };
    if retry {
        return Ok(Some(ManagementOutcome {
            campaign_id: EntityId::new(id).map_err(|e| invalid(e.to_string()))?,
            revision: Some(game_core::SafeInt::new(revision).map_err(|e| invalid(e.to_string()))?),
            replayed: true,
            deleted: false,
        }));
    }
    if request.reset_revision.is_none() || prior.is_some() {
        return Err(reject(
            "A different career already uses this campaign or action identity.",
        ));
    }
    Ok(None)
}
pub(super) fn probe_snapshot(
    db: &mut Connection,
    request: &CreationRequest,
    signature: &str,
) -> Result<Option<ManagementOutcome>> {
    let tx = db.transaction()?;
    let result = probe(&tx, request, signature)?;
    tx.commit()?;
    Ok(result)
}
pub(super) fn create(
    db: &mut Connection,
    request: CreationRequest,
    mut tables: Value,
    signature: &str,
) -> Result<ManagementOutcome> {
    require_supported_creation(&request).map_err(StoreError::Command)?;
    if tables["campaigns"][0]["mode"].as_str() != Some("standalone") {
        return Err(StoreError::Command(CommandError::Scope {
            message: "Only standalone careers can be created.".into(),
        }));
    }
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    if let Some(result) = probe(&tx, &request, signature)? {
        return Ok(result);
    }
    let id = request.career.campaign_id.as_str();
    let mut revision = game_core::SafeInt::new(0).expect("zero");
    if let Some(expected) = request.reset_revision {
        let mode: Option<(i64, String)> = tx
            .query_row(
                "SELECT revision,mode FROM campaigns WHERE id=?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        let (current, mode) = mode.ok_or(StoreError::NotFound)?;
        if !(request.kind == CreationKind::StandaloneDemo
            && id == STANDALONE_DEMO_ID
            && mode == "standalone")
        {
            return Err(reject("Only the matching native demo can be reset."));
        }
        let current = game_core::SafeInt::new(current).map_err(|e| invalid(e.to_string()))?;
        require_revision(current, expected).map_err(|e| reject(&e.to_string()))?;
        revision = next_revision(current).map_err(|e| invalid(e.to_string()))?;
        tables["auditEvents"][0]["summary"] =
            Value::String("Reset the native demo to its default seeded world.".into());
        tx.execute("DELETE FROM campaigns WHERE id=?1", [id])?;
    }
    tables["campaigns"][0]["revision"] = serde_json::to_value(revision)?;
    tables["simulationReceipts"][0]["inputFingerprint"] = Value::String(signature.into());
    tables["simulationReceipts"][0]["inputRevision"] = serde_json::to_value(
        request
            .reset_revision
            .unwrap_or(game_core::SafeInt::new(0).expect("zero")),
    )?;
    tables["auditEvents"][0]["payload"]["creationFingerprint"] = Value::String(signature.into());
    snapshots::envelope(tables.clone(), "native-create", &request.career.now)?;
    write_diff(&tx, &empty(), &tables, id)?;
    tx.commit()?;
    Ok(ManagementOutcome {
        campaign_id: request.career.campaign_id,
        revision: Some(revision),
        replayed: false,
        deleted: false,
    })
}
