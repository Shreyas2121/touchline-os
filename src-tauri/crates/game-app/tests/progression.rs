use game_app::*;
use game_core::{
    calendar::MATCH_SIMULATION_UNAVAILABLE, career::CareerInput, management::*, policy::Preset, *,
};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};

static SEQ: AtomicU64 = AtomicU64::new(0);
struct Dir(std::path::PathBuf);
impl Dir {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "touchline-g06-{}-{}",
            std::process::id(),
            SEQ.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn store(&self) -> NativeStore {
        NativeStore::open(self.0.join("game.sqlite3")).unwrap()
    }
}
impl Drop for Dir {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).unwrap();
    }
}
fn id(value: &str) -> EntityId {
    EntityId::new(value).unwrap()
}
fn n(value: i64) -> SafeInt {
    SafeInt::new(value).unwrap()
}
fn tables(store: &NativeStore, campaign: &str) -> SnapshotTables {
    store
        .export_snapshot(campaign, "clock-check", "2026-10-22T00:00:00.000Z")
        .unwrap()
        .tables
}
fn request(saved: &SnapshotTables, target: &str, stamp: &str) -> AdvanceRequest {
    let unique = SEQ.fetch_add(1, Ordering::Relaxed);
    let clock = &saved.simulation_states[0];
    AdvanceRequest {
        campaign_id: saved.campaigns[0].id.clone(),
        expected_revision: saved.campaigns[0].revision,
        source_date: clock.current_date.clone(),
        source_boundary_key: clock.last_boundary_key.clone(),
        target_boundary_key: target.into(),
        action_id: id(&format!("action-{unique}")),
        audit_id: id(&format!("audit-{unique}")),
        receipt_id: id(&format!("receipt-{unique}")),
        now: stamp.into(),
    }
}
fn import(store: &NativeStore, name: &str) {
    let bytes = match name {
        "standalone-v2" => {
            include_bytes!("../../../../compatibility/snapshots/standalone-v2.json").as_slice()
        }
        "legacy-v2" => {
            include_bytes!("../../../../compatibility/snapshots/legacy-v2.json").as_slice()
        }
        _ => panic!("unknown fixture"),
    };
    store.import_snapshot(bytes).unwrap();
}
fn unchanged(before: &SnapshotTables, after: &SnapshotTables) {
    assert_eq!(before.players, after.players);
    assert_eq!(before.contracts, after.contracts);
    assert_eq!(before.ledger_entries, after.ledger_entries);
    assert_eq!(before.registrations, after.registrations);
    assert_eq!(before.match_records, after.match_records);
    assert_eq!(before.club_simulation_states, after.club_simulation_states);
    assert_eq!(
        before.player_simulation_states,
        after.player_simulation_states
    );
    assert_eq!(before.constitutions, after.constitutions);
    assert_eq!(before.transfers, after.transfers);
    assert_eq!(before.offers, after.offers);
}

