#[path = "../../../test-support.rs"]
mod support;
use game_core::parse_snapshot;
use game_store::{database_path, Store, StoreError, INITIAL_MIGRATION, MATCHDAY_MIGRATION};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn matchday_source() -> Value {
    let mut source = value("save-b");
    source["sourceSchemaVersion"] = json!(3);
    let t = &mut source["tables"];
    let campaign = t["campaigns"][0]["id"].clone();
    let home = t["clubs"][0]["id"].clone();
    let mut away = t["clubs"][0].clone();
    away["id"] = json!("away-club");
    t["clubs"].as_array_mut().unwrap().push(away);
    let mut player = t["players"][0].clone();
    player["id"] = json!("away-player");
    player["clubId"] = json!("away-club");
    t["players"].as_array_mut().unwrap().push(player);
    t["fixtures"] = json!([{
        "id":"fixture-1", "campaignId":campaign, "seasonId":t["seasons"][0]["id"],
        "leagueId":t["leagues"][0]["id"], "round":1, "matchDate":"2026-09-01",
        "homeClubId":home, "awayClubId":"away-club", "fixtureKey":"season:2026:round:01", "status":"scheduled"
    }]);
    t["simulatedMatches"] = json!([{
        "id":"match-1", "campaignId":campaign, "fixtureId":"fixture-1",
        "homeGoals":1, "awayGoals":0, "homeXgMilli":1200, "awayXgMilli":800,
        "timeline":[{"minute":30,"kind":"goal"}], "inputSnapshot":{"homeStrength":70},
        "eventSeed":4294967295_u64, "engineVersion":"1"
    }]);
    t["simulatedAppearances"] = json!([
        {"id":"appearance-home", "campaignId":campaign, "fixtureId":"fixture-1", "playerId":t["players"][0]["id"], "clubId":home, "started":true, "minutes":90, "goals":1, "assists":0, "rating":80, "yellowCards":0, "redCards":0},
        {"id":"appearance-away", "campaignId":campaign, "fixtureId":"fixture-1", "playerId":"away-player", "clubId":"away-club", "started":false, "minutes":45, "goals":0, "assists":0, "rating":50, "yellowCards":2, "redCards":1}
    ]);
    t["auditEvents"][0]["actionType"] = json!("simulation.matchday");
    t["simulationReceipts"][0]["outcomeRefs"] = json!([
        {"kind":"fixture","id":"fixture-1"}, {"kind":"match","id":"match-1"}
    ]);
    source
}

fn market_source() -> Value {
    let mut source = matchday_source();
    source["sourceSchemaVersion"] = json!(4);
    let campaign = source["tables"]["campaigns"][0]["id"].clone();
    let season = source["tables"]["seasons"][0]["id"].clone();
    let player = source["tables"]["players"][0]["id"].clone();
    let seller = source["tables"]["clubs"][0]["id"].clone();
    source["tables"]["negotiations"] = json!([{
        "id": "negotiation-1",
        "campaignId": campaign,
        "seasonId": season,
        "playerId": player,
        "buyerClubId": "away-club",
        "sellerClubId": seller,
        "status": "agreed",
        "feeCents": 1000,
        "reservedCents": 1000,
        "wageCents": 500,
        "reservedWageCents": 500,
        "squadTier": "rotation",
        "expiresOn": "2027-06-30",
        "counterCount": 1,
        "openedOn": "2026-07-01",
        "deadlineOn": "2026-07-15",
        "resolvedOn": null,
        "engineVersion": "1",
        "eventSeed": 7,
        "qualification": {
            "feeCents": 1000,
            "valuationCents": 900,
            "buyerPrestige": 70,
            "sellerPrestige": 60,
            "constitutionVersion": 1,
            "compulsory": 1
        }
    }]);
    let offer = &mut source["tables"]["offers"][0];
    offer["negotiationId"] = json!("negotiation-1");
    offer["sellerClubId"] = seller;
    offer["deadlineOn"] = json!("2026-07-15");
    offer["origin"] = json!("ai");
    offer["marketValueCents"] = json!(900);
    offer["bidderPrestige"] = json!(70);
    offer["sellerPrestige"] = json!(60);
    offer["constitutionVersion"] = json!(1);
    offer["compulsory"] = json!(true);
    source
}

fn insert_rows(db: &mut Connection, source: &Value) {
    let tx = db.transaction().unwrap();
    for (table, rows) in source["tables"].as_object().unwrap() {
        for row in rows.as_array().unwrap() {
            let object = row.as_object().unwrap();
            let columns = object.keys().cloned().collect::<Vec<_>>();
            let values = object
                .values()
                .map(|v| match v {
                    Value::Null => rusqlite::types::Value::Null,
                    Value::Bool(b) => rusqlite::types::Value::Integer(i64::from(*b)),
                    Value::Number(n) => rusqlite::types::Value::Integer(n.as_i64().unwrap()),
                    Value::String(s) => rusqlite::types::Value::Text(s.clone()),
                    _ => rusqlite::types::Value::Text(v.to_string()),
                })
                .collect::<Vec<_>>();
            tx.execute(
                &format!(
                    "INSERT INTO {table} ({}) VALUES ({})",
                    columns.join(","),
                    vec!["?"; columns.len()].join(",")
                ),
                rusqlite::params_from_iter(values),
            )
            .unwrap();
        }
    }
    tx.commit().unwrap();
}

#[test]
fn schema_three_upgrades_to_empty_negotiations_and_preserves_rows() {
    let dir = Directory::new();
    let path = dir.file("schema-three.sqlite3");
    let mut db = Connection::open(&path).unwrap();
    db.execute_batch(INITIAL_MIGRATION).unwrap();
    db.execute_batch(MATCHDAY_MIGRATION).unwrap();
    let source = matchday_source();
    assert!(source["tables"].get("negotiations").is_none());
    insert_rows(&mut db, &source);
    let campaigns = count(&path, "campaigns");
    let matches = count(&path, "simulatedMatches");
    drop(db);
    let store = Store::open(&path).unwrap();
    assert_eq!(tables(&store, "save-b"), sorted_tables(&bytes(&source)));
    assert_eq!(count(&path, "negotiations"), 0);
    assert_eq!(count(&path, "campaigns"), campaigns);
    assert_eq!(count(&path, "simulatedMatches"), matches);
    assert!(matches > 0 && campaigns > 0);
    let db = Connection::open(&path).unwrap();
    assert_eq!(
        db.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        5
    );
    assert_eq!(count(&path, "schemaMigrations"), 4);
    let compulsory: i64 = db
        .query_row("SELECT compulsory FROM offers", [], |r| r.get(0))
        .unwrap();
    assert_eq!(compulsory, 0);
    db.execute("UPDATE auditEvents SET actionType = 'market.tick'", [])
        .unwrap();
    assert!(db
        .execute("UPDATE auditEvents SET actionType = 'not.an.action'", [])
        .is_err());
}

