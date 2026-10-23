use game_core::{calendar::MATCH_SIMULATION_UNAVAILABLE, progression::*, *};

fn id(value: &str) -> EntityId {
    EntityId::new(value).unwrap()
}
fn n(value: i64) -> SafeInt {
    SafeInt::new(value).unwrap()
}
fn tables() -> SnapshotTables {
    let mut tables = SnapshotTables::default();
    tables.campaigns.push(CampaignRow {
        id: id("career"),
        name: "Career".into(),
        kind: CampaignKind::Fictional,
        mode: CampaignMode::Standalone,
        rules_mode: RulesMode::Challenge,
        seed: Some("seed".into()),
        generator_version: Some("2".into()),
        managed_club_id: id("club"),
        active_season_id: id("season"),
        currency: Euro,
        created_at: "2026-07-01T00:00:00.000Z".into(),
        updated_at: "2026-07-01T00:00:00.000Z".into(),
        revision: n(4),
        status: CampaignStatus::Active,
    });
    tables.seasons.push(SeasonRow {
        id: id("season"),
        campaign_id: id("career"),
        label: "2026/27".into(),
        ordinal: n(1),
        status: SeasonStatus::Active,
        start_date: Some("2026-07-01".into()),
        end_date: Some("2027-06-30".into()),
        opened_at: "2026-07-01T00:00:00.000Z".into(),
        closed_at: None,
    });
    tables.simulation_states.push(SimulationStateRow {
        id: id("clock"),
        campaign_id: id("career"),
        active_season_id: id("season"),
        root_seed: "seed".into(),
        simulation_version: VersionOne,
        calendar_version: VersionOne,
        current_date: "2026-07-01".into(),
        phase: CalendarPhase::Preseason,
        last_boundary_key: None,
    });
    tables
}
fn request(revision: i64, source: &str, cursor: Option<&str>, target: &str) -> AdvanceRequest {
    AdvanceRequest {
        campaign_id: id("career"),
        expected_revision: n(revision),
        source_date: source.into(),
        source_boundary_key: cursor.map(str::to_owned),
        target_boundary_key: target.into(),
        action_id: id("action"),
        audit_id: id("audit"),
        receipt_id: id("receipt"),
        now: "2026-10-22T00:00:00.000Z".into(),
    }
}
fn fingerprint(tables: &SnapshotTables, request: &AdvanceRequest) -> String {
    critical_material(tables, request).unwrap()
}

#[test]
fn transport_ids_and_audit_time_do_not_change_the_operation_identity() {
    let saved = tables();
    let mut first = request(4, "2026-07-01", None, "season:2026:summer-deadline");
    let material = fingerprint(&saved, &first);
    first.action_id = id("other-action");
    first.audit_id = id("other-audit");
    first.receipt_id = id("other-receipt");
    first.now = "2026-12-31T23:59:59.999Z".into();
    assert_eq!(fingerprint(&saved, &first), material);
    assert!(!material.contains("other-action"));
    assert!(!material.contains("2026-12-31"));
    assert_eq!(
        advance_operation_key("season", "season:2026:summer-deadline").unwrap(),
        "advance:season:season:2026:summer-deadline"
    );
    first.expected_revision = n(5);
    assert_ne!(fingerprint(&saved, &first), material);
    first.expected_revision = n(4);
    first.source_date = "2026-08-31".into();
    assert_ne!(fingerprint(&saved, &first), material);
    first.source_date = "2026-07-01".into();
    first.source_boundary_key = Some("season:2026:summer-deadline".into());
    assert_ne!(fingerprint(&saved, &first), material);
    first.source_boundary_key = None;
    first.target_boundary_key = "season:2026:league-kickoff".into();
    assert_ne!(fingerprint(&saved, &first), material);
}