#[test]
fn imported_and_seeded_careers_advance_once_through_kickoff_and_survive_reopen() {
    let dir = Dir::new();
    let store = dir.store();
    import(&store, "standalone-v2");
    import(&store, "legacy-v2");
    let historical = tables(&store, "legacy-v2");
    let original = tables(&store, "standalone-v2");
    let preview = preview_time(&store, original.campaigns[0].id.clone()).unwrap();
    assert_eq!(preview.from_date, "2026-07-01");
    assert_eq!(
        preview.target_boundary_key.as_deref(),
        Some("season:2026:summer-deadline")
    );
    assert!(preview.allowed);
    assert_eq!(
        tables(&store, "standalone-v2").simulation_states,
        original.simulation_states
    );

    let deadline = request(
        &original,
        "season:2026:summer-deadline",
        "2026-10-22T08:00:00.000Z",
    );
    let first = advance_time(&store, deadline.clone()).unwrap();
    assert!(!first.replayed);
    assert_eq!(first.revision, n(original.campaigns[0].revision.get() + 1));
    assert_eq!(first.current_date, "2026-08-31");
    let at_deadline = tables(&store, "standalone-v2");
    assert_eq!(
        at_deadline.simulation_states[0].phase,
        CalendarPhase::Preseason
    );
    assert_eq!(
        at_deadline.simulation_states[0]
            .last_boundary_key
            .as_deref(),
        Some("season:2026:summer-deadline")
    );
    assert_eq!(
        at_deadline.audit_events.len(),
        original.audit_events.len() + 1
    );
    assert_eq!(
        at_deadline.simulation_receipts.len(),
        original.simulation_receipts.len() + 1
    );
    unchanged(&original, &at_deadline);
    assert_eq!(
        preview_time(&store, original.campaigns[0].id.clone())
            .unwrap()
            .target_boundary_key
            .as_deref(),
        Some("season:2026:league-kickoff")
    );

    let mut same_deadline = deadline.clone();
    same_deadline.action_id = id("retry-action");
    same_deadline.audit_id = id("retry-audit");
    same_deadline.receipt_id = id("retry-receipt");
    same_deadline.now = "2026-11-01T00:00:00.000Z".into();
    let replay = advance_time(&store, same_deadline).unwrap();
    assert!(replay.replayed);
    assert_eq!(replay.receipt_id, first.receipt_id);
    assert_eq!(replay.revision, first.revision);
    assert_eq!(
        tables(&store, "standalone-v2").audit_events.len(),
        at_deadline.audit_events.len()
    );

    let kickoff = request(
        &at_deadline,
        "season:2026:league-kickoff",
        "2026-10-22T10:00:00.000Z",
    );
    let second = advance_time(&store, kickoff).unwrap();
    assert!(!second.replayed);
    assert_eq!(second.current_date, "2026-09-01");
    assert_eq!(second.revision, n(first.revision.get() + 1));
    let done = tables(&store, "standalone-v2");
    assert_eq!(done.simulation_states[0].phase, CalendarPhase::League);
    assert_eq!(
        done.simulation_states[0].last_boundary_key.as_deref(),
        Some("season:2026:league-kickoff")
    );
    assert_eq!(done.audit_events.len(), original.audit_events.len() + 2);
    assert_eq!(
        done.simulation_receipts.len(),
        original.simulation_receipts.len() + 2
    );
    unchanged(&original, &done);
    let deadline_receipt = at_deadline
        .simulation_receipts
        .iter()
        .find(|row| row.operation_key.contains("summer-deadline"))
        .unwrap();
    let persisted_deadline = done
        .simulation_receipts
        .iter()
        .find(|row| row.id == deadline_receipt.id)
        .unwrap();
    assert_eq!(persisted_deadline, deadline_receipt);
    assert!(done.simulation_receipts.iter().any(|row| {
        row.operation_key.contains("league-kickoff")
            && row.event_seed != deadline_receipt.event_seed
    }));

    let mut late_deadline = deadline;
    late_deadline.action_id = id("late-action");
    late_deadline.audit_id = id("late-audit");
    late_deadline.receipt_id = id("late-receipt");
    late_deadline.now = "2027-01-02T00:00:00.000Z".into();
    let late = advance_time(&store, late_deadline).unwrap();
    assert!(late.replayed);
    assert_eq!(late.receipt_id, first.receipt_id);
    assert_eq!(late.revision, second.revision);
    assert_eq!(late.current_date, "2026-09-01");
    assert_eq!(
        tables(&store, "standalone-v2").simulation_states,
        done.simulation_states
    );
    assert_eq!(
        tables(&store, "standalone-v2").audit_events.len(),
        done.audit_events.len()
    );

    let blocked = preview_time(&store, original.campaigns[0].id.clone()).unwrap();
    assert!(!blocked.allowed);
    assert_eq!(
        blocked.reason.as_deref(),
        Some(MATCH_SIMULATION_UNAVAILABLE)
    );
    let refused = advance_time(
        &store,
        request(&done, "season:2026:matchday", "2026-10-22T11:00:00.000Z"),
    )
    .unwrap_err();
    assert_eq!(refused.to_string(), MATCH_SIMULATION_UNAVAILABLE);
    assert_eq!(
        tables(&store, "standalone-v2").campaigns[0].revision,
        done.campaigns[0].revision
    );

    let mut changed = request(
        &original,
        "season:2026:summer-deadline",
        "2026-10-22T08:00:00.000Z",
    );
    changed.expected_revision = n(99);
    assert!(advance_time(&store, changed).is_err());
    assert_eq!(tables(&store, "legacy-v2"), historical);
    assert!(advance_time(
        &store,
        request(
            &historical,
            "season:2026:summer-deadline",
            "2026-10-22T08:00:00.000Z"
        )
    )
    .is_err());
    assert_eq!(tables(&store, "legacy-v2"), historical);
    assert_eq!(
        tables(&store, "standalone-v2").simulation_states,
        done.simulation_states
    );
    drop(store);

    let reopened = dir.store();
    assert_eq!(
        tables(&reopened, "standalone-v2").simulation_states,
        done.simulation_states
    );
    let mut reopened_replay = request(
        &original,
        "season:2026:summer-deadline",
        "2026-10-22T08:00:00.000Z",
    );
    reopened_replay.action_id = id("reopen-action");
    reopened_replay.audit_id = id("reopen-audit");
    reopened_replay.receipt_id = id("reopen-receipt");
    reopened_replay.expected_revision = original.campaigns[0].revision;
    reopened_replay.source_date = "2026-07-01".into();
    reopened_replay.source_boundary_key = None;
    reopened_replay.now = "2028-01-01T00:00:00.000Z".into();
    let persisted = advance_time(&reopened, reopened_replay).unwrap();
    assert!(persisted.replayed);
    assert_eq!(persisted.current_date, "2026-09-01");
    assert_eq!(persisted.revision, second.revision);

    create_career(
        &reopened,
        CreationRequest {
            kind: CreationKind::Career,
            reset_revision: None,
            club: None,
            career: CareerInput {
                campaign_id: id("seeded-career"),
                name: "Seeded career".into(),
                seed: "g06-fixed-seed".into(),
                start_year: n(2026),
                club_key: "club:01".into(),
                rules_mode: RulesMode::Challenge,
                preset: Preset::Balanced,
                now: "2026-10-22T12:00:00.000Z".into(),
                season_id: id("seeded-season"),
                clock_id: id("seeded-clock"),
                constitution_id: id("seeded-constitution"),
                allocation_id: id("seeded-allocation"),
                receipt_id: id("seeded-init-receipt"),
                audit_event_id: id("seeded-init-audit"),
                action_id: id("seeded-init-action"),
            },
        },
    )
    .unwrap();
    let seeded = tables(&reopened, "seeded-career");
    assert_eq!(seeded.simulation_states[0].current_date, "2026-07-01");
    let seeded_deadline = advance_time(
        &reopened,
        request(
            &seeded,
            "season:2026:summer-deadline",
            "2026-10-22T12:30:00.000Z",
        ),
    )
    .unwrap();
    assert_eq!(seeded_deadline.current_date, "2026-08-31");
    let seeded_mid = tables(&reopened, "seeded-career");
    let seeded_kickoff = advance_time(
        &reopened,
        request(
            &seeded_mid,
            "season:2026:league-kickoff",
            "2026-10-22T12:40:00.000Z",
        ),
    )
    .unwrap();
    assert_eq!(seeded_kickoff.current_date, "2026-09-01");
    assert_eq!(
        preview_time(&reopened, id("seeded-career"))
            .unwrap()
            .reason
            .as_deref(),
        Some(MATCH_SIMULATION_UNAVAILABLE)
    );
    assert_eq!(
        tables(&reopened, "standalone-v2").simulation_states,
        done.simulation_states
    );
    assert_eq!(tables(&reopened, "legacy-v2"), historical);
}