#[test]
fn legacy_snapshot_exports_explicit_empty_schema_three_collections() {
    let dir = Directory::new();
    let store = Store::open(dir.file("legacy.sqlite3")).unwrap();
    let legacy = value("save-b");
    assert!(legacy["tables"].get("fixtures").is_none());
    store.import_snapshot(&bytes(&legacy)).unwrap();
    let exported = store
        .export_snapshot("save-b", "export", "2026-10-22T12:00:00.000Z")
        .unwrap();
    assert_eq!(exported.source_schema_version.get(), 5);
    let encoded = bytes(&serde_json::to_value(exported).unwrap());
    let parsed: Value = serde_json::from_slice(&encoded).unwrap();
    for table in [
        "fixtures",
        "simulatedMatches",
        "simulatedAppearances",
        "negotiations",
        "boardObjectives",
        "seasonSettlements",
        "developmentSnapshots",
    ] {
        assert_eq!(parsed["tables"][table], json!([]));
    }
    let other = Store::open(dir.file("reimport.sqlite3")).unwrap();
    other.import_snapshot(&encoded).unwrap();
    assert_eq!(tables(&store, "save-b"), tables(&other, "save-b"));
}

#[test]
fn matchday_rows_round_trip_and_sql_enforces_identities_and_scope() {
    let dir = Directory::new();
    let path = dir.file("matchday.sqlite3");
    let source = matchday_source();
    let store = Store::open(&path).unwrap();
    store.import_snapshot(&bytes(&source)).unwrap();
    assert_eq!(tables(&store, "save-b"), sorted_tables(&bytes(&source)));
    drop(store);
    let store = Store::open(&path).unwrap();
    let export = store
        .export_snapshot("save-b", "export", "2026-10-22T12:00:00.000Z")
        .unwrap();
    assert_eq!(export.source_schema_version.get(), 5);
    assert!(export.tables.negotiations.is_empty());
    assert!(!export.tables.offers[0].compulsory);
    assert!(export.tables.offers[0].negotiation_id.is_none());
    let other = Store::open(dir.file("roundtrip.sqlite3")).unwrap();
    other
        .import_snapshot(&serde_json::to_vec(&export).unwrap())
        .unwrap();
    assert_eq!(tables(&other, "save-b"), tables(&store, "save-b"));
    let db = Connection::open(&path).unwrap();
    db.pragma_update(None, "foreign_keys", true).unwrap();
    for table in ["simulatedMatches", "simulatedAppearances"] {
        let columns = db
            .prepare(&format!("PRAGMA table_info({table})"))
            .unwrap()
            .query_map([], |r| r.get::<_, String>(1))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        let selection = columns
            .iter()
            .map(|c| if c == "id" { "'duplicate'" } else { c.as_str() })
            .collect::<Vec<_>>()
            .join(",");
        assert!(db
            .execute(
                &format!("INSERT INTO {table} SELECT {selection} FROM {table} LIMIT 1"),
                []
            )
            .is_err());
    }
    for sql in [
        "UPDATE fixtures SET homeClubId = 'missing'",
        "UPDATE simulatedMatches SET fixtureId = 'missing'",
        "UPDATE simulatedAppearances SET playerId = 'missing'",
        "UPDATE simulatedMatches SET homeGoals = 16",
        "UPDATE simulatedMatches SET awayXgMilli = 20001",
        "UPDATE simulatedMatches SET engineVersion = '2'",
    ] {
        assert!(db.execute(sql, []).is_err(), "accepted {sql}");
    }
}

#[test]
fn agreed_negotiation_and_offer_snapshot_round_trip() {
    let dir = Directory::new();
    let path = dir.file("market.sqlite3");
    let source = market_source();
    let store = Store::open(&path).unwrap();
    store.import_snapshot(&bytes(&source)).unwrap();
    assert_eq!(tables(&store, "save-b"), sorted_tables(&bytes(&source)));
    drop(store);
    let store = Store::open(&path).unwrap();
    let export = store
        .export_snapshot("save-b", "export", "2026-10-22T12:00:00.000Z")
        .unwrap();
    assert_eq!(export.source_schema_version.get(), 5);
    assert_eq!(export.tables.negotiations.len(), 1);
    assert_eq!(
        export.tables.negotiations[0].status,
        game_core::NegotiationStatus::Agreed
    );
    assert!(export.tables.offers[0].compulsory);
    assert_eq!(
        export.tables.offers[0]
            .negotiation_id
            .as_ref()
            .map(|id| id.as_str()),
        Some("negotiation-1")
    );
    assert_eq!(
        export.tables.negotiations[0]
            .qualification
            .as_ref()
            .map(|item| item.compulsory.get()),
        Some(1)
    );
    let other = Store::open(dir.file("market-reimport.sqlite3")).unwrap();
    other
        .import_snapshot(&serde_json::to_vec(&export).unwrap())
        .unwrap();
    assert_eq!(tables(&other, "save-b"), tables(&store, "save-b"));
    drop(store);
    let db = Connection::open(&path).unwrap();
    db.pragma_update(None, "foreign_keys", true).unwrap();
    let duplicate = "INSERT INTO negotiations (
        id, campaignId, seasonId, playerId, buyerClubId, sellerClubId, status,
        feeCents, reservedCents, wageCents, reservedWageCents, squadTier,
        expiresOn, counterCount, openedOn, deadlineOn, resolvedOn,
        engineVersion, eventSeed, qualification
    ) SELECT
        'negotiation-2', campaignId, seasonId, playerId, buyerClubId, sellerClubId, 'proposed',
        feeCents, reservedCents, wageCents, reservedWageCents, squadTier,
        expiresOn, counterCount, openedOn, deadlineOn, NULL,
        engineVersion, eventSeed, qualification
    FROM negotiations";
    let error = db.execute(duplicate, []).unwrap_err();
    assert!(
        error.to_string().to_lowercase().contains("unique"),
        "{error}"
    );
    db.execute(
        "INSERT INTO negotiations (
            id, campaignId, seasonId, playerId, buyerClubId, sellerClubId, status,
            feeCents, reservedCents, wageCents, reservedWageCents, squadTier,
            expiresOn, counterCount, openedOn, deadlineOn, resolvedOn,
            engineVersion, eventSeed, qualification
        ) SELECT
            'negotiation-3', campaignId, seasonId, playerId, buyerClubId, sellerClubId, 'settled',
            feeCents, 0, wageCents, 0, squadTier,
            expiresOn, counterCount, openedOn, deadlineOn, '2026-07-20',
            engineVersion, eventSeed, qualification
        FROM negotiations",
        [],
    )
    .unwrap();
}

