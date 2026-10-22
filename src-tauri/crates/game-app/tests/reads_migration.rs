#[path = "../../../test-support.rs"]
mod support;
use game_app::*;
use game_core::{parse_snapshot, policy::PolicyAction, MoneyCents};
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT: AtomicU64 = AtomicU64::new(0);
struct Dir(PathBuf);
impl Dir {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "touchline-g06-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn file(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}
impl Drop for Dir {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).unwrap();
    }
}
fn fixture(name: &str) -> Vec<u8> {
    support::fixture(name)
}

fn query(campaign: &str, screen: Screen) -> ScreenQuery {
    ScreenQuery {
        campaign_id: EntityId::new(campaign).unwrap(),
        screen,
        page: SafeInt::new(0).unwrap(),
        search: String::new(),
        all_players: false,
    }
}
fn tables(store: &NativeStore, id: &str) -> Value {
    serde_json::to_value(
        store
            .export_snapshot(id, "test-export", "2026-10-20T12:00:00.000Z")
            .unwrap()
            .tables,
    )
    .unwrap()
}

#[test]
fn every_screen_reads_scoped_saved_rows_and_revision_without_mutation() {
    let dir = Dir::new();
    let path = dir.file("saves.sqlite3");
    let store = NativeStore::open(&path).unwrap();
    for name in ["save-a", "save-b", "standalone-v2"] {
        store.import_snapshot(&fixture(name)).unwrap();
    }
    assert_eq!(store.campaigns(0).unwrap().total.get(), 3);
    assert!(store.campaigns(-1).is_err());
    let screens = [
        Screen::CommandCenter,
        Screen::Squad,
        Screen::Tactics,
        Screen::Transfers,
        Screen::Finance,
        Screen::Registration,
        Screen::Scouting,
        Screen::Matches,
        Screen::Seasons,
        Screen::Constitution,
    ];
    for name in ["save-a", "save-b", "standalone-v2"] {
        let before = tables(&store, name);
        for screen in screens {
            let result = read_screen(&store, query(name, screen)).unwrap();
            assert_eq!(result.rows.campaigns[0].id.as_str(), name);
            assert_eq!(
                result.revision.get(),
                before["campaigns"][0]["revision"].as_i64().unwrap()
            );
            let rows = serde_json::to_value(&result.rows).unwrap();
            for (table, values) in rows.as_object().unwrap() {
                assert!(values.as_array().unwrap().len() <= 100, "{table}");
                for row in values.as_array().unwrap() {
                    if table != "campaigns" {
                        assert_eq!(row["campaignId"], name);
                    }
                }
            }
            if screen == Screen::Squad {
                assert_eq!(result.player_facts.len(), result.rows.players.len());
                assert!(
                    result
                        .rows
                        .players
                        .iter()
                        .all(|p| p.club_id.as_ref()
                            == Some(&result.rows.campaigns[0].managed_club_id))
                );
                for player in &result.rows.players {
                    assert!(store
                        .player(EntityId::new("missing-save").unwrap(), player.id.clone())
                        .is_err());
                }
            }
        }
        assert_eq!(tables(&store, name), before);
    }
    drop(store);
    let reopened = NativeStore::open(path).unwrap();
    assert_eq!(reopened.campaigns(0).unwrap().total.get(), 3);
    assert!(read_screen(&reopened, query("missing", Screen::Finance)).is_err());
}

#[test]
fn player_paging_search_and_invalid_queries_are_bounded() {
    let dir = Dir::new();
    let store = NativeStore::open(dir.file("pages.sqlite3")).unwrap();
    let mut source: Value = serde_json::from_slice(&fixture("save-b")).unwrap();
    let base = source["tables"]["players"][0].clone();
    for i in 0..121 {
        let mut player = base.clone();
        player["id"] = json!(format!("extra-player-{i:03}"));
        player["name"] = json!(format!("Query Player {i:03}"));
        source["tables"]["players"]
            .as_array_mut()
            .unwrap()
            .push(player);
    }
    store
        .import_snapshot(&serde_json::to_vec(&source).unwrap())
        .unwrap();
    let mut q = query("save-b", Screen::Transfers);
    q.all_players = true;
    q.search = "Query Player".into();
    let first = read_screen(&store, q.clone()).unwrap();
    assert_eq!(first.rows.players.len(), 50);
    assert_eq!(first.totals["players"].get(), 121);
    q.page = SafeInt::new(1).unwrap();
    let second = read_screen(&store, q.clone()).unwrap();
    assert_eq!(second.rows.players.len(), 50);
    assert!(second
        .rows
        .players
        .iter()
        .all(|p| !first.rows.players.iter().any(|a| a.id == p.id)));
    q.page = SafeInt::new(2).unwrap();
    assert_eq!(
        read_screen(&store, q.clone()).unwrap().rows.players.len(),
        21
    );
    q.search = "%_'; DROP TABLE players;--".into();
    assert!(read_screen(&store, q.clone())
        .unwrap()
        .rows
        .players
        .is_empty());
    q.page = SafeInt::new(-1).unwrap();
    assert!(read_screen(&store, q.clone()).is_err());
    q.page = SafeInt::new(0).unwrap();
    q.search = "x".repeat(121);
    assert!(read_screen(&store, q).is_err());
}

