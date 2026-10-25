use super::{codec, invalid, mapping::TABLES, snapshots, Result, StoreError};
use game_core::{
    guards::{next_revision, require_revision},
    management::*,
    progression::{self, AdvanceOutcome, AdvancePlan, AdvanceRequest},
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
fn write_diff(db: &Connection, before: &Value, after: &Value, campaign: &str) -> Result<()> {
    // Delete dependents first; insert/update parents first. Keep the original
    // per-table row order and campaign predicates, including for cached SQL.
    for table in TABLES.iter().rev() {
        let retained = after[table.name]
            .as_array()
            .ok_or_else(|| invalid("after rows"))?
            .iter()
            .map(|row| row["id"].as_str().expect("validated id"))
            .collect::<std::collections::BTreeSet<_>>();
        let deleted = before[table.name]
            .as_array()
            .ok_or_else(|| invalid("before rows"))?
            .iter()
            .filter(|row| !retained.contains(row["id"].as_str().expect("validated id")))
            .collect::<Vec<_>>();
        if !deleted.is_empty() {
            let mut statement = db.prepare_cached(&table.delete_sql())?;
            for row in deleted {
                statement.execute([row["id"].as_str().ok_or_else(|| invalid("id"))?, campaign])?;
            }
        }
    }
    for table in TABLES {
        let old = before[table.name]
            .as_array()
            .ok_or_else(|| invalid("old rows"))?
            .iter()
            .map(|row| (row["id"].as_str().expect("validated id"), row))
            .collect::<BTreeMap<_, _>>();
        let mut changed = Vec::new();
        for row in after[table.name]
            .as_array()
            .ok_or_else(|| invalid("new rows"))?
        {
            let existing = old.get(row["id"].as_str().ok_or_else(|| invalid("id"))?);
            if !existing.is_some_and(|old| **old == *row) {
                changed.push((row, existing.is_some()));
            }
        }
        // Do not construct/prepare statements for unchanged tables or unused
        // operations. Each needed statement is reused for all of its rows.
        let mut update = changed
            .iter()
            .any(|(_, existing)| *existing)
            .then(|| db.prepare_cached(&table.update_sql()))
            .transpose()?;
        let mut insert = changed
            .iter()
            .any(|(_, existing)| !*existing)
            .then(|| db.prepare_cached(&table.insert_sql()))
            .transpose()?;
        for (row, existing) in changed {
            let mut values = codec::encode_row(table, row)?;
            if existing {
                values.push(SqlValue::Text(row["id"].as_str().expect("id").into()));
                values.push(SqlValue::Text(campaign.into()));
                if update
                    .as_mut()
                    .expect("updates prepared")
                    .execute(params_from_iter(values))?
                    != 1
                {
                    return Err(reject("The saved row changed."));
                }
            } else {
                insert
                    .as_mut()
                    .expect("inserts prepared")
                    .execute(params_from_iter(values))?;
            }
        }
    }
    Ok(())
}
fn empty() -> Value {
    serde_json::to_value(SnapshotTables::default()).expect("empty tables")
}

fn market_scope(command: &game_core::market_ops::MarketCommand) -> (&game_core::EntityId, &str) {
    use game_core::market_ops::MarketCommand::{
        Close, Propose, RejectOffer, RespondNegotiation, Run,
    };
    match command {
        Run(request) => (&request.campaign_id, request.now.as_str()),
        Close(request) => (&request.campaign_id, request.now.as_str()),
        Propose(request) => (&request.campaign_id, request.now.as_str()),
        RespondNegotiation(request) => (&request.campaign_id, request.now.as_str()),
        RejectOffer(request) => (&request.campaign_id, request.now.as_str()),
    }
}
pub(super) fn market(
    db: &mut Connection,
    command: game_core::market_ops::MarketCommand,
) -> Result<AdvanceOutcome> {
    let (campaign_id, now) = market_scope(&command);
    let campaign_id = campaign_id.as_str().to_owned();
    let now = now.to_owned();
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let before = snapshots::read_from(&tx, &campaign_id)?;
    let mut tables: SnapshotTables = serde_json::from_value(before.clone())?;
    let material =
        game_core::market_ops::material(&tables, &command).map_err(StoreError::Command)?;
    let fingerprint = super::market_fingerprint(&material);
    let outcome = game_core::market_ops::commit(&mut tables, &command, &fingerprint)
        .map_err(StoreError::Command)?;
    if !outcome.replayed {
        let after = serde_json::to_value(&tables)?;
        snapshots::validate_state(&tables, &after, "native-market", &now)?;
        write_diff(&tx, &before, &after, &campaign_id)?;
    }
    tx.commit()?;
    Ok(outcome)
}
pub(super) fn lifecycle(
    db: &mut Connection,
    request: game_core::lifecycle_ops::LifecycleRequest,
    end: bool,
    prepared: game_core::lifecycle_ops::PreparedLifecycle,
) -> Result<AdvanceOutcome> {
    use game_core::lifecycle_ops;
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let mut before = snapshots::read_from(&tx, request.campaign_id.as_str())?;
    let tables: SnapshotTables = serde_json::from_value(before.clone())?;
    let material = lifecycle_ops::material(&tables, &request, end).map_err(StoreError::Command)?;
    if material != prepared.fingerprint_material
        || super::lifecycle_fingerprint(&material) != request.input_fingerprint
    {
        return Err(reject(
            "The saved lifecycle preview changed. Refresh and try again.",
        ));
    }
    if let Some(outcome) =
        lifecycle_ops::replay(&tables, &request, end).map_err(StoreError::Command)?
    {
        return Ok(outcome);
    }
    lifecycle_ops::recheck(&tables, &request, end).map_err(StoreError::Command)?;
    let after = serde_json::to_value(&prepared.after)?;
    snapshots::validate_state(&prepared.after, &after, "native-lifecycle", &request.now)?;
    // Release reservations before the first player/contract insert, while
    // keeping all expiry writes in the same rollback boundary as the audit.
    if end {
        let mut old_expiry = empty();
        let mut new_expiry = empty();
        for name in ["negotiations", "offers"] {
            old_expiry[name] = before[name].clone();
            new_expiry[name] = after[name].clone();
        }
        write_diff(&tx, &old_expiry, &new_expiry, request.campaign_id.as_str())?;
        for name in ["negotiations", "offers"] {
            before[name] = after[name].clone();
        }
    }
    write_diff(&tx, &before, &after, request.campaign_id.as_str())?;
    tx.commit()?;
    let campaign = &prepared.after.campaigns[0];
    let clock = &prepared.after.simulation_states[0];
    let receipt = prepared
        .after
        .simulation_receipts
        .last()
        .expect("prepared receipt");
    Ok(AdvanceOutcome {
        campaign_id: campaign.id.clone(),
        revision: campaign.revision,
        replayed: false,
        receipt_id: receipt.id.clone(),
        operation_key: receipt.operation_key.clone(),
        current_date: clock.current_date.clone(),
        phase: clock.phase,
        last_boundary_key: clock.last_boundary_key.clone(),
    })
}
pub(super) fn settle(
    db: &mut Connection,
    request: game_core::settlement::SettleTransferRequest,
    prepared: game_core::settlement::PreparedSettlement,
) -> Result<AdvanceOutcome> {
    let fingerprint = super::settlement_fingerprint(&prepared.fingerprint_material);
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let before = snapshots::read_from(&tx, request.campaign_id.as_str())?;
    let mut tables: SnapshotTables = serde_json::from_value(before.clone())?;
    let outcome = game_core::settlement::commit(&mut tables, &request, &prepared, &fingerprint)
        .map_err(StoreError::Command)?;
    if !outcome.replayed {
        let after = serde_json::to_value(&tables)?;
        snapshots::validate_state(&tables, &after, "native-settlement", &request.now)?;
        write_diff(&tx, &before, &after, request.campaign_id.as_str())?;
    }
    tx.commit()?;
    Ok(outcome)
}
pub(super) fn matchday(
    db: &mut Connection,
    request: game_core::matchday::SimMatchdayRequest,
    prepared: game_core::matchday::PreparedMatchday,
) -> Result<AdvanceOutcome> {
    let fingerprint = super::matchday_fingerprint(&prepared.fingerprint_material);
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let before = snapshots::read_from(&tx, request.campaign_id.as_str())?;
    let mut tables: SnapshotTables = serde_json::from_value(before.clone())?;
    let outcome = game_core::matchday::commit(&mut tables, &request, prepared, &fingerprint)
        .map_err(StoreError::Command)?;
    if !outcome.replayed {
        let after = serde_json::to_value(&tables)?;
        snapshots::validate_state(&tables, &after, "native-matchday", &request.now)?;
        write_diff(&tx, &before, &after, request.campaign_id.as_str())?;
    }
    tx.commit()?;
    Ok(outcome)
}
pub(super) fn advance(db: &mut Connection, request: AdvanceRequest) -> Result<AdvanceOutcome> {
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let before = snapshots::read_from(&tx, request.campaign_id.as_str())?;
    let mut tables: SnapshotTables = serde_json::from_value(before.clone())?;
    let material =
        progression::critical_material(&tables, &request).map_err(StoreError::Command)?;
    let fingerprint = super::advance_fingerprint(&material);
    let plan =
        progression::evaluate(&tables, &request, &fingerprint).map_err(StoreError::Command)?;
    let outcome = match plan {
        AdvancePlan::Replay(outcome) => outcome,
        AdvancePlan::Commit(planned) => {
            let outcome = progression::commit(&mut tables, *planned);
            let after = serde_json::to_value(&tables)?;
            snapshots::validate_state(&tables, &after, "native-advance", &request.now)?;
            write_diff(&tx, &before, &after, request.campaign_id.as_str())?;
            outcome
        }
    };
    tx.commit()?;
    Ok(outcome)
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
        let after = serde_json::to_value(&tables)?;
        snapshots::validate_state(&tables, &after, "native-management", &command.now)?;
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
    let saved: Option<i64> = db
        .query_row("SELECT revision FROM campaigns WHERE id=?1", [id], |r| {
            r.get(0)
        })
        .optional()?;
    let Some(revision) = saved else {
        return Ok(None);
    };
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
        let current: Option<i64> = tx
            .query_row("SELECT revision FROM campaigns WHERE id=?1", [id], |r| {
                r.get(0)
            })
            .optional()?;
        let current = current.ok_or(StoreError::NotFound)?;
        if !(request.kind == CreationKind::StandaloneDemo && id == STANDALONE_DEMO_ID) {
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
    let typed: SnapshotTables = serde_json::from_value(tables.clone())?;
    snapshots::validate_state(&typed, &tables, "native-create", &request.career.now)?;
    write_diff(&tx, &empty(), &tables, id)?;
    tx.commit()?;
    Ok(ManagementOutcome {
        campaign_id: request.career.campaign_id,
        revision: Some(revision),
        replayed: false,
        deleted: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seeded() -> (Connection, Value) {
        let mut db = Connection::open_in_memory().unwrap();
        db.pragma_update(None, "foreign_keys", true).unwrap();
        super::super::migrate(&mut db).unwrap();
        snapshots::import(
            &mut db,
            snapshots::prepare(include_bytes!("../../../fixtures/standalone.json")).unwrap(),
        )
        .unwrap();
        let before = snapshots::read_from(&db, "standalone-v2").unwrap();
        (db, before)
    }

    #[test]
    fn diff_writes_only_changed_rows_and_reuses_statements_across_operations() {
        let (mut db, before) = seeded();
        db.execute_batch("CREATE TEMP TABLE writes (operation TEXT, id TEXT);
            CREATE TEMP TRIGGER record_update AFTER UPDATE ON players BEGIN INSERT INTO writes VALUES ('update', new.id); END;
            CREATE TEMP TRIGGER record_insert AFTER INSERT ON players BEGIN INSERT INTO writes VALUES ('insert', new.id); END;
            CREATE TEMP TRIGGER record_delete AFTER DELETE ON players BEGIN INSERT INTO writes VALUES ('delete', old.id); END;").unwrap();
        let mut after = before.clone();
        after["players"][0]["name"] = Value::String("Updated player".into());
        for index in 1..4 {
            let mut player = before["players"][0].clone();
            player["id"] = Value::String(format!("new-player-{index}"));
            after["players"].as_array_mut().unwrap().push(player);
        }
        let tx = db.transaction().unwrap();
        write_diff(&tx, &before, &after, "standalone-v2").unwrap();
        tx.commit().unwrap();
        let committed = snapshots::read_from(&db, "standalone-v2").unwrap();
        assert_eq!(committed["players"].as_array().unwrap().len(), 4);
        assert_eq!(
            db.query_row(
                "SELECT count(*) FROM writes WHERE operation='update'",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
        assert_eq!(
            db.query_row(
                "SELECT count(*) FROM writes WHERE operation='insert'",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            3
        );
        write_diff(&db, &after, &after, "standalone-v2").unwrap();
        assert_eq!(
            db.query_row("SELECT count(*) FROM writes", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            4
        );
        let tx = db.transaction().unwrap();
        write_diff(&tx, &after, &before, "standalone-v2").unwrap();
        tx.commit().unwrap();
        assert_eq!(snapshots::read_from(&db, "standalone-v2").unwrap(), before);
        assert_eq!(
            db.query_row(
                "SELECT count(*) FROM writes WHERE operation='delete'",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            3
        );
    }

    #[test]
    #[ignore = "manual changed-row statement benchmark; run with --ignored --nocapture"]
    fn changed_row_benchmark() {
        use std::time::Instant;
        let (mut db, original) = seeded();
        let mut before = original.clone();
        for index in 1..500 {
            let mut player = original["players"][0].clone();
            player["id"] = Value::String(format!("bench-player-{index}"));
            before["players"].as_array_mut().unwrap().push(player);
        }
        write_diff(&db, &original, &before, "standalone-v2").unwrap();
        for changed in [0, 1, 50, 500] {
            let mut after = before.clone();
            for player in after["players"]
                .as_array_mut()
                .unwrap()
                .iter_mut()
                .take(changed)
            {
                player["name"] = Value::String("Benchmark change".into());
            }
            for repetition in 0..5 {
                let start = Instant::now();
                for _ in 0..100 {
                    let tx = db.transaction().unwrap();
                    write_diff(&tx, &before, &after, "standalone-v2").unwrap();
                    write_diff(&tx, &after, &before, "standalone-v2").unwrap();
                    tx.commit().unwrap();
                }
                eprintln!(
                    "changed={changed} repetition={repetition} pairs=100 elapsed_ms={:.3}",
                    start.elapsed().as_secs_f64() * 1000.0
                );
            }
        }
    }
}