#[test]
fn negotiation_rules_reject_reserved_cents_counter_count_and_engine() {
    let mut reserved = market_source();
    let row = &mut reserved["tables"]["negotiations"][0];
    row["status"] = json!("rejected");
    row["resolvedOn"] = json!("2026-07-02");
    row["reservedCents"] = json!(1);
    assert!(parse_snapshot(&bytes(&reserved)).is_err());
    let mut counters = market_source();
    counters["tables"]["negotiations"][0]["counterCount"] = json!(3);
    assert!(parse_snapshot(&bytes(&counters)).is_err());
    let mut engine = market_source();
    engine["tables"]["negotiations"][0]["engineVersion"] = json!("2");
    assert!(parse_snapshot(&bytes(&engine)).is_err());
    let mut extra = market_source();
    extra["tables"]["negotiations"][0]["qualification"]["player"] = json!({"id": "save-b-player"});
    assert!(parse_snapshot(&bytes(&extra)).is_err());
    let mut duplicate = market_source();
    let mut second = duplicate["tables"]["negotiations"][0].clone();
    second["id"] = json!("negotiation-2");
    second["status"] = json!("proposed");
    duplicate["tables"]["negotiations"]
        .as_array_mut()
        .unwrap()
        .push(second);
    assert!(parse_snapshot(&bytes(&duplicate)).is_err());
}

#[test]
fn invalid_matchday_values_and_duplicate_players_fail_before_import() {
    let source = matchday_source();
    for (pointer, bad) in [
        ("/tables/fixtures/0/round", json!(0)),
        ("/tables/fixtures/0/round", json!(35)),
        ("/tables/fixtures/0/matchDate", json!("2026-02-30")),
        ("/tables/fixtures/0/status", json!("unknown")),
        ("/tables/simulatedMatches/0/engineVersion", json!("2")),
        ("/tables/simulatedMatches/0/homeGoals", json!(16)),
        ("/tables/simulatedMatches/0/awayXgMilli", json!(20001)),
        (
            "/tables/simulatedMatches/0/timeline",
            json!(vec![json!({}); 81]),
        ),
        (
            "/tables/simulatedMatches/0/inputSnapshot",
            json!({"players":[{"attributes":{"pace":70}}]}),
        ),
        ("/tables/simulatedAppearances/0/minutes", json!(91)),
        ("/tables/simulatedAppearances/0/rating", json!(101)),
        ("/tables/simulatedAppearances/0/yellowCards", json!(3)),
        ("/tables/simulatedAppearances/0/redCards", json!(2)),
    ] {
        let mut bad_source = source.clone();
        *bad_source.pointer_mut(pointer).unwrap() = bad;
        assert!(
            parse_snapshot(&bytes(&bad_source)).is_err(),
            "accepted {pointer}"
        );
    }
    for table in ["simulatedMatches", "simulatedAppearances"] {
        let mut duplicate = source.clone();
        let mut row = duplicate["tables"][table][0].clone();
        row["id"] = json!("duplicate");
        duplicate["tables"][table].as_array_mut().unwrap().push(row);
        assert!(parse_snapshot(&bytes(&duplicate)).is_err());
    }
}

#[test]
fn unsupported_versions_leave_database_bytes_unchanged() {
    let dir = Directory::new();
    for version in [1, 2, 6, 99, -1] {
        let path = dir.file(&format!("unsupported-{version}.sqlite3"));
        let db = Connection::open(&path).unwrap();
        db.execute_batch(
            "CREATE TABLE precious (value TEXT); INSERT INTO precious VALUES ('keep');",
        )
        .unwrap();
        db.pragma_update(None, "user_version", version).unwrap();
        drop(db);
        let before = std::fs::read(&path).unwrap();
        assert!(matches!(Store::open(&path),Err(StoreError::UnsupportedSchema(v)) if v==version));
        assert_eq!(std::fs::read(&path).unwrap(), before);
    }
}

#[test]
fn management_late_audit_failure_rolls_back_name_and_revision() {
    use game_core::{management::*, EntityId, SafeInt};
    let dir = Directory::new();
    let path = dir.file("management-rollback.sqlite3");
    let store = Store::open(&path).unwrap();
    store.import_snapshot(&fixture("standalone-v2")).unwrap();
    let before = tables(&store, "standalone-v2");
    Connection::open(&path).unwrap().execute_batch("CREATE TRIGGER reject_management_audit BEFORE INSERT ON auditEvents BEGIN SELECT RAISE(ABORT,'injected audit failure'); END;").unwrap();
    let command = ManagementCommand {
        campaign_id: EntityId::new("standalone-v2").unwrap(),
        expected_revision: SafeInt::new(before["campaigns"][0]["revision"].as_i64().unwrap())
            .unwrap(),
        action_id: EntityId::new("management-fault-action").unwrap(),
        audit_id: EntityId::new("management-fault-audit").unwrap(),
        now: "2026-10-21T12:00:00.000Z".into(),
        action: ManagementAction::Rename {
            name: "Rejected rename".into(),
        },
    };
    assert!(store.manage(command.clone()).is_err());
    assert_eq!(tables(&store, "standalone-v2"), before);
    Connection::open(&path)
        .unwrap()
        .execute_batch("DROP TRIGGER reject_management_audit")
        .unwrap();
    assert!(!store.manage(command).unwrap().replayed);
    assert_eq!(
        tables(&store, "standalone-v2")["campaigns"][0]["revision"],
        before["campaigns"][0]["revision"].as_i64().unwrap() + 1
    );
}