#[test]
fn previews_use_persisted_finance_policy_and_reject_stale_invalid_inputs() {
    let dir = Dir::new();
    let store = NativeStore::open(dir.file("preview.sqlite3")).unwrap();
    store.import_snapshot(&fixture("standalone-v2")).unwrap();
    let model = read_screen(&store, query("standalone-v2", Screen::Finance)).unwrap();
    let before = tables(&store, "standalone-v2");
    let mut input = PreviewQuery {
        campaign_id: EntityId::new("standalone-v2").unwrap(),
        expected_revision: model.revision,
        effective_date: "2025-07-01".into(),
        action: PolicyAction::IncomingTransfer {
            fee_cents: MoneyCents::new(1_000_000_000).unwrap(),
            age: Some(SafeInt::new(40).unwrap()),
            is_free: false,
            weekly_wage_cents: Some(MoneyCents::new(100_000_000).unwrap()),
            squad_tier: Some(game_core::SquadTier::Key),
        },
    };
    let result = preview(&store, input.clone()).unwrap();
    assert_eq!(result.before_capacity, model.finance.unwrap().capacity);
    assert!(!result.report.allowed);
    assert!(!result.report.verdicts.is_empty());
    input.expected_revision = SafeInt::new(model.revision.get() + 1).unwrap();
    assert!(preview(&store, input.clone()).is_err());
    input.expected_revision = model.revision;
    input.effective_date = "2025-02-29".into();
    assert!(preview(&store, input).is_err());
    assert_eq!(tables(&store, "standalone-v2"), before);
}

#[test]
fn dialog_session_cancel_validation_retained_bytes_retry_and_collision_preserve_source() {
    let dir = Dir::new();
    let store = NativeStore::open(dir.file("migration.sqlite3")).unwrap();
    let session = MigrationSession::default();
    let source = dir.file("source.json");
    let bytes = fixture("save-b");
    std::fs::write(&source, &bytes).unwrap();
    assert!(session.select(None).unwrap().is_none());
    assert!(session.confirm(&store, "unknown").is_err());
    let summary = session.select(Some(&source)).unwrap().unwrap();
    assert_eq!(summary.campaign.id.as_str(), "save-b");
    assert_eq!(store.campaigns(0).unwrap().total.get(), 0);
    session.clear().unwrap();
    assert!(session.confirm(&store, &summary.token).is_err());
    let summary = session.select(Some(&source)).unwrap().unwrap();
    std::fs::write(&source, b"replaced after preview").unwrap();
    assert_eq!(
        session.confirm(&store, &summary.token).unwrap().campaign_id,
        "save-b"
    );
    let before = tables(&store, "save-b");
    assert!(session.confirm(&store, &summary.token).is_ok());
    assert_eq!(tables(&store, "save-b"), before);
    std::fs::write(&source, &bytes).unwrap();
    let mut collision: Value = serde_json::from_slice(&bytes).unwrap();
    collision["tables"]["campaigns"][0]["name"] = json!("Different content");
    let other = dir.file("collision.json");
    std::fs::write(&other, serde_json::to_vec(&collision).unwrap()).unwrap();
    let summary = session.select(Some(&other)).unwrap().unwrap();
    let error = session.confirm(&store, &summary.token).unwrap_err();
    assert!(error.to_string().contains("cannot overwrite"));
    assert_eq!(tables(&store, "save-b"), before);
    assert_eq!(std::fs::read(&source).unwrap(), bytes);
    assert!(session.select(Some(&dir.file("missing.json"))).is_err());
    assert!(session.confirm(&store, &summary.token).is_err());
}

#[test]
fn dialog_export_backup_cancel_roundtrip_and_reopen() {
    let dir = Dir::new();
    let store = NativeStore::open(dir.file("native.sqlite3")).unwrap();
    store.import_snapshot(&fixture("standalone-v2")).unwrap();
    let before = tables(&store, "standalone-v2");
    assert!(!export_file(
        &store,
        "standalone-v2",
        None,
        "export-a",
        "2026-10-20T12:00:00.000Z"
    )
    .unwrap());
    assert!(!backup_file(&store, None).unwrap());
    let target = dir.file("export.json");
    assert!(export_file(
        &store,
        "standalone-v2",
        Some(&target),
        "export-a",
        "2026-10-20T12:00:00.000Z"
    )
    .unwrap());
    let bytes = std::fs::read(&target).unwrap();
    let snapshot = parse_snapshot(&bytes).unwrap();
    assert_eq!(snapshot.tables.campaigns[0].id.as_str(), "standalone-v2");
    assert!(export_file(
        &store,
        "standalone-v2",
        Some(&target),
        "export-b",
        "2026-10-20T12:00:00.000Z"
    )
    .is_err());
    assert_eq!(std::fs::read(&target).unwrap(), bytes);
    let restored = NativeStore::open(dir.file("restored.sqlite3")).unwrap();
    restored.import_snapshot(&bytes).unwrap();
    assert_eq!(tables(&restored, "standalone-v2"), before);
    let backup = dir.file("backup.sqlite3");
    assert!(backup_file(&store, Some(&backup)).unwrap());
    let reopened = NativeStore::open(&backup).unwrap();
    assert_eq!(tables(&reopened, "standalone-v2"), before);
    assert_eq!(tables(&store, "standalone-v2"), before);
}