#[test]
fn concurrent_same_event_calls_leave_one_clock_change() {
    let dir = Dir::new();
    let store = Arc::new(dir.store());
    import(&store, "standalone-v2");
    let original = tables(&store, "standalone-v2");
    let left = request(
        &original,
        "season:2026:summer-deadline",
        "2026-10-22T08:00:00.000Z",
    );
    let mut right = left.clone();
    right.action_id = id("right-action");
    right.audit_id = id("right-audit");
    right.receipt_id = id("right-receipt");
    right.now = "2026-10-22T08:05:00.000Z".into();
    let mut conflicting = left.clone();
    conflicting.action_id = id("conflict-action");
    conflicting.audit_id = id("conflict-audit");
    conflicting.receipt_id = id("conflict-receipt");
    conflicting.source_date = "2026-08-01".into();
    conflicting.now = "2026-10-22T08:06:00.000Z".into();
    let store_left = Arc::clone(&store);
    let store_right = Arc::clone(&store);
    let store_conflict = Arc::clone(&store);
    let first = std::thread::spawn(move || advance_time(&store_left, left));
    let second = std::thread::spawn(move || advance_time(&store_right, right));
    let third = std::thread::spawn(move || advance_time(&store_conflict, conflicting));
    let results = [
        first.join().unwrap(),
        second.join().unwrap(),
        third.join().unwrap(),
    ];
    assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 2);
    assert!(results.iter().any(|result| result.is_err()));
    let saved = tables(&store, "standalone-v2");
    assert_eq!(saved.simulation_states[0].current_date, "2026-08-31");
    assert_eq!(
        saved.campaigns[0].revision,
        n(original.campaigns[0].revision.get() + 1)
    );
    assert_eq!(
        saved.simulation_receipts.len(),
        original.simulation_receipts.len() + 1
    );
    assert_eq!(saved.audit_events.len(), original.audit_events.len() + 1);
    unchanged(&original, &saved);
}