#[test]
fn career_partial_insert_and_demo_reset_failures_preserve_previous_saves() {
    use game_core::{career::*, management::*, policy::Preset, EntityId, RulesMode, SafeInt};
    let dir = Directory::new();
    let path = dir.file("creation-rollback.sqlite3");
    let store = Store::open(&path).unwrap();
    store.import_snapshot(&fixture("save-b")).unwrap();
    let protected = tables(&store, "save-b");
    let id = |s: &str| EntityId::new(s).unwrap();
    let input = CareerInput {
        campaign_id: id(STANDALONE_DEMO_ID),
        name: "Standalone demo".into(),
        seed: "native-standalone-demo-v2".into(),
        start_year: SafeInt::new(2026).unwrap(),
        club_key: "club:01".into(),
        rules_mode: RulesMode::Sandbox,
        preset: Preset::Balanced,
        now: "2026-10-21T12:00:00.000Z".into(),
        season_id: id("fault-season"),
        clock_id: id("fault-clock"),
        constitution_id: id("fault-constitution"),
        allocation_id: id("fault-allocation"),
        receipt_id: id("fault-receipt"),
        audit_event_id: id("fault-audit"),
        action_id: id("fault-action"),
    };
    let prepared = prepare_standalone_career(&input).unwrap().into_tables();
    let request = CreationRequest {
        career: input.clone(),
        kind: CreationKind::StandaloneDemo,
        reset_revision: None,
    };
    Connection::open(&path).unwrap().execute_batch("CREATE TRIGGER reject_generated_player BEFORE INSERT ON players WHEN NEW.id LIKE '%player-0100' BEGIN SELECT RAISE(ABORT,'injected mid-world failure'); END;").unwrap();
    assert!(store
        .create(
            request.clone(),
            prepared.clone(),
            "creation-signature".into()
        )
        .is_err());
    assert_eq!(store.campaigns(0).unwrap().total.get(), 1);
    assert_eq!(tables(&store, "save-b"), protected);
    Connection::open(&path)
        .unwrap()
        .execute_batch("DROP TRIGGER reject_generated_player")
        .unwrap();
    store
        .create(
            request.clone(),
            prepared.clone(),
            "creation-signature".into(),
        )
        .unwrap();
    let before = tables(&store, STANDALONE_DEMO_ID);
    Connection::open(&path).unwrap().execute_batch("CREATE TRIGGER reject_reset_receipt BEFORE INSERT ON simulationReceipts BEGIN SELECT RAISE(ABORT,'injected reset failure'); END;").unwrap();
    let mut reset = request;
    reset.reset_revision = Some(SafeInt::new(0).unwrap());
    reset.career.action_id = id("reset-fault-action");
    let reset_prepared = prepare_standalone_career(&reset.career)
        .unwrap()
        .into_tables();
    assert!(store
        .create(
            reset.clone(),
            reset_prepared.clone(),
            "reset-signature".into()
        )
        .is_err());
    assert_eq!(tables(&store, STANDALONE_DEMO_ID), before);
    assert_eq!(tables(&store, "save-b"), protected);
    Connection::open(&path)
        .unwrap()
        .execute_batch("DROP TRIGGER reject_reset_receipt")
        .unwrap();
    store
        .create(reset, reset_prepared, "reset-signature".into())
        .unwrap();
    assert_eq!(tables(&store, "save-b"), protected);
    assert!(store.import_snapshot(&fixture("save-b")).is_ok());
}
struct Directory(PathBuf);
impl Directory {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "touchline-g03-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn file(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).unwrap();
    }
}
fn fixture(name: &str) -> Vec<u8> {
    support::fixture(name)
}

fn value(name: &str) -> Value {
    serde_json::from_slice(&fixture(name)).unwrap()
}
fn bytes(value: &Value) -> Vec<u8> {
    serde_json::to_vec(value).unwrap()
}
fn count(path: &Path, table: &str) -> i64 {
    Connection::open(path)
        .unwrap()
        .query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0))
        .unwrap()
}
fn tables(store: &Store, campaign: &str) -> Value {
    serde_json::to_value(
        store
            .export_snapshot(campaign, "test-export", "2026-10-20T12:00:00.000Z")
            .unwrap()
            .tables,
    )
    .unwrap()
}
fn sorted_tables(snapshot: &[u8]) -> Value {
    let mut tables = serde_json::to_value(parse_snapshot(snapshot).unwrap().tables).unwrap();
    for rows in tables.as_object_mut().unwrap().values_mut() {
        rows.as_array_mut()
            .unwrap()
            .sort_by(|a, b| a["id"].as_str().cmp(&b["id"].as_str()));
    }
    tables
}

#[test]
fn all_source_arrays_survive_close_reopen_native_export_and_reimport() {
    let dir = Directory::new();
    let path = dir.file("campaigns.sqlite3");
    let store = Store::open(&path).unwrap();
    for name in ["save-a", "save-b", "standalone-v2"] {
        let original = fixture(name);
        let outcome = store.import_snapshot(&original).unwrap();
        assert_eq!(outcome.campaign_id, name);
        assert_eq!(outcome.source_sha256.len(), 64);
        assert_eq!(tables(&store, name), sorted_tables(&original));
    }
    drop(store);
    let store = Store::open(&path).unwrap();
    let second = Store::open(dir.file("reimport.sqlite3")).unwrap();
    for name in ["save-a", "save-b", "standalone-v2"] {
        let exported = store
            .export_snapshot(name, "native-export", "2026-10-20T12:00:00.000Z")
            .unwrap();
        let encoded = serde_json::to_vec(&exported).unwrap();
        assert_eq!(store.read_campaign(name).unwrap(), exported.tables);
        assert_eq!(
            serde_json::from_slice::<Value>(&encoded).unwrap()["sourceStorage"],
            "sqlite"
        );
        second.import_snapshot(&encoded).unwrap();
        assert_eq!(tables(&second, name), sorted_tables(&fixture(name)));
    }
    assert_eq!(count(&path, "campaigns"), 3);
    assert_eq!(count(&path, "transportImports"), 3);
}

#[test]
fn unsupported_snapshots_leave_existing_standalone_rows_and_receipts_intact() {
    let dir = Directory::new();
    let path = dir.file("unsupported.sqlite3");
    let store = Store::open(&path).unwrap();
    store.import_snapshot(&fixture("save-a")).unwrap();
    let before = tables(&store, "save-a");
    for (pointer, input) in [
        ("/tables/campaigns/0/mode", json!("manual")),
        ("/sourceStorage", json!("indexeddb")),
        ("/sourceSchemaVersion", json!(1)),
        ("/tables/simulationStates", json!([])),
    ] {
        let mut invalid = value("save-b");
        *invalid.pointer_mut(pointer).unwrap() = input;
        assert!(store.import_snapshot(&bytes(&invalid)).is_err());
        assert_eq!(tables(&store, "save-a"), before);
        assert_eq!(count(&path, "campaigns"), 1);
        assert_eq!(count(&path, "transportImports"), 1);
    }
}

