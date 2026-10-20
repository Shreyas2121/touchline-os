use game_core::parse_snapshot;
use game_store::{database_path, Store, StoreError, INITIAL_MIGRATION};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static SEQUENCE: AtomicU64 = AtomicU64::new(0);
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
    let bytes = match name {
        "legacy-v1" => {
            include_bytes!("../../../../compatibility/snapshots/legacy-v1.json").as_slice()
        }
        "legacy-v2" => {
            include_bytes!("../../../../compatibility/snapshots/legacy-v2.json").as_slice()
        }
        "standalone-v2" => {
            include_bytes!("../../../../compatibility/snapshots/standalone-v2.json").as_slice()
        }
        _ => panic!("unknown fixture"),
    };
    bytes.to_vec()
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
    for name in ["legacy-v1", "legacy-v2", "standalone-v2"] {
        let original = fixture(name);
        let outcome = store.import_snapshot(&original).unwrap();
        assert_eq!(outcome.campaign_id, name);
        assert_eq!(outcome.source_sha256.len(), 64);
        assert_eq!(tables(&store, name), sorted_tables(&original));
    }
    drop(store);
    let store = Store::open(&path).unwrap();
    let second = Store::open(dir.file("reimport.sqlite3")).unwrap();
    for name in ["legacy-v1", "legacy-v2", "standalone-v2"] {
        let exported = store
            .export_snapshot(name, "native-export", "2026-10-20T12:00:00.000Z")
            .unwrap();
        let encoded = serde_json::to_vec(&exported).unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(&encoded).unwrap()["sourceStorage"],
            "sqlite"
        );
        second.import_snapshot(&encoded).unwrap();
        assert_eq!(tables(&second, name), sorted_tables(&fixture(name)));
    }
    assert_eq!(count(&path, "campaigns"), 3);
    assert_eq!(count(&path, "transportImports"), 3);
    // Frozen source fixtures are input only, never opened for writing.
    assert_eq!(
        fixture("legacy-v1"),
        include_bytes!("../../../../compatibility/snapshots/legacy-v1.json")
    );
}

#[test]
fn exact_byte_retry_never_reverts_later_play_and_collision_refuses() {
    let dir = Directory::new();
    let path = dir.file("retry.sqlite3");
    let store = Store::open(&path).unwrap();
    let source = fixture("legacy-v2");
    let first = store.import_snapshot(&source).unwrap();
    let db = Connection::open(&path).unwrap();
    db.execute(
        "UPDATE campaigns SET revision = revision + 1, name = 'Later play' WHERE id = 'legacy-v2'",
        [],
    )
    .unwrap();
    assert_eq!(store.import_snapshot(&source).unwrap(), first);
    let after = store
        .export_snapshot("legacy-v2", "after", "2026-10-20T12:00:00.000Z")
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
        store.import_snapshot(&fixture("legacy-v1")).unwrap();
        let before = tables(&store, "legacy-v1");
        let db = Connection::open(&path).unwrap();
        db.execute_batch(&format!("CREATE TRIGGER fail_import BEFORE INSERT ON {failed_table} BEGIN SELECT RAISE(ABORT, 'injected failure'); END;")).unwrap();
        assert!(store.import_snapshot(&fixture("legacy-v2")).is_err());
        assert_eq!(count(&path, "campaigns"), 1);
        assert_eq!(count(&path, "transportImports"), 1);
        assert_eq!(tables(&store, "legacy-v1"), before);
        for table in [
            "seasons",
            "clubs",
            "players",
            "auditEvents",
            "ledgerEntries",
        ] {
            let remaining: i64 = db
                .query_row(
                    &format!("SELECT count(*) FROM {table} WHERE campaignId = 'legacy-v2'"),
                    [],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(remaining, 0);
        }
        db.execute_batch("DROP TRIGGER fail_import;").unwrap();
        store.import_snapshot(&fixture("legacy-v2")).unwrap();
    }
}