#[test]
fn both_boundaries_commit_once_and_a_later_replay_does_not_roll_back() {
    let mut saved = tables();
    let blocked_market = preview_saved(&saved, &id("career")).unwrap();
    assert!(!blocked_market.allowed);
    assert_eq!(blocked_market.from_date, "2026-07-01");
    assert!(blocked_market.target_boundary_key.is_none());
    saved.simulation_states[0].last_boundary_key = Some("season:season:market:2026-07-01".into());
    let preview = preview_saved(&saved, &id("career")).unwrap();
    assert!(preview.allowed);
    assert_eq!(preview.target_date.as_deref(), Some("2026-07-08"));
    assert_eq!(
        preview.target_boundary_key.as_deref(),
        Some("season:season:summer-date:2026-07-08")
    );
    assert_eq!(preview.next_event.as_deref(), Some("Next window date"));
    let deadline = request(
        4,
        "2026-07-01",
        Some("season:season:market:2026-07-01"),
        "season:season:summer-date:2026-07-08",
    );
    let material = fingerprint(&saved, &deadline);
    let again = evaluate(&saved, &deadline, &material).unwrap();
    let AdvancePlan::Commit(planned) = again else {
        panic!("deadline should be a new event");
    };
    let name = saved.campaigns[0].name.clone();
    let players = saved.players.clone();
    let first = commit(&mut saved, *planned);
    assert!(!first.replayed);
    assert_eq!(first.revision, n(5));
    assert_eq!(first.current_date, "2026-07-08");
    assert_eq!(saved.simulation_states[0].phase, CalendarPhase::Preseason);
    assert_eq!(
        saved.simulation_states[0].last_boundary_key.as_deref(),
        Some("season:season:summer-date:2026-07-08")
    );
    assert_eq!(saved.simulation_receipts.len(), 1);
    assert_eq!(saved.audit_events.len(), 1);
    assert_eq!(
        saved.audit_events[0].action_type,
        AuditAction::SimulationAdvance
    );
    assert_eq!(saved.campaigns[0].name, name);
    assert_eq!(saved.players, players);
    let repeated = evaluate(&saved, &deadline, &material).unwrap();
    let AdvancePlan::Replay(replay) = repeated else {
        panic!("same deadline request should replay");
    };
    assert_eq!(replay.receipt_id, first.receipt_id);
    assert_eq!(replay.revision, n(5));
    assert_eq!(saved.simulation_receipts.len(), 1);

    saved.simulation_states[0].current_date = "2026-08-31".into();
    saved.simulation_states[0].last_boundary_key = Some("season:2026:summer-deadline".into());
    let mut kickoff = request(
        5,
        "2026-08-31",
        Some("season:2026:summer-deadline"),
        "season:2026:league-kickoff",
    );
    kickoff.action_id = id("kickoff-action");
    kickoff.audit_id = id("kickoff-audit");
    kickoff.receipt_id = id("kickoff-receipt");
    let kickoff_material = fingerprint(&saved, &kickoff);
    let first_seed = saved.simulation_receipts[0].event_seed;
    let AdvancePlan::Commit(planned) = evaluate(&saved, &kickoff, &kickoff_material).unwrap()
    else {
        panic!("kickoff should be a new event");
    };
    let second = commit(&mut saved, *planned);
    assert_ne!(saved.simulation_receipts[1].event_seed, first_seed);
    assert_eq!(second.current_date, "2026-09-01");
    assert_eq!(saved.simulation_states[0].phase, CalendarPhase::League);
    assert_eq!(saved.campaigns[0].revision, n(6));
    assert_eq!(saved.audit_events.len(), 2);
    assert_eq!(saved.simulation_receipts.len(), 2);

    let mut stale_first = deadline.clone();
    stale_first.action_id = id("fresh-action");
    stale_first.audit_id = id("fresh-audit");
    stale_first.receipt_id = id("fresh-receipt");
    stale_first.now = "2027-01-01T00:00:00.000Z".into();
    let replay = evaluate(&saved, &stale_first, &material).unwrap();
    let AdvancePlan::Replay(replay) = replay else {
        panic!("original deadline identity should replay after kickoff");
    };
    assert!(replay.replayed);
    assert_eq!(replay.receipt_id, first.receipt_id);
    assert_eq!(replay.revision, n(6));
    assert_eq!(replay.current_date, "2026-09-01");
    assert_eq!(saved.campaigns[0].revision, n(6));
    assert_eq!(saved.simulation_receipts.len(), 2);
    assert_eq!(saved.audit_events.len(), 2);
    assert_eq!(saved.players, players);

    let blocked = preview_saved(&saved, &id("career")).unwrap();
    assert!(!blocked.allowed);
    assert_eq!(
        blocked.reason.as_deref(),
        Some(MATCH_SIMULATION_UNAVAILABLE)
    );
    let further = request(
        6,
        "2026-09-01",
        Some("season:2026:league-kickoff"),
        "season:2026:matchday",
    );
    let error = evaluate(&saved, &further, &fingerprint(&saved, &further)).unwrap_err();
    assert_eq!(error.to_string(), MATCH_SIMULATION_UNAVAILABLE);
    assert_eq!(saved.campaigns[0].revision, n(6));
}

#[test]
fn stale_and_changed_inputs_do_not_change_rows() {
    let mut saved = tables();
    saved.simulation_states[0].last_boundary_key = Some("season:season:market:2026-07-01".into());
    let deadline = request(
        4,
        "2026-07-01",
        Some("season:season:market:2026-07-01"),
        "season:season:summer-date:2026-07-08",
    );
    let material = fingerprint(&saved, &deadline);
    let AdvancePlan::Commit(planned) = evaluate(&saved, &deadline, &material).unwrap() else {
        panic!("commit");
    };
    commit(&mut saved, *planned);
    let before = saved.clone();
    let mut changed = deadline.clone();
    changed.expected_revision = n(9);
    let changed_material = fingerprint(&saved, &changed);
    assert!(evaluate(&saved, &changed, &changed_material).is_err());
    let mut stale = request(5, "2026-07-01", None, "season:2026:league-kickoff");
    stale.expected_revision = n(5);
    assert!(evaluate(&saved, &stale, &fingerprint(&saved, &stale)).is_err());
    assert_eq!(saved.campaigns[0].revision, before.campaigns[0].revision);
    assert_eq!(saved.simulation_states, before.simulation_states);
    assert_eq!(saved.simulation_receipts, before.simulation_receipts);
    assert_eq!(saved.audit_events, before.audit_events);
}