#[test]
fn earlier_native_schema_is_refused_without_modifying_the_file() {
    let dir = Directory::new();
    let path = dir.file("unsupported-version.sqlite3");
    let db = Connection::open(&path).unwrap();
    db.execute_batch("CREATE TABLE existing (value TEXT); INSERT INTO existing VALUES ('keep'); PRAGMA user_version = 1;").unwrap();
    drop(db);
    let before = std::fs::read(&path).unwrap();
    assert!(matches!(
        Store::open(&path),
        Err(StoreError::UnsupportedSchema(1))
    ));
    assert_eq!(std::fs::read(&path).unwrap(), before);
}

#[test]
fn exact_byte_retry_never_reverts_later_play_and_collision_refuses() {
    let dir = Directory::new();
    let path = dir.file("retry.sqlite3");
    let store = Store::open(&path).unwrap();
    let source = fixture("save-b");
    let first = store.import_snapshot(&source).unwrap();
    let db = Connection::open(&path).unwrap();
    db.execute(
        "UPDATE campaigns SET revision = revision + 1, name = 'Later play' WHERE id = 'save-b'",
        [],
    )
    .unwrap();
    assert_eq!(store.import_snapshot(&source).unwrap(), first);
    let after = store
        .export_snapshot("save-b", "after", "2026-10-20T12:00:00.000Z")
        .unwrap();
    assert_eq!(after.tables.campaigns[0].name, "Later play");
    assert_eq!(after.campaign_revision.get(), first.imported_revision + 1);
    let mut different = source.clone();
    different.push(b' ');
    assert!(matches!(
        store.import_snapshot(&different),
        Err(StoreError::Collision(_))
    ));
    assert_eq!(count(&path, "transportImports"), 1);
}

