use game_app::*;
use game_core::{
    career::{prepare_standalone_career, CareerInput},
    match_selection::*,
    policy::Preset,
    *,
};
use rusqlite::Connection;
use serde_json::json;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, OnceLock,
    },
};

const NOW: &str = "2026-10-23T09:00:00.000Z";
static SEQ: AtomicU64 = AtomicU64::new(0);
struct Dir(PathBuf);
impl Dir {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "touchline-matchday-{}-{}",
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
fn id(s: impl Into<String>) -> EntityId {
    EntityId::new(s).unwrap()
}
fn n(v: i64) -> SafeInt {
    SafeInt::new(v).unwrap()
}
fn baseline() -> SnapshotTables {
    static BASE: OnceLock<SnapshotTables> = OnceLock::new();
    BASE.get_or_init(|| {
        let mut tables = prepare_standalone_career(&CareerInput {
            campaign_id: id("matchday-career"),
            name: "Matchday career".into(),
            seed: "p08-g05-fixed".into(),
            start_year: n(2026),
            club_key: "club:01".into(),
            rules_mode: RulesMode::Challenge,
            preset: Preset::Balanced,
            now: NOW.into(),
            season_id: id("matchday-season"),
            clock_id: id("matchday-clock"),
            constitution_id: id("matchday-constitution"),
            allocation_id: id("matchday-allocation"),
            receipt_id: id("init-receipt"),
            audit_event_id: id("init-audit"),
            action_id: id("init-action"),
        })
        .unwrap()
        .into_tables();
        tables.simulation_states[0].phase = CalendarPhase::League;
        tables.simulation_states[0].current_date = "2026-09-01".into();
        tables.simulation_states[0].last_boundary_key = Some("season:2026:league-kickoff".into());
        let club = &tables.campaigns[0].managed_club_id;
        let roster = tables
            .players
            .iter()
            .filter(|p| p.club_id.as_ref() == Some(club))
            .map(|p| {
                let state = tables
                    .player_simulation_states
                    .iter()
                    .find(|s| s.player_id == p.id)
                    .unwrap();
                MatchPlayer {
                    player_id: p.id.as_str(),
                    simulation_key: &state.simulation_key,
                    position_group: p.position_group,
                    attributes: &p.attributes,
                    goalkeeping: state.goalkeeping.map(SafeInt::get),
                    fitness: state.fitness.get(),
                    sharpness: state.sharpness.get(),
                    life: state.status,
                    contract_active: true,
                    injury_until_date: None,
                    suspension_matches: 0,
                    registration: None,
                }
            })
            .collect::<Vec<_>>();
        let selected =
            select_ai_club(&roster, &dates::DateOnly::parse("2026-09-01").unwrap()).unwrap();
        let ClubSelection::Ready { players, .. } = selected else {
            panic!("generated squad")
        };
        let player_id = |key: &str| {
            tables
                .player_simulation_states
                .iter()
                .find(|s| s.simulation_key == key)
                .unwrap()
                .player_id
                .clone()
        };
        tables.lineups.push(LineupRow {
            id: id("managed-lineup"),
            campaign_id: id("matchday-career"),
            season_id: id("matchday-season"),
            name: "Match XI".into(),
            formation: Formation::F433,
            starters: players
                .iter()
                .filter(|p| p.started)
                .map(|p| LineupStarter {
                    player_id: player_id(&p.simulation_key),
                    slot: p.slot.clone(),
                    role: None,
                })
                .collect(),
            bench_player_ids: players
                .iter()
                .filter(|p| !p.started)
                .map(|p| player_id(&p.simulation_key))
                .collect(),
            updated_at: NOW.into(),
        });
        tables.registrations = roster
            .iter()
            .enumerate()
            .map(|(i, p)| RegistrationRow {
                id: id(format!("registration-{i}")),
                campaign_id: id("matchday-career"),
                season_id: id("matchday-season"),
                player_id: id(p.player_id),
                competition_key: "league".into(),
                status: RegistrationStatus::Registered,
                homegrown_club: Some(true),
                homegrown_nation: Some(true),
                age_exempt: Some(true),
                provenance: RecordSource::Generated,
            })
            .collect();
        tables
    })
    .clone()
}
fn import(store: &NativeStore, tables: SnapshotTables) {
    let bytes = serde_json::to_vec(&json!({"format":"touchline-campaign", "formatVersion":1, "sourceStorage":"sqlite", "sourceSchemaVersion":2,
        "exportId":"matchday-import", "exportedAt": NOW, "campaignRevision":tables.campaigns[0].revision, "tables":tables})).unwrap();
    store.import_snapshot(&bytes).unwrap();
}
fn saved(store: &NativeStore) -> SnapshotTables {
    store
        .export_snapshot("matchday-career", "check", NOW)
        .unwrap()
        .tables
}
fn refresh_managed_lineup(store: &NativeStore) {
    let tables = saved(store);
    let date = dates::DateOnly::parse(&tables.simulation_states[0].current_date).unwrap();
    let injuries = tables
        .player_simulation_states
        .iter()
        .map(|p| {
            p.injury_until_date
                .as_deref()
                .map(dates::DateOnly::parse)
                .transpose()
                .unwrap()
        })
        .collect::<Vec<_>>();
    let roster = tables
        .players
        .iter()
        .filter(|p| p.club_id.as_ref() == Some(&tables.campaigns[0].managed_club_id))
        .map(|p| {
            let index = tables
                .player_simulation_states
                .iter()
                .position(|s| s.player_id == p.id)
                .unwrap();
            let s = &tables.player_simulation_states[index];
            MatchPlayer {
                player_id: p.id.as_str(),
                simulation_key: &s.simulation_key,
                position_group: p.position_group,
                attributes: &p.attributes,
                goalkeeping: s.goalkeeping.map(SafeInt::get),
                fitness: s.fitness.get(),
                sharpness: s.sharpness.get(),
                life: s.status,
                contract_active: true,
                injury_until_date: injuries[index].as_ref(),
                suspension_matches: s.suspension_matches.get(),
                registration: None,
            }
        })
        .collect::<Vec<_>>();
    let ClubSelection::Ready { players, .. } = select_ai_club(&roster, &date).unwrap() else {
        panic!("available squad")
    };
    let player_id = |key: &str| {
        tables
            .player_simulation_states
            .iter()
            .find(|s| s.simulation_key == key)
            .unwrap()
            .player_id
            .clone()
    };
    let mut lineup = tables.lineups[0].clone();
    lineup.starters = players
        .iter()
        .filter(|p| p.started)
        .map(|p| LineupStarter {
            player_id: player_id(&p.simulation_key),
            slot: p.slot.clone(),
            role: None,
        })
        .collect();
    lineup.bench_player_ids = players
        .iter()
        .filter(|p| !p.started)
        .map(|p| player_id(&p.simulation_key))
        .collect();
    game_app::manage(
        store,
        game_core::management::ManagementCommand {
            campaign_id: id("matchday-career"),
            expected_revision: tables.campaigns[0].revision,
            action_id: id("new-lineup-action"),
            audit_id: id("new-lineup-audit"),
            now: NOW.into(),
            action: game_core::management::ManagementAction::SaveLineup { lineup },
        },
    )
    .unwrap();
}
fn request(store: &NativeStore) -> SimMatchdayRequest {
    let p = preview_matchday(store, id("matchday-career")).unwrap();
    assert!(p.allowed, "{:?}", p.blocker);
    let unique = SEQ.fetch_add(1, Ordering::Relaxed);
    let ids = |kind: &str, count: SafeInt| {
        (0..count.get())
            .map(|i| id(format!("{kind}-{unique}-{i}")))
            .collect()
    };
    SimMatchdayRequest {
        campaign_id: p.campaign_id,
        expected_revision: p.revision,
        source_date: p.from_date,
        source_boundary_key: p.source_boundary_key,
        target_date: p.target_date.unwrap(),
        action_id: id(format!("action-{unique}")),
        audit_id: id(format!("audit-{unique}")),
        receipt_id: id(format!("receipt-{unique}")),
        now: NOW.into(),
        fixture_ids: ids("fixture", p.fixture_count),
        match_ids: ids("match", p.match_count),
        appearance_ids: ids("appearance", p.appearance_count),
    }
}

#[test]
fn commits_reopens_replays_and_reconciles_two_rounds() {
    let dir = Dir::new();
    let store = dir.store();
    import(&store, baseline());
    // A separate schema-2 campaign must remain untouched.
    let other_bytes = include_bytes!("../../../fixtures/standalone.json");
    store.import_snapshot(other_bytes).unwrap();
    let other = store
        .export_snapshot("standalone-v2", "other", NOW)
        .unwrap()
        .tables;
    let before = saved(&store);
    assert!(before.fixtures.is_empty());
    let squad_query = queries::ScreenQuery {
        campaign_id: id("matchday-career"),
        screen: queries::Screen::Squad,
        page: n(0),
        search: String::new(),
        all_players: false,
    };
    assert!(game_app::read_screen(&store, squad_query.clone())
        .unwrap()
        .player_facts
        .iter()
        .all(|f| f.minutes.is_none() && f.goals.is_none() && f.assists.is_none()));
    let p = preview_matchday(&store, id("matchday-career")).unwrap();
    assert!(p.allowed);
    assert_eq!(p.fixture_count, n(1224));
    assert_eq!(saved(&store), before);
    let request = request(&store);
    let result = sim_matchday(&store, request.clone()).unwrap();
    assert!(!result.replayed);
    assert_eq!(result.current_date, "2026-09-08");
    let after = saved(&store);
    assert_eq!(after.fixtures.len(), 1224);
    assert_eq!(after.simulated_matches.len(), 36);
    assert_eq!(
        after.campaigns[0].revision,
        n(before.campaigns[0].revision.get() + 1)
    );
    assert_eq!(after.audit_events.len(), before.audit_events.len() + 1);
    assert_eq!(
        after
            .audit_events
            .iter()
            .find(|a| a.id == request.audit_id)
            .unwrap()
            .action_type,
        AuditAction::SimulationMatchday
    );
    assert_eq!(after.contracts, before.contracts);
    assert_eq!(after.players, before.players);
    assert_eq!(after.constitutions, before.constitutions);
    assert_eq!(after.ledger_entries, before.ledger_entries);
    let squad = game_app::read_screen(&store, squad_query).unwrap();
    for fact in squad.player_facts {
        let apps = after
            .simulated_appearances
            .iter()
            .filter(|a| a.player_id == fact.player_id)
            .collect::<Vec<_>>();
        assert_eq!(
            fact.minutes,
            Some(n(apps.iter().map(|a| a.minutes.get()).sum()))
        );
        assert_eq!(
            fact.goals,
            Some(n(apps.iter().map(|a| a.goals.get()).sum()))
        );
        assert_eq!(
            fact.assists,
            Some(n(apps.iter().map(|a| a.assists.get()).sum()))
        );
    }
    let view = matchday_view(&store, id("matchday-career"), None).unwrap();
    assert_eq!(view.round, n(1));
    assert_eq!(view.fixtures.len(), 36);
    assert_eq!(view.matches.len(), 36);
    assert_eq!(view.appearances.len(), request.appearance_ids.len());
    assert_eq!(view.leagues.len(), 4);
    for league in &view.leagues {
        assert_eq!(league.rows.len(), 18);
        assert!(league.rows.iter().all(|r| r.played == n(1)));
    }
    for m in &view.matches {
        let events = m.timeline.as_array().unwrap();
        for (side, score, xg) in [
            ("home", m.home_goals, m.home_xg_milli),
            ("away", m.away_goals, m.away_xg_milli),
        ] {
            assert_eq!(
                score.get(),
                events
                    .iter()
                    .filter(|e| e["kind"] == "goal" && e["side"] == side)
                    .count() as i64
            );
            assert_eq!(
                xg.get(),
                m.input_snapshot["chances"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter(|c| c["side"] == side)
                    .map(|c| c["xgMilli"].as_i64().unwrap())
                    .sum::<i64>()
            );
        }
        assert_eq!(
            view.appearances
                .iter()
                .filter(|a| a.fixture_id == m.fixture_id)
                .map(|a| a.goals.get())
                .sum::<i64>(),
            m.home_goals.get() + m.away_goals.get()
        );
    }
    let mut retry = request.clone();
    retry.action_id = id("retry-action");
    retry.audit_id = id("retry-audit");
    retry.receipt_id = id("retry-receipt");
    retry.now = "2027-01-01T00:00:00.000Z".into();
    let replay = sim_matchday(&store, retry.clone()).unwrap();
    assert!(replay.replayed);
    assert_eq!(replay.receipt_id, result.receipt_id);
    assert_eq!(saved(&store), after);
    let mut changed = retry.clone();
    changed.expected_revision = n(99);
    assert!(sim_matchday(&store, changed).is_err());
    assert_eq!(saved(&store), after);
    assert_eq!(
        store
            .export_snapshot("standalone-v2", "other", NOW)
            .unwrap()
            .tables,
        other
    );
    drop(store);
    let reopened = dir.store();
    assert_eq!(saved(&reopened), after);
    assert!(sim_matchday(&reopened, retry).unwrap().replayed);
    refresh_managed_lineup(&reopened);
    let second = self::request(&reopened);
    assert!(second.fixture_ids.is_empty());
    sim_matchday(&reopened, second).unwrap();
    let two = saved(&reopened);
    assert_eq!(two.simulated_matches.len(), 72);
    assert_eq!(two.simulation_states[0].current_date, "2026-09-15");
    let replay_later = sim_matchday(&reopened, request).unwrap();
    assert!(replay_later.replayed);
    assert_eq!(replay_later.revision, two.campaigns[0].revision);
    assert_eq!(saved(&reopened), two);
}

#[test]
fn blocker_and_bad_request_vectors_leave_every_table_unchanged() {
    let dir = Dir::new();
    let store = dir.store();
    let mut blocked = baseline();
    blocked.lineups.clear();
    import(&store, blocked);
    let before = saved(&store);
    let p = preview_matchday(&store, id("matchday-career")).unwrap();
    assert!(!p.allowed);
    assert!(p.blocker.unwrap().contains("Tactics"));
    let attempt = SimMatchdayRequest {
        campaign_id: id("matchday-career"),
        expected_revision: before.campaigns[0].revision,
        source_date: "2026-09-01".into(),
        source_boundary_key: before.simulation_states[0].last_boundary_key.clone(),
        target_date: "2026-09-01".into(),
        action_id: id("blocked-action"),
        audit_id: id("blocked-audit"),
        receipt_id: id("blocked-receipt"),
        now: NOW.into(),
        fixture_ids: vec![],
        match_ids: vec![],
        appearance_ids: vec![],
    };
    assert!(sim_matchday(&store, attempt)
        .unwrap_err()
        .to_string()
        .contains("Tactics"));
    assert_eq!(saved(&store), before);
    assert!(before.fixtures.is_empty());
    drop(store);
    let dir = Dir::new();
    let store = dir.store();
    import(&store, baseline());
    let before = saved(&store);
    let good = request(&store);
    let mut stale = good.clone();
    stale.expected_revision = n(999);
    assert!(sim_matchday(&store, stale).is_err());
    for field in 0..3 {
        for surplus in [false, true] {
            let mut bad = good.clone();
            let ids = match field {
                0 => &mut bad.fixture_ids,
                1 => &mut bad.match_ids,
                _ => &mut bad.appearance_ids,
            };
            if surplus {
                ids.push(id("surplus-id"));
            } else {
                ids.pop();
            }
            assert!(sim_matchday(&store, bad).is_err());
            assert_eq!(saved(&store), before);
        }
    }
}

#[test]
fn audit_failure_rolls_back_the_entire_matchday() {
    let dir = Dir::new();
    let store = dir.store();
    import(&store, baseline());
    let before = saved(&store);
    let req = request(&store);
    let db = Connection::open(dir.0.join("game.sqlite3")).unwrap();
    db.execute_batch("CREATE TRIGGER fail_matchday_audit BEFORE INSERT ON auditEvents WHEN NEW.actionType='simulation.matchday' BEGIN SELECT RAISE(ABORT, 'injected matchday audit failure'); END;").unwrap();
    assert!(sim_matchday(&store, req.clone()).is_err());
    assert_eq!(saved(&store), before);
    db.execute_batch("DROP TRIGGER fail_matchday_audit;")
        .unwrap();
    assert!(!sim_matchday(&store, req).unwrap().replayed);
}

#[test]
fn prepared_inputs_are_rechecked_without_rerolling_inside_the_transaction() {
    let dir = Dir::new();
    let store = dir.store();
    import(&store, baseline());
    let req = request(&store);
    let before = saved(&store);
    let prepared = game_core::matchday::prepare(&before, &req).unwrap();
    let player = &before.lineups[0].starters[0].player_id;
    let db = Connection::open(dir.0.join("game.sqlite3")).unwrap();
    db.execute(
        "UPDATE playerSimulationStates SET fitness=fitness-1 WHERE campaignId=?1 AND playerId=?2",
        ["matchday-career", player.as_str()],
    )
    .unwrap();
    let changed = saved(&store);
    assert!(store.matchday(req, prepared).is_err());
    assert_eq!(saved(&store), changed);
    assert!(changed.fixtures.is_empty());
}

#[test]
fn review_clock_and_preview_refuse_rollover() {
    let mut tables = baseline();
    let date = dates::add_days(&dates::DateOnly::parse("2026-09-01").unwrap(), 33 * 7).unwrap();
    let clock = &mut tables.simulation_states[0];
    clock.current_date = date.as_str().into();
    clock.phase = CalendarPhase::Review;
    clock.last_boundary_key = Some(format!("season:matchday-season:matchday:{}", date.as_str()));
    let clock_preview = calendar::preview_time_advance(clock, &tables.seasons[0]).unwrap();
    assert!(!clock_preview.allowed);
    assert_eq!(
        clock_preview.reason.as_deref(),
        Some(game_core::matchday::ROLLOVER_UNAVAILABLE)
    );
    let p = game_core::matchday::preview(&tables, &id("matchday-career")).unwrap();
    assert!(!p.allowed);
    assert_eq!(
        p.blocker.as_deref(),
        Some(game_core::matchday::ROLLOVER_UNAVAILABLE)
    );
}

#[test]
fn overlapping_calls_record_one_round_and_recheck_prepared_inputs() {
    let dir = Dir::new();
    let store = Arc::new(dir.store());
    import(&store, baseline());
    let req = request(&store);
    let mut right = req.clone();
    right.action_id = id("right-action");
    right.audit_id = id("right-audit");
    right.receipt_id = id("right-receipt");
    let left_store = Arc::clone(&store);
    let right_store = Arc::clone(&store);
    let left = std::thread::spawn(move || sim_matchday(&left_store, req));
    let right = std::thread::spawn(move || sim_matchday(&right_store, right));
    let outcomes = [
        left.join().unwrap().unwrap(),
        right.join().unwrap().unwrap(),
    ];
    assert_eq!(outcomes.iter().filter(|o| o.replayed).count(), 1);
    assert_eq!(saved(&store).simulated_matches.len(), 36);
}