#[test]
fn invalid_scope_references_keys_numbers_and_versions_never_promote() {
    let dir = Directory::new();
    let path = dir.file("invalid.sqlite3");
    let store = Store::open(&path).unwrap();
    store.import_snapshot(&fixture("legacy-v1")).unwrap();
    let mut variants = Vec::new();
    for (pointer, bad) in [
        ("/tables/players/0/campaignId", json!("legacy-v1")),
        ("/tables/players/0/clubId", json!("legacy-v1-club")),
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
        ("/sourceSchemaVersion", json!(3)),
        ("/formatVersion", json!(2)),
    ] {
        let mut source = value("legacy-v2");
        *source.pointer_mut(pointer).unwrap() = bad;
        variants.push(source);
    }
    let mut duplicate = value("legacy-v2");
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
fn only_v1_missing_metadata_is_normalized() {
    let dir = Directory::new();
    let store = Store::open(dir.file("v1.sqlite3")).unwrap();
    let mut source = value("legacy-v1");
    let campaign = source["tables"]["campaigns"][0].as_object_mut().unwrap();
    campaign.remove("mode");
    campaign.remove("rulesMode");
    for key in [
        "simulationStates",
        "clubSimulationStates",
        "playerSimulationStates",
        "simulationReceipts",
    ] {
        source["tables"].as_object_mut().unwrap().remove(key);
    }
    store.import_snapshot(&bytes(&source)).unwrap();
    assert_eq!(
        tables(&store, "legacy-v1"),
        sorted_tables(&fixture("legacy-v1"))
    );
    source["sourceSchemaVersion"] = json!(2);
    assert!(store.import_snapshot(&bytes(&source)).is_err());
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
        1
    );
    assert_eq!(count(&path, "schemaMigrations"), 1);
    drop(store);
    drop(db);
    drop(Store::open(&path).unwrap());
    let db = Connection::open(&path).unwrap();
    db.pragma_update(None, "user_version", 2).unwrap();
    drop(db);
    assert!(matches!(
        Store::open(&path),
        Err(StoreError::UnsupportedSchema(2))
    ));
    assert_eq!(
        Connection::open(&path)
            .unwrap()
            .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        2
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
    store.import_snapshot(&fixture("legacy-v1")).unwrap();
    store.import_snapshot(&fixture("legacy-v2")).unwrap();
    let mut db = Connection::open(&path).unwrap();
    db.pragma_update(None, "foreign_keys", true).unwrap();
    for sql in [
        "UPDATE campaigns SET activeSeasonId = 'legacy-v1-season' WHERE id = 'legacy-v2'",
        "UPDATE players SET clubId = 'legacy-v1-club' WHERE campaignId = 'legacy-v2'",
        "UPDATE campaigns SET managedClubId = 'missing' WHERE id = 'legacy-v2'",
        "UPDATE contracts SET playerId = 'missing' WHERE campaignId = 'legacy-v2'",
        "UPDATE registrations SET seasonId = 'missing' WHERE campaignId = 'legacy-v2'",
        "UPDATE campaigns SET revision = 9007199254740992 WHERE id = 'legacy-v2'",
        "UPDATE ledgerEntries SET amountCents = -1 WHERE campaignId = 'legacy-v2'",
        "UPDATE offers SET status = 'future-status' WHERE campaignId = 'legacy-v2'",
        "UPDATE players SET id = 'bad id' WHERE campaignId = 'legacy-v2'",
    ] {
        assert!(db.execute(sql, []).is_err(), "accepted {sql}");
    }
    for (table, change) in [
        ("seasons", "ordinal"),
        ("constitutions", "version"),
        ("registrations", "competitionKey"),
        ("appearances", "playerId"),
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
        assert!(db.execute(&format!("INSERT INTO {table} SELECT {selection} FROM {table} WHERE campaignId = 'legacy-v2' LIMIT 1"), []).is_err(), "missing unique on {table}");
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
            "UPDATE campaigns SET activeSeasonId = 'missing' WHERE id = 'legacy-v2'",
            [],
        )
        .unwrap();
        assert!(tx.commit().is_err());
    }
    assert_eq!(
        tables(&store, "legacy-v2"),
        sorted_tables(&fixture("legacy-v2"))
    );
    // Deletion cascades within one scope, including the transport receipt.
    {
        let tx = db.transaction().unwrap();
        tx.execute("DELETE FROM campaigns WHERE id = ?1", params!["legacy-v2"])
            .unwrap();
        tx.commit().unwrap();
    }
    assert_eq!(count(&path, "transportImports"), 1);
    assert_eq!(
        tables(&store, "legacy-v1"),
        sorted_tables(&fixture("legacy-v1"))
    );
}

#[test]
fn online_backup_reopens_wal_data_and_preserves_previous_target_on_failure() {
    let dir = Directory::new();
    let path = dir.file("live.sqlite3");
    let target = dir.file("backup.sqlite3");
    let store = Store::open(&path).unwrap();
    let imported = store.import_snapshot(&fixture("legacy-v2")).unwrap();
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
    assert_eq!(tables(&restored, "legacy-v2"), tables(&store, "legacy-v2"));
    assert_eq!(
        restored.import_snapshot(&fixture("legacy-v2")).unwrap(),
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
fn concurrent_retries_share_one_commit_and_reads_use_committed_wal_state() {
    let dir = Directory::new();
    let path = dir.file("concurrent.sqlite3");
    let store = std::sync::Arc::new(Store::open(&path).unwrap());
    let threads = (0..6)
        .map(|_| {
            let store = store.clone();
            std::thread::spawn(move || store.import_snapshot(&fixture("legacy-v2")).unwrap())
        })
        .collect::<Vec<_>>();
    let outcomes = threads
        .into_iter()
        .map(|thread| thread.join().unwrap())
        .collect::<Vec<_>>();
    assert!(outcomes.iter().all(|outcome| outcome == &outcomes[0]));
    assert_eq!(count(&path, "transportImports"), 1);
    let before = tables(&store, "legacy-v2");
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
    assert_eq!(tables(&store, "legacy-v2"), before);
    transaction.commit().unwrap();
    let after = tables(&store, "legacy-v2");
    assert_eq!(after["campaigns"][0]["name"], "Next revision");
    assert_eq!(after["players"][0]["name"], "Next player");
    assert_eq!(
        after["campaigns"][0]["revision"].as_i64().unwrap(),
        before["campaigns"][0]["revision"].as_i64().unwrap() + 1
    );
}