#[test]
fn injected_late_import_and_receipt_failures_roll_back_and_keep_other_save() {
    for failed_table in ["players", "transportImports"] {
        let dir = Directory::new();
        let path = dir.file("rollback.sqlite3");
        let store = Store::open(&path).unwrap();
        store.import_snapshot(&fixture("save-a")).unwrap();
        let before = tables(&store, "save-a");
        let db = Connection::open(&path).unwrap();
        db.execute_batch(&format!("CREATE TRIGGER fail_import BEFORE INSERT ON {failed_table} BEGIN SELECT RAISE(ABORT, 'injected failure'); END;")).unwrap();
        assert!(store.import_snapshot(&fixture("save-b")).is_err());
        assert_eq!(count(&path, "campaigns"), 1);
        assert_eq!(count(&path, "transportImports"), 1);
        assert_eq!(tables(&store, "save-a"), before);
        for table in [
            "seasons",
            "clubs",
            "players",
            "auditEvents",
            "ledgerEntries",
        ] {
            let remaining: i64 = db
                .query_row(
                    &format!("SELECT count(*) FROM {table} WHERE campaignId = 'save-b'"),
                    [],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(remaining, 0);
        }
        db.execute_batch("DROP TRIGGER fail_import;").unwrap();
        store.import_snapshot(&fixture("save-b")).unwrap();
    }
}

#[test]
fn invalid_scope_references_keys_numbers_and_versions_never_promote() {
    let dir = Directory::new();
    let path = dir.file("invalid.sqlite3");
    let store = Store::open(&path).unwrap();
    store.import_snapshot(&fixture("save-a")).unwrap();
    let mut variants = Vec::new();
    for (pointer, bad) in [
        ("/tables/players/0/campaignId", json!("save-a")),
        ("/tables/players/0/clubId", json!("save-a-club")),
        (
            "/tables/campaigns/0/activeSeasonId",
            json!("missing-season"),
        ),
        ("/tables/campaigns/0/managedClubId", json!("missing-club")),
        (
            "/tables/lineups/0/benchPlayerIds",
            json!(["missing-player"]),
        ),
        (
            "/tables/ledgerEntries/0/amountCents",
            json!(9_007_199_254_740_992_i64),
        ),
        ("/campaignRevision", json!(999)),
        ("/sourceSchemaVersion", json!(6)),
        ("/formatVersion", json!(2)),
    ] {
        let mut source = value("save-b");
        *source.pointer_mut(pointer).unwrap() = bad;
        variants.push(source);
    }
    let mut duplicate = value("save-b");
    let mut row = duplicate["tables"]["registrations"][0].clone();
    row["id"] = json!("duplicate-id");
    duplicate["tables"]["registrations"]
        .as_array_mut()
        .unwrap()
        .push(row);
    variants.push(duplicate);
    for source in variants {
        assert!(
            store.import_snapshot(&bytes(&source)).is_err(),
            "accepted {source}"
        );
    }
    assert!(store
        .import_snapshot(&vec![b' '; 32 * 1024 * 1024 + 1])
        .is_err());
    assert_eq!(count(&path, "campaigns"), 1);
    assert_eq!(count(&path, "transportImports"), 1);
}

#[test]
fn fresh_and_version_zero_upgrade_are_transactional_and_future_versions_refuse() {
    let dir = Directory::new();
    let path = dir.file("upgrade.sqlite3");
    // A real SQLite file at the empty native predecessor (schema 0).
    drop(Connection::open(&path).unwrap());
    let store = Store::open(&path).unwrap();
    let db = Connection::open(&path).unwrap();
    assert_eq!(
        db.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        5
    );
    assert_eq!(count(&path, "schemaMigrations"), 4);
    drop(store);
    drop(db);
    drop(Store::open(&path).unwrap());
    let db = Connection::open(&path).unwrap();
    db.pragma_update(None, "user_version", 99).unwrap();
    drop(db);
    assert!(matches!(
        Store::open(&path),
        Err(StoreError::UnsupportedSchema(99))
    ));
    assert_eq!(
        Connection::open(&path)
            .unwrap()
            .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        99
    );
    let unknown = dir.file("unknown.sqlite3");
    Connection::open(&unknown)
        .unwrap()
        .execute_batch("CREATE TABLE precious (value TEXT);")
        .unwrap();
    assert!(Store::open(&unknown).is_err());
    // Failure during a migration cannot leave half its tables or version behind.
    let mut db = Connection::open(dir.file("partial.sqlite3")).unwrap();
    {
        let tx = db.transaction().unwrap();
        assert!(tx
            .execute_batch(&format!("{INITIAL_MIGRATION}\nINVALID SQL;"))
            .is_err());
    }
    assert_eq!(
        db.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        0
    );
    assert_eq!(
        db.query_row("SELECT count(*) FROM sqlite_master", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
}

#[test]
fn sqlite_enforces_deferred_cycles_scoped_foreign_keys_uniques_and_indexes() {
    let dir = Directory::new();
    let path = dir.file("constraints.sqlite3");
    let store = Store::open(&path).unwrap();
    store.import_snapshot(&fixture("save-a")).unwrap();
    store.import_snapshot(&fixture("save-b")).unwrap();
    let mut db = Connection::open(&path).unwrap();
    db.pragma_update(None, "foreign_keys", true).unwrap();
    for sql in [
        "UPDATE campaigns SET activeSeasonId = 'save-a-season' WHERE id = 'save-b'",
        "UPDATE players SET clubId = 'save-a-club' WHERE campaignId = 'save-b'",
        "UPDATE campaigns SET managedClubId = 'missing' WHERE id = 'save-b'",
        "UPDATE contracts SET playerId = 'missing' WHERE campaignId = 'save-b'",
        "UPDATE registrations SET seasonId = 'missing' WHERE campaignId = 'save-b'",
        "UPDATE campaigns SET revision = 9007199254740992 WHERE id = 'save-b'",
        "UPDATE ledgerEntries SET amountCents = -1 WHERE campaignId = 'save-b'",
        "UPDATE offers SET status = 'future-status' WHERE campaignId = 'save-b'",
        "UPDATE players SET id = 'bad id' WHERE campaignId = 'save-b'",
    ] {
        assert!(db.execute(sql, []).is_err(), "accepted {sql}");
    }
    for (table, change) in [
        ("seasons", "ordinal"),
        ("constitutions", "version"),
        ("registrations", "competitionKey"),
        ("shortlistItems", "playerId"),
        ("developmentPlans", "playerId"),
        ("auditEvents", "actionId"),
        ("simulationStates", "campaignId"),
        ("clubSimulationStates", "clubId"),
        ("playerSimulationStates", "playerId"),
        ("simulationReceipts", "operationKey"),
    ] {
        let columns = db
            .prepare(&format!("PRAGMA table_info({table})"))
            .unwrap()
            .query_map([], |r| r.get::<_, String>(1))
            .unwrap()
            .collect::<std::result::Result<Vec<_>, _>>()
            .unwrap();
        assert!(columns.iter().any(|c| c == change));
        let selection = columns
            .iter()
            .map(|c| if c == "id" { "'duplicate'" } else { c.as_str() })
            .collect::<Vec<_>>()
            .join(",");
        assert!(db.execute(&format!("INSERT INTO {table} SELECT {selection} FROM {table} WHERE campaignId = 'save-b' LIMIT 1"), []).is_err(), "missing unique on {table}");
    }
    let indexes: i64 = db
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(indexes > 45);
    // A deferred dangling campaign/season cycle fails at commit and fully rolls back.
    {
        let tx = db.transaction().unwrap();
        tx.execute(
            "UPDATE campaigns SET activeSeasonId = 'missing' WHERE id = 'save-b'",
            [],
        )
        .unwrap();
        assert!(tx.commit().is_err());
    }
    assert_eq!(tables(&store, "save-b"), sorted_tables(&fixture("save-b")));
    // Deletion cascades within one scope, including the transport receipt.
    {
        let tx = db.transaction().unwrap();
        tx.execute("DELETE FROM campaigns WHERE id = ?1", params!["save-b"])
            .unwrap();
        tx.commit().unwrap();
    }
    assert_eq!(count(&path, "transportImports"), 1);
    assert_eq!(tables(&store, "save-a"), sorted_tables(&fixture("save-a")));
}

#[test]
fn online_backup_reopens_wal_data_and_preserves_previous_target_on_failure() {
    let dir = Directory::new();
    let path = dir.file("live.sqlite3");
    let target = dir.file("backup.sqlite3");
    let store = Store::open(&path).unwrap();
    let imported = store.import_snapshot(&fixture("save-b")).unwrap();
    let db = Connection::open(&path).unwrap();
    db.pragma_update(None, "wal_autocheckpoint", 0).unwrap();
    db.execute(
        "UPDATE campaigns SET name = 'In WAL', revision = revision + 1",
        [],
    )
    .unwrap();
    assert!(PathBuf::from(format!("{}-wal", path.display())).exists());
    store.backup(&target).unwrap();
    let saved = std::fs::read(&target).unwrap();
    let restored = Store::open(&target).unwrap();
    assert_eq!(tables(&restored, "save-b"), tables(&store, "save-b"));
    assert_eq!(
        restored.import_snapshot(&fixture("save-b")).unwrap(),
        imported
    );
    drop(restored);
    // Successful replacement of an existing closed backup is supported on Windows.
    store.backup(&target).unwrap();
    assert_eq!(std::fs::read(&target).unwrap(), saved);
    // The backup passes physical checks but fails model validation; do not promote it.
    db.execute("UPDATE campaigns SET name = ''", []).unwrap();
    assert!(store.backup(&target).is_err());
    assert_eq!(std::fs::read(&target).unwrap(), saved);
    assert!(store.backup(&path).is_err());
    assert!(store
        .backup(PathBuf::from(format!("{}-wal", path.display())))
        .is_err());
    assert!(!std::fs::read_dir(&dir.0).unwrap().any(|entry| entry
        .unwrap()
        .file_name()
        .to_string_lossy()
        .starts_with(".touchline-backup-")));
}

#[test]
fn app_local_paths_are_stable_and_isolated() {
    let root = Path::new("app-local");
    assert_eq!(
        database_path(root, "production").unwrap(),
        root.join("touchline.sqlite3")
    );
    assert_ne!(
        database_path(root, "dev").unwrap(),
        database_path(root, "test").unwrap()
    );
    assert!(database_path(root, "../production").is_err());
}

#[test]
fn injected_advance_failure_rolls_back_clock_revision_audit_and_receipt() {
    use game_core::{progression::AdvanceRequest, EntityId, SafeInt};
    let dir = Directory::new();
    let path = dir.file("advance-rollback.sqlite3");
    let store = Store::open(&path).unwrap();
    store.import_snapshot(&fixture("standalone-v2")).unwrap();
    Connection::open(&path).unwrap().execute(
        "UPDATE simulationStates SET lastBoundaryKey='season:standalone-v2-season:market:2026-07-01' WHERE campaignId='standalone-v2'",
        [],
    ).unwrap();
    let before = tables(&store, "standalone-v2");
    let request = AdvanceRequest {
        campaign_id: EntityId::new("standalone-v2").unwrap(),
        expected_revision: SafeInt::new(before["campaigns"][0]["revision"].as_i64().unwrap())
            .unwrap(),
        source_date: "2026-07-01".into(),
        source_boundary_key: Some("season:standalone-v2-season:market:2026-07-01".into()),
        target_boundary_key: "season:standalone-v2-season:summer-date:2026-07-08".into(),
        action_id: EntityId::new("advance-fault-action").unwrap(),
        audit_id: EntityId::new("advance-fault-audit").unwrap(),
        receipt_id: EntityId::new("advance-fault-receipt").unwrap(),
        now: "2026-10-22T08:00:00.000Z".into(),
    };
    Connection::open(&path).unwrap().execute_batch("CREATE TRIGGER reject_advance_audit BEFORE INSERT ON auditEvents BEGIN SELECT RAISE(ABORT,'injected advance failure'); END;").unwrap();
    assert!(store.advance(request.clone()).is_err());
    assert_eq!(tables(&store, "standalone-v2"), before);
    Connection::open(&path)
        .unwrap()
        .execute_batch("DROP TRIGGER reject_advance_audit")
        .unwrap();
    let outcome = store.advance(request.clone()).unwrap();
    assert!(!outcome.replayed);
    assert_eq!(outcome.current_date, "2026-07-08");
    let saved = tables(&store, "standalone-v2");
    assert_eq!(saved["simulationStates"][0]["currentDate"], "2026-07-08");
    assert_eq!(
        saved["campaigns"][0]["revision"],
        before["campaigns"][0]["revision"].as_i64().unwrap() + 1
    );
    assert_eq!(
        saved["simulationReceipts"].as_array().unwrap().len(),
        before["simulationReceipts"].as_array().unwrap().len() + 1
    );
    assert_eq!(
        saved["players"].as_array().unwrap().len(),
        before["players"].as_array().unwrap().len()
    );
    let replay = store.advance(request).unwrap();
    assert!(replay.replayed);
    assert_eq!(replay.revision.get(), outcome.revision.get());
    assert_eq!(
        tables(&store, "standalone-v2")["campaigns"][0]["revision"],
        saved["campaigns"][0]["revision"]
    );
}

#[test]
fn concurrent_retries_share_one_commit_and_reads_use_committed_wal_state() {
    let dir = Directory::new();
    let path = dir.file("concurrent.sqlite3");
    let store = std::sync::Arc::new(Store::open(&path).unwrap());
    let threads = (0..6)
        .map(|_| {
            let store = store.clone();
            std::thread::spawn(move || store.import_snapshot(&fixture("save-b")).unwrap())
        })
        .collect::<Vec<_>>();
    let outcomes = threads
        .into_iter()
        .map(|thread| thread.join().unwrap())
        .collect::<Vec<_>>();
    assert!(outcomes.iter().all(|outcome| outcome == &outcomes[0]));
    assert_eq!(count(&path, "transportImports"), 1);
    let before = tables(&store, "save-b");
    let mut writer = Connection::open(&path).unwrap();
    let transaction = writer.transaction().unwrap();
    transaction
        .execute(
            "UPDATE campaigns SET revision = revision + 1, name = 'Next revision'",
            [],
        )
        .unwrap();
    transaction
        .execute("UPDATE players SET name = 'Next player'", [])
        .unwrap();
    // A concurrent uncommitted write cannot leak half a revision into an export.
    assert_eq!(tables(&store, "save-b"), before);
    assert_eq!(
        serde_json::to_value(store.read_campaign("save-b").unwrap()).unwrap(),
        before
    );
    transaction.commit().unwrap();
    let after = tables(&store, "save-b");
    assert_eq!(
        serde_json::to_value(store.read_campaign("save-b").unwrap()).unwrap(),
        after
    );
    assert_eq!(after["campaigns"][0]["name"], "Next revision");
    assert_eq!(after["players"][0]["name"], "Next player");
    assert_eq!(
        after["campaigns"][0]["revision"].as_i64().unwrap(),
        before["campaigns"][0]["revision"].as_i64().unwrap() + 1
    );
}

#[test]
fn schema_four_upgrades_preserving_market_and_match_rows() {
    let dir = Directory::new();
    let path = dir.file("schema-four.sqlite3");
    let mut db = Connection::open(&path).unwrap();
    db.execute_batch(INITIAL_MIGRATION).unwrap();
    db.execute_batch(MATCHDAY_MIGRATION).unwrap();
    db.execute_batch(game_store::MARKET_MIGRATION).unwrap();
    let source = market_source();
    insert_rows(&mut db, &source);
    drop(db);
    let store = Store::open(&path).unwrap();
    assert_eq!(tables(&store, "save-b"), sorted_tables(&bytes(&source)));
    for table in [
        "boardObjectives",
        "seasonSettlements",
        "developmentSnapshots",
    ] {
        assert_eq!(count(&path, table), 0);
    }
    assert_eq!(count(&path, "negotiations"), 1);
    assert_eq!(count(&path, "simulatedMatches"), 1);
    assert_eq!(count(&path, "campaigns"), 1);
    assert_eq!(count(&path, "schemaMigrations"), 4);
    let exported = store
        .export_snapshot("save-b", "export", "2026-10-24T12:00:00.000Z")
        .unwrap();
    assert_eq!(exported.source_schema_version.get(), 5);
    assert!(exported.tables.board_objectives.is_empty());
    assert!(exported.tables.season_settlements.is_empty());
    assert!(exported.tables.development_snapshots.is_empty());
    assert_eq!(
        Connection::open(path)
            .unwrap()
            .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        5
    );
}

fn lifecycle_source() -> Value {
    let mut source = market_source();
    source["sourceSchemaVersion"] = json!(5);
    let t = &mut source["tables"];
    let campaign = t["campaigns"][0]["id"].clone();
    let season = t["seasons"][0]["id"].clone();
    let club = t["clubs"][0]["id"].clone();
    let player = t["players"][0]["id"].clone();
    t["boardObjectives"] = json!([{"id":"objective-1", "campaignId":campaign, "seasonId":season,
        "clubId":club, "kind":"top_half", "targetPosition":9, "rewardCents":1000,
        "outcome":"pending", "engineVersion":"1"}]);
    t["seasonSettlements"] = json!([{"id":"settlement-1", "campaignId":campaign, "seasonId":season,
        "nextSeasonId":season, "engineVersion":"1", "settledOn":"2027-06-30",
        "managedPosition":9, "prizeCents":1000, "objectiveBonusCents":1000,
        "carryoverCents":0, "allocationCents":0, "tableJson":"[]"}]);
    let mut development = json!({"id":"development-1", "campaignId":campaign, "seasonId":season,
        "playerId":player, "period":"midseason", "beforeValueCents":1000, "afterValueCents":1100,
        "beforeStatus":"active", "afterStatus":"active", "points":1, "engineVersion":"1"});
    for prefix in ["before", "after"] {
        for attribute in [
            "Pace",
            "Finishing",
            "Passing",
            "Dribbling",
            "Defending",
            "Physical",
        ] {
            development[format!("{prefix}{attribute}")] = json!(50);
        }
    }
    t["developmentSnapshots"] = json!([development]);
    let mut ledger = t["ledgerEntries"][0].clone();
    ledger["id"] = json!("award-1");
    ledger["kind"] = json!("prize_income");
    ledger["earningSeasonId"] = season;
    ledger["settlementId"] = json!("settlement-1");
    ledger["awardKind"] = json!("top_half");
    t["ledgerEntries"].as_array_mut().unwrap().push(ledger);
    t["simulationReceipts"][0]["outcomeRefs"] = json!([
        {"kind":"settlement", "id":"settlement-1"}, {"kind":"objective", "id":"objective-1"},
        {"kind":"development", "id":"development-1"}]);
    t["auditEvents"][0]["actionType"] = json!("season.settle");
    source
}

#[test]
fn lifecycle_rows_round_trip_reopen_and_enforce_sql_contracts() {
    let dir = Directory::new();
    let path = dir.file("lifecycle.sqlite3");
    let source = lifecycle_source();
    let store = Store::open(&path).unwrap();
    store.import_snapshot(&bytes(&source)).unwrap();
    drop(store);
    let store = Store::open(&path).unwrap();
    let export = store
        .export_snapshot("save-b", "export", "2026-10-24T12:00:00.000Z")
        .unwrap();
    assert_eq!(export.source_schema_version.get(), 5);
    assert_eq!(export.tables.board_objectives.len(), 1);
    assert_eq!(export.tables.season_settlements[0].table_json, "[]");
    assert_eq!(export.tables.development_snapshots[0].points.get(), 1);
    let other = Store::open(dir.file("reimport.sqlite3")).unwrap();
    other
        .import_snapshot(&serde_json::to_vec(&export).unwrap())
        .unwrap();
    assert_eq!(tables(&other, "save-b"), sorted_tables(&bytes(&source)));
    let db = Connection::open(&path).unwrap();
    db.pragma_update(None, "foreign_keys", true).unwrap();
    for table in [
        "boardObjectives",
        "seasonSettlements",
        "developmentSnapshots",
    ] {
        let columns = db
            .prepare(&format!("PRAGMA table_info({table})"))
            .unwrap()
            .query_map([], |r| r.get::<_, String>(1))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        let selection = columns
            .iter()
            .map(|c| if c == "id" { "'duplicate'" } else { c })
            .collect::<Vec<_>>()
            .join(",");
        assert!(db
            .execute(
                &format!("INSERT INTO {table} SELECT {selection} FROM {table}"),
                []
            )
            .is_err());
    }
    for sql in [
        "UPDATE developmentSnapshots SET points=5",
        "UPDATE developmentSnapshots SET engineVersion='2'",
        "UPDATE developmentSnapshots SET afterPace=101",
        "UPDATE boardObjectives SET rewardCents=-1",
        "UPDATE seasonSettlements SET nextSeasonId='missing'",
        "UPDATE auditEvents SET actionType='development.apply'",
    ] {
        let result = db.execute(sql, []);
        if sql.contains("development.apply") {
            assert!(result.is_ok());
        } else {
            assert!(result.is_err(), "accepted {sql}");
        }
    }
}

#[test]
fn invalid_lifecycle_data_is_rejected_before_import() {
    let dir = Directory::new();
    let path = dir.file("invalid-lifecycle.sqlite3");
    let store = Store::open(&path).unwrap();
    for (pointer, bad) in [
        ("/tables/developmentSnapshots/0/points", json!(5)),
        ("/tables/developmentSnapshots/0/engineVersion", json!("2")),
        ("/tables/developmentSnapshots/0/beforePace", json!(-1)),
        ("/tables/boardObjectives/0/rewardCents", json!(-1)),
        ("/tables/ledgerEntries/1/kind", json!("player_sale")),
        ("/tables/ledgerEntries/1/awardKind", json!(null)),
        (
            "/tables/seasonSettlements/0/tableJson",
            json!("[{\"unexpected\":1}]"),
        ),
        ("/tables/seasonSettlements/0/nextSeasonId", json!("missing")),
        (
            "/tables/simulationReceipts/0/outcomeRefs/0/id",
            json!("missing"),
        ),
    ] {
        let mut source = lifecycle_source();
        *source.pointer_mut(pointer).unwrap() = bad;
        assert!(
            store.import_snapshot(&bytes(&source)).is_err(),
            "accepted {pointer}"
        );
    }
    let mut partial = lifecycle_source();
    partial["tables"]["ledgerEntries"][1]
        .as_object_mut()
        .unwrap()
        .remove("settlementId");
    partial["tables"]["ledgerEntries"][1]
        .as_object_mut()
        .unwrap()
        .remove("awardKind");
    assert!(store.import_snapshot(&bytes(&partial)).is_err());
    for table in [
        "boardObjectives",
        "seasonSettlements",
        "developmentSnapshots",
    ] {
        let mut source = lifecycle_source();
        let mut row = source["tables"][table][0].clone();
        row["id"] = json!("duplicate");
        source["tables"][table].as_array_mut().unwrap().push(row);
        assert!(store.import_snapshot(&bytes(&source)).is_err());
    }
    assert_eq!(count(&path, "campaigns"), 0);
}

#[test]
fn settlement_table_json_requires_the_bounded_compact_shape() {
    let mut source = lifecycle_source();
    let row = json!({"clubKey":"club:one", "leagueTier":1, "position":1,
        "points":80, "goalDifference":42, "goalsFor":65, "prizeCents":1000});
    source["tables"]["seasonSettlements"][0]["tableJson"] =
        json!(Value::Array(vec![row.clone(); 72]).to_string());
    assert!(parse_snapshot(&bytes(&source)).is_ok());
    source["tables"]["seasonSettlements"][0]["tableJson"] =
        json!(Value::Array(vec![row.clone(); 73]).to_string());
    assert!(parse_snapshot(&bytes(&source)).is_err());
    for (key, bad) in [
        ("extra", json!(true)),
        ("points", json!(null)),
        ("prizeCents", json!(-1)),
        ("leagueTier", json!(5)),
    ] {
        let mut malformed = row.clone();
        malformed[key] = bad;
        source["tables"]["seasonSettlements"][0]["tableJson"] =
            json!(json!([malformed]).to_string());
        assert!(parse_snapshot(&bytes(&source)).is_err());
    }
}
