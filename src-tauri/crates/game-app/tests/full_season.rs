//! Certification through the public services and real SQLite, including the
//! exact file encoding used by desktop Export campaign. No gameplay shortcuts.
use game_app::*;
use game_core::{
    career::CareerInput,
    dates::{add_days, DateOnly},
    management::CreationKind,
    policy::Preset,
    *,
};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
    time::Instant,
};

const NOW: &str = "2026-10-23T12:00:00.000Z";
const EXPORT_LIMIT: usize = 32 * 1024 * 1024;
static SEQUENCE: AtomicU64 = AtomicU64::new(0);
struct Directory(PathBuf);
impl Directory {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "touchline-full-season-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn store(&self) -> NativeStore {
        NativeStore::open(self.0.join("season.sqlite3")).unwrap()
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        assert!(self.0.starts_with(std::env::temp_dir()));
        std::fs::remove_dir_all(&self.0).unwrap();
    }
}
fn n(v: i64) -> SafeInt {
    SafeInt::new(v).unwrap()
}
/// Use realistic 36-character client IDs, including appearance IDs: short test
/// IDs would understate the finished export size. None come from the match RNG.
fn id(namespace: u32, ordinal: i64) -> EntityId {
    EntityId::new(format!("{namespace:08x}-0000-4000-8000-{ordinal:012x}")).unwrap()
}
fn career(ordinal: i64) -> CreationRequest {
    CreationRequest {
        kind: CreationKind::Career,
        reset_revision: None,
        career: CareerInput {
            campaign_id: id(0x80600001, ordinal),
            name: format!("Full season {ordinal}"),
            seed: format!("p08-g06-season-{ordinal}"),
            start_year: n(2026),
            club_key: "club:01".into(),
            rules_mode: RulesMode::Challenge,
            preset: Preset::Balanced,
            now: NOW.into(),
            season_id: id(0x80600002, ordinal),
            clock_id: id(0x80600003, ordinal),
            constitution_id: id(0x80600004, ordinal),
            allocation_id: id(0x80600005, ordinal),
            receipt_id: id(0x80600006, ordinal),
            audit_event_id: id(0x80600007, ordinal),
            action_id: id(0x80600008, ordinal),
        },
    }
}
fn tables(store: &NativeStore, campaign: &EntityId) -> SnapshotTables {
    // Read the same validated tables without serializing an export envelope on
    // every checkpoint. The desktop export and import are certified at the end.
    store.read_campaign(campaign.as_str()).unwrap()
}
fn fresh() -> EntityId {
    id(0x80600401, SEQUENCE.fetch_add(1, Ordering::Relaxed) as i64)
}
fn many(count: i64) -> Vec<EntityId> {
    (0..count).map(|_| fresh()).collect()
}
fn commit_market(store: &NativeStore, preview: MarketPreview) {
    run_market(
        store,
        RunMarketRequest {
            campaign_id: preview.campaign_id,
            expected_revision: preview.revision,
            source_date: preview.from_date,
            source_boundary_key: preview.source_boundary_key,
            negotiation_ids: many(preview.negotiation_count.get()),
            offer_ids: many(preview.offer_count.get()),
            transfer_ids: many(preview.transfer_count.get()),
            contract_ids: many(preview.contract_count.get()),
            ledger_ids: many(preview.ledger_count.get()),
            registration_ids: many(preview.registration_count.get()),
            receipt_id: fresh(),
            audit_id: fresh(),
            action_id: fresh(),
            now: NOW.into(),
        },
    )
    .unwrap();
}
fn accept_qualifying(store: &NativeStore, campaign: &EntityId) {
    loop {
        let board = transfer_board(store, campaign.clone()).unwrap();
        let Some(offer) = board.incoming.into_iter().find(|row| !row.reject_allowed) else {
            break;
        };
        let time = preview_time(store, campaign.clone()).unwrap();
        respond_offer(
            store,
            RespondOfferRequest {
                campaign_id: campaign.clone(),
                expected_revision: time.revision,
                source_date: time.from_date,
                source_boundary_key: time.source_boundary_key,
                offer_id: offer.offer_id,
                decision: game_core::market_ops::OfferDecision::Accept,
                transfer_id: fresh(),
                contract_id: fresh(),
                ledger_ids: many(offer.ledger_count.get()),
                registration_id: offer.needs_registration.then(fresh),
                receipt_id: fresh(),
                audit_id: fresh(),
                action_id: fresh(),
                now: NOW.into(),
            },
        )
        .unwrap();
    }
}
fn release_market(store: &NativeStore, campaign: &EntityId) {
    for _ in 0..8 {
        let market = preview_market(store, campaign.clone()).unwrap();
        match market.action {
            game_core::market_ops::MarketAction::Run if market.allowed => {
                commit_market(store, market)
            }
            game_core::market_ops::MarketAction::Close if market.allowed => {
                close_window(
                    store,
                    CloseWindowRequest {
                        campaign_id: campaign.clone(),
                        expected_revision: market.revision,
                        source_date: market.from_date,
                        source_boundary_key: market.source_boundary_key,
                        receipt_id: fresh(),
                        audit_id: fresh(),
                        action_id: fresh(),
                        now: NOW.into(),
                    },
                )
                .unwrap();
            }
            game_core::market_ops::MarketAction::Close => accept_qualifying(store, campaign),
            _ => break,
        }
    }
}
fn reach(store: &NativeStore, campaign: &EntityId, date: &str) {
    for _ in 0..40 {
        let time = preview_time(store, campaign.clone()).unwrap();
        if time.from_date == date {
            return;
        }
        if time.reason.as_deref() == Some(game_core::calendar::ACCEPT_QUALIFYING_OFFER) {
            accept_qualifying(store, campaign);
            continue;
        }
        release_market(store, campaign);
        let time = preview_time(store, campaign.clone()).unwrap();
        if time.from_date == date {
            return;
        }
        assert!(time.allowed, "{} {:?}", time.from_date, time.reason);
        advance_time(
            store,
            AdvanceRequest {
                campaign_id: time.campaign_id,
                expected_revision: time.revision,
                source_date: time.from_date,
                source_boundary_key: time.source_boundary_key,
                target_boundary_key: time.target_boundary_key.unwrap(),
                action_id: fresh(),
                audit_id: fresh(),
                receipt_id: fresh(),
                now: NOW.into(),
            },
        )
        .unwrap();
    }
    panic!("did not reach {date}");
}
fn advance(store: &NativeStore, campaign: &EntityId, ordinal: i64) {
    let p = preview_time(store, campaign.clone()).unwrap();
    assert!(p.allowed);
    advance_time(
        store,
        AdvanceRequest {
            campaign_id: campaign.clone(),
            expected_revision: p.revision,
            source_date: p.from_date,
            source_boundary_key: p.source_boundary_key,
            target_boundary_key: p.target_boundary_key.unwrap(),
            action_id: id(0x80600101, ordinal),
            audit_id: id(0x80600102, ordinal),
            receipt_id: id(0x80600103, ordinal),
            now: NOW.into(),
        },
    )
    .unwrap();
}
fn request(p: MatchdayPreview, round: i64) -> SimMatchdayRequest {
    assert!(p.allowed, "round {round}: {:?}", p.blocker);
    assert_eq!(p.round, Some(n(round)));
    assert_eq!(p.match_count, n(36));
    assert_eq!(p.fixture_count, n(if round == 1 { 1_224 } else { 0 }));
    assert!((792..=1_152).contains(&p.appearance_count.get()));
    SimMatchdayRequest {
        campaign_id: p.campaign_id,
        expected_revision: p.revision,
        source_date: p.from_date,
        source_boundary_key: p.source_boundary_key,
        target_date: p.target_date.unwrap(),
        action_id: id(0x80600201, round),
        audit_id: id(0x80600202, round),
        receipt_id: id(0x80600203, round),
        now: NOW.into(),
        fixture_ids: (0..p.fixture_count.get())
            .map(|i| id(0x80600301, i))
            .collect(),
        match_ids: (0..36)
            .map(|i| id(0x80600302, (round - 1) * 36 + i))
            .collect(),
        appearance_ids: (0..p.appearance_count.get())
            .map(|i| id(0x80600303, (round - 1) * 2_000 + i))
            .collect(),
    }
}

fn unchanged_except_matchday(kickoff: &SnapshotTables, finished: &SnapshotTables) {
    let mut normalized = finished.clone();
    // Do not hide changes to a campaign's club, seed, status or identity.
    normalized.campaigns[0].revision = kickoff.campaigns[0].revision;
    normalized.campaigns[0]
        .updated_at
        .clone_from(&kickoff.campaigns[0].updated_at);
    normalized.simulation_states[0]
        .current_date
        .clone_from(&kickoff.simulation_states[0].current_date);
    normalized.simulation_states[0]
        .last_boundary_key
        .clone_from(&kickoff.simulation_states[0].last_boundary_key);
    normalized.simulation_states[0].phase = kickoff.simulation_states[0].phase;
    let original = kickoff
        .player_simulation_states
        .iter()
        .map(|s| (s.id.as_str(), s))
        .collect::<BTreeMap<_, _>>();
    for state in &mut normalized.player_simulation_states {
        assert!((0..=100).contains(&state.fitness.get()));
        assert!((0..=100).contains(&state.sharpness.get()));
        assert!(state.suspension_matches.get() >= 0);
        if let Some(date) = &state.injury_until_date {
            DateOnly::parse(date).unwrap();
        }
        let before = original[state.id.as_str()];
        state.fitness = before.fitness;
        state.sharpness = before.sharpness;
        state
            .injury_until_date
            .clone_from(&before.injury_until_date);
        state.suspension_matches = before.suspension_matches;
    }
    normalized.fixtures.clone_from(&kickoff.fixtures);
    normalized
        .simulated_matches
        .clone_from(&kickoff.simulated_matches);
    normalized
        .simulated_appearances
        .clone_from(&kickoff.simulated_appearances);
    normalized.audit_events.clone_from(&kickoff.audit_events);
    normalized
        .simulation_receipts
        .clone_from(&kickoff.simulation_receipts);
    normalized.negotiations.clone_from(&kickoff.negotiations);
    normalized.offers.clone_from(&kickoff.offers);
    normalized.transfers.clone_from(&kickoff.transfers);
    normalized.contracts.clone_from(&kickoff.contracts);
    normalized
        .ledger_entries
        .clone_from(&kickoff.ledger_entries);
    normalized.registrations.clone_from(&kickoff.registrations);
    normalized.lineups.clone_from(&kickoff.lineups);
    normalized
        .club_simulation_states
        .clone_from(&kickoff.club_simulation_states);
    let original_players = kickoff
        .players
        .iter()
        .map(|player| (player.id.as_str(), player))
        .collect::<BTreeMap<_, _>>();
    for player in &mut normalized.players {
        let before = original_players[player.id.as_str()];
        player.club_id.clone_from(&before.club_id);
    }
    // This includes every player/attribute, contract, ledger, offer, constitution,
    // registration, lineup, ownership, and planning row without a whitelist gap.
    assert_eq!(&normalized, kickoff);
}

fn reconcile_season(tables: &SnapshotTables) {
    assert_eq!(tables.fixtures.len(), 1_224);
    assert_eq!(tables.simulated_matches.len(), 1_224);
    assert!(tables
        .fixtures
        .iter()
        .all(|f| f.status == FixtureStatus::Played));
    assert_eq!(
        tables
            .fixtures
            .iter()
            .map(|f| f.fixture_key.as_str())
            .collect::<BTreeSet<_>>()
            .len(),
        1_224
    );
    let mut per_league = BTreeMap::new();
    let mut dates = BTreeMap::new();
    let mut pairs = BTreeMap::<_, Vec<_>>::new();
    let mut rounds = BTreeMap::new();
    for f in &tables.fixtures {
        *per_league.entry(f.league_id.as_str()).or_insert(0) += 1;
        *dates.entry(f.match_date.as_str()).or_insert(0) += 1;
        *rounds
            .entry((f.league_id.as_str(), f.round.get()))
            .or_insert(0) += 1;
        let (a, b) = if f.home_club_id.as_str() < f.away_club_id.as_str() {
            (&f.home_club_id, &f.away_club_id)
        } else {
            (&f.away_club_id, &f.home_club_id)
        };
        pairs
            .entry((f.league_id.as_str(), a.as_str(), b.as_str()))
            .or_default()
            .push(f.home_club_id.as_str());
    }
    assert_eq!(per_league.len(), 4);
    assert!(per_league.values().all(|&count| count == 306));
    assert_eq!(dates.len(), 34);
    assert!(dates.values().all(|&count| count == 36));
    assert_eq!(rounds.len(), 136);
    assert!(rounds.values().all(|&count| count == 9));
    assert_eq!(pairs.len(), 612);
    assert!(pairs
        .values()
        .all(|homes| homes.len() == 2 && homes[0] != homes[1]));
    let mut participant_keys = BTreeSet::new();
    let mut appearances = BTreeMap::<_, Vec<_>>::new();
    for a in &tables.simulated_appearances {
        assert!(participant_keys.insert((a.fixture_id.as_str(), a.player_id.as_str())));
        assert!((1..=90).contains(&a.minutes.get()));
        assert!((1..=99).contains(&a.rating.get()));
        assert!((0..=2).contains(&a.yellow_cards.get()));
        assert!((0..=1).contains(&a.red_cards.get()));
        if a.yellow_cards.get() == 2 {
            assert_eq!(a.red_cards.get(), 1);
        }
        appearances
            .entry(a.fixture_id.as_str())
            .or_default()
            .push(a);
    }
    let players = tables
        .player_simulation_states
        .iter()
        .map(|s| (s.simulation_key.as_str(), s.player_id.as_str()))
        .collect::<BTreeMap<_, _>>();
    let player_keys = players
        .iter()
        .map(|(key, id)| (*id, *key))
        .collect::<BTreeMap<_, _>>();
    let fixtures = tables
        .fixtures
        .iter()
        .map(|f| (f.id.as_str(), f))
        .collect::<BTreeMap<_, _>>();
    let reds = tables
        .simulated_appearances
        .iter()
        .filter(|a| a.red_cards.get() == 1)
        .map(|a| {
            (
                (
                    fixtures[a.fixture_id.as_str()].round.get(),
                    a.player_id.as_str(),
                ),
                1_i64,
            )
        })
        .collect::<BTreeMap<_, _>>();
    assert!(!reds.is_empty());
    assert!(tables
        .simulated_appearances
        .iter()
        .any(|a| a.yellow_cards.get() == 2));
    // Every club plays once per round. A previous one-match ban is served even
    // when the player is omitted; a new red starts a fresh ban after serving it.
    for state in &tables.player_simulation_states {
        assert_eq!(
            state.suspension_matches.get(),
            reds.get(&(34, state.player_id.as_str()))
                .copied()
                .unwrap_or(0)
        );
    }
    let mut match_keys = BTreeSet::new();
    for m in &tables.simulated_matches {
        assert!(match_keys.insert(m.fixture_id.as_str()));
        let f = fixtures[m.fixture_id.as_str()];
        let apps = &appearances[m.fixture_id.as_str()];
        let events = m.timeline.as_array().unwrap();
        for side in ["home", "away"] {
            for player in m.input_snapshot["kickoff"][side].as_array().unwrap() {
                let player_id = players[player["simulationKey"].as_str().unwrap()];
                assert_eq!(
                    player["suspensionMatches"].as_i64().unwrap(),
                    reds.get(&(f.round.get() - 1, player_id))
                        .copied()
                        .unwrap_or(0)
                );
            }
        }
        assert!(events.len() <= 80);
        for e in events {
            assert!((1..=90).contains(&e["minute"].as_i64().unwrap()));
            assert!(["goal", "yellow", "red", "substitution", "injury"]
                .contains(&e["kind"].as_str().unwrap()));
            let club = match e["side"].as_str().unwrap() {
                "home" => &f.home_club_id,
                "away" => &f.away_club_id,
                _ => panic!("invalid event side"),
            };
            for key in ["simulationKey", "assistKey", "incomingSimulationKey"] {
                if let Some(key) = e[key].as_str() {
                    assert!(apps
                        .iter()
                        .any(|a| a.player_id.as_str() == players[key] && &a.club_id == club));
                }
            }
        }
        for (side, club, score, xg) in [
            ("home", &f.home_club_id, m.home_goals, m.home_xg_milli),
            ("away", &f.away_club_id, m.away_goals, m.away_xg_milli),
        ] {
            assert_eq!(
                score.get(),
                events
                    .iter()
                    .filter(|e| e["kind"] == "goal" && e["side"] == side)
                    .count() as i64
            );
            assert_eq!(
                score.get(),
                apps.iter()
                    .filter(|a| &a.club_id == club)
                    .map(|a| a.goals.get())
                    .sum::<i64>()
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
            let lost = events
                .iter()
                .filter(|e| {
                    e["side"] == side
                        && (e["kind"] == "red"
                            || (e["kind"] == "injury"
                                && !events.iter().any(|sub| {
                                    sub["kind"] == "substitution"
                                        && sub["simulationKey"] == e["simulationKey"]
                                        && sub["minute"] == e["minute"]
                                })))
                })
                .map(|e| 90 - e["minute"].as_i64().unwrap())
                .sum::<i64>();
            assert_eq!(
                apps.iter()
                    .filter(|a| &a.club_id == club)
                    .map(|a| a.minutes.get())
                    .sum::<i64>(),
                990 - lost
            );
        }
        for a in apps {
            assert!(a.club_id == f.home_club_id || a.club_id == f.away_club_id);
            let key = player_keys[a.player_id.as_str()];
            let count = |kind: &str| {
                events
                    .iter()
                    .filter(|e| e["kind"] == kind && e["simulationKey"] == key)
                    .count() as i64
            };
            assert_eq!(a.goals.get(), count("goal"));
            assert_eq!(a.yellow_cards.get(), count("yellow"));
            assert_eq!(a.red_cards.get(), count("red"));
            assert_eq!(
                a.assists.get(),
                events
                    .iter()
                    .filter(|e| e["kind"] == "goal" && e["assistKey"] == key)
                    .count() as i64
            );
        }
    }
}

#[test]
#[ignore = "season certification: run pnpm native:test:season"]
fn full_season_reopens_replays_reconciles_and_exports_within_limit() {
    let started = Instant::now();
    let directory = Directory::new();
    let mut store = directory.store();
    let creation = career(1);
    let campaign = creation.career.campaign_id.clone();
    create_career(&store, creation).unwrap();
    assert_eq!(
        preview_time(&store, campaign.clone()).unwrap().from_date,
        "2026-07-01"
    );
    reach(&store, &campaign, "2026-08-31");
    assert_eq!(
        preview_time(&store, campaign.clone()).unwrap().from_date,
        "2026-08-31"
    );
    reach(&store, &campaign, "2026-09-01");
    let kickoff = tables(&store, &campaign);
    assert_eq!(kickoff.simulation_states[0].current_date, "2026-09-01");
    assert!(kickoff.fixtures.is_empty());
    let other_creation = career(2);
    let other_id = other_creation.career.campaign_id.clone();
    create_career(&store, other_creation).unwrap();
    let other_before = tables(&store, &other_id);
    let mut first_request = None;
    let mut first_receipt = None;
    let mut first_matches = Vec::new();
    let kickoff_date = DateOnly::parse("2026-09-01").unwrap();
    for round in 1..=34 {
        let round_started = Instant::now();
        if round == 19 || round == 23 {
            let before = tables(&store, &campaign).simulated_matches;
            let blocked = preview_matchday(&store, campaign.clone()).unwrap();
            assert!(!blocked.allowed);
            assert_eq!(
                blocked.blocker.as_deref(),
                Some(if round == 19 {
                    game_core::calendar::RUN_MARKET_BEFORE_MATCHDAY
                } else {
                    game_core::calendar::CLOSE_WINDOW_BEFORE_MATCHDAY
                })
            );
            release_market(&store, &campaign);
            assert_eq!(tables(&store, &campaign).simulated_matches, before);
        } else if (20..=22).contains(&round) {
            // Only January rounds have market ticks. Matchday preview still
            // checks the authoritative market gate on every other round.
            release_market(&store, &campaign);
        }
        let market_elapsed = round_started.elapsed();
        let preview_started = Instant::now();
        let p = preview_matchday(&store, campaign.clone()).unwrap();
        let preview_elapsed = preview_started.elapsed();
        // A fresh, unregistered career uses G03's advertised emergency selection.
        // The registered saved-XI/blocker path is certified separately by G05.
        assert!(p.emergency);
        assert_eq!(
            p.from_date,
            add_days(&kickoff_date, (round - 1) * 7).unwrap().as_str()
        );
        if round == 19 {
            let winter = tables(&store, &campaign);
            assert_eq!(
                calendar::active_transfer_window(&winter.simulation_states[0], &winter.seasons[0])
                    .unwrap(),
                Some(calendar::TransferWindow::Winter)
            );
        }
        let revision = p.revision.get();
        let req = request(p, round);
        let commit_started = Instant::now();
        let outcome = sim_matchday(&store, req.clone()).unwrap();
        let commit_elapsed = commit_started.elapsed();
        assert!(!outcome.replayed);
        assert_eq!(outcome.revision.get(), revision + 1);
        assert_eq!(
            outcome.phase,
            if round == 34 {
                CalendarPhase::Review
            } else {
                CalendarPhase::League
            }
        );
        assert_eq!(
            outcome.current_date,
            add_days(&kickoff_date, round.min(33) * 7).unwrap().as_str()
        );
        if round == 1 {
            first_request = Some(req);
            first_receipt = Some(outcome.receipt_id);
            let saved = tables(&store, &campaign);
            first_matches = saved.simulated_matches.clone();
            drop(store);
            store = directory.store();
            assert_eq!(tables(&store, &campaign), saved);
        }
        eprintln!(
            "full-season round {round}/34: market={:.2}s preview={:.2}s commit={:.2}s ({:.2}s elapsed)",
            market_elapsed.as_secs_f64(),
            preview_elapsed.as_secs_f64(),
            commit_elapsed.as_secs_f64(),
            started.elapsed().as_secs_f64(),
        );
    }
    let finished = tables(&store, &campaign);
    drop(store);
    let store = directory.store();
    assert_eq!(tables(&store, &campaign), finished);
    reconcile_season(&finished);
    unchanged_except_matchday(&kickoff, &finished);
    let market_writes = |rows: &SnapshotTables| {
        rows.audit_events
            .iter()
            .filter(|audit| {
                matches!(
                    audit.action_type,
                    AuditAction::MarketTick
                        | AuditAction::MarketClose
                        | AuditAction::TransferSettle
                )
            })
            .count()
    };
    let added = market_writes(&finished) - market_writes(&kickoff);
    assert_eq!(
        finished.audit_events.len(),
        kickoff.audit_events.len() + 34 + added
    );
    assert_eq!(
        finished.simulation_receipts.len(),
        kickoff.simulation_receipts.len() + 34 + added
    );
    assert_eq!(
        finished
            .audit_events
            .iter()
            .filter(|a| a.action_type == AuditAction::SimulationMatchday)
            .count(),
        34
    );
    let replay = sim_matchday(&store, first_request.unwrap()).unwrap();
    assert!(replay.replayed);
    assert_eq!(replay.receipt_id, first_receipt.unwrap());
    assert_eq!(replay.revision, finished.campaigns[0].revision);
    assert_eq!(tables(&store, &campaign), finished);
    for m in &first_matches {
        assert_eq!(
            finished
                .simulated_matches
                .iter()
                .find(|saved| saved.id == m.id),
            Some(m)
        );
    }
    let view = matchday_view(&store, campaign.clone(), None).unwrap();
    assert_eq!(view.round, n(34));
    assert_eq!(view.fixtures.len(), 36);
    assert_eq!(view.matches.len(), 36);
    assert_eq!(view.leagues.len(), 4);
    for league in &view.leagues {
        assert_eq!(league.rows.len(), 18);
        assert!(league.rows.iter().all(|r| r.played == n(34)));
        let scores = finished
            .simulated_matches
            .iter()
            .map(|m| (m.fixture_id.as_str(), m))
            .collect::<BTreeMap<_, _>>();
        for row in &league.rows {
            let mut totals = [0_i64; 6]; // wins, draws, losses, goals for/against, points
            for fixture in finished
                .fixtures
                .iter()
                .filter(|f| f.home_club_id == row.club_id || f.away_club_id == row.club_id)
            {
                let m = scores[fixture.id.as_str()];
                let (scored, conceded) = if fixture.home_club_id == row.club_id {
                    (m.home_goals.get(), m.away_goals.get())
                } else {
                    (m.away_goals.get(), m.home_goals.get())
                };
                totals[3] += scored;
                totals[4] += conceded;
                match scored.cmp(&conceded) {
                    std::cmp::Ordering::Greater => {
                        totals[0] += 1;
                        totals[5] += 3;
                    }
                    std::cmp::Ordering::Equal => {
                        totals[1] += 1;
                        totals[5] += 1;
                    }
                    std::cmp::Ordering::Less => totals[2] += 1,
                }
            }
            assert_eq!(
                [
                    row.won.get(),
                    row.drawn.get(),
                    row.lost.get(),
                    row.goals_for.get(),
                    row.goals_against.get(),
                    row.points.get()
                ],
                totals
            );
            assert_eq!(row.goal_difference.get(), totals[3] - totals[4]);
        }
        assert_eq!(
            league.rows.iter().map(|r| r.goals_for.get()).sum::<i64>(),
            league
                .rows
                .iter()
                .map(|r| r.goals_against.get())
                .sum::<i64>()
        );
        assert!(league.rows.windows(2).all(|r| (
            -r[0].points.get(),
            -r[0].goal_difference.get(),
            -r[0].goals_for.get(),
            &r[0].simulation_key
        ) <= (
            -r[1].points.get(),
            -r[1].goal_difference.get(),
            -r[1].goals_for.get(),
            &r[1].simulation_key
        )));
    }
    let review = preview_matchday(&store, campaign.clone()).unwrap();
    assert!(!review.allowed);
    assert_eq!(
        review.blocker.as_deref(),
        Some(game_core::matchday::ROLLOVER_UNAVAILABLE)
    );
    let time = preview_time(&store, campaign.clone()).unwrap();
    assert!(!time.allowed);
    assert_eq!(
        time.reason.as_deref(),
        Some(game_core::matchday::ROLLOVER_UNAVAILABLE)
    );
    let refused = SimMatchdayRequest {
        campaign_id: campaign.clone(),
        expected_revision: review.revision,
        source_date: review.from_date.clone(),
        source_boundary_key: review.source_boundary_key,
        target_date: add_days(&DateOnly::parse(&review.from_date).unwrap(), 7)
            .unwrap()
            .as_str()
            .into(),
        action_id: id(0x80600201, 35),
        audit_id: id(0x80600202, 35),
        receipt_id: id(0x80600203, 35),
        now: NOW.into(),
        fixture_ids: vec![],
        match_ids: vec![],
        appearance_ids: vec![],
    };
    assert_eq!(
        sim_matchday(&store, refused).unwrap_err().to_string(),
        game_core::matchday::ROLLOVER_UNAVAILABLE
    );
    assert_eq!(tables(&store, &campaign), finished);
    let target = directory.0.join("finished-season.json");
    assert!(export_file(
        &store,
        campaign.as_str(),
        Some(&target),
        "finished-season",
        NOW
    )
    .unwrap());
    let bytes = std::fs::read(&target).unwrap();
    // Optional reusable artifact for comparing internal-read implementations on
    // this exact certified complete-season save. Normal tests leave no artifact.
    if let Some(path) = std::env::var_os("TOUCHLINE_SEASON_BENCHMARK_SAVE") {
        std::fs::write(path, &bytes).unwrap();
    }
    eprintln!(
        "full-season export: {} bytes; {} appearances",
        bytes.len(),
        finished.simulated_appearances.len()
    );
    assert!(
        bytes.len() <= EXPORT_LIMIT,
        "desktop export {} bytes exceeds {EXPORT_LIMIT}",
        bytes.len()
    );
    let exported = parse_snapshot(&bytes).unwrap();
    assert_eq!(exported.source_schema_version, n(5));
    assert_eq!(exported.tables, finished);
    let restored = NativeStore::open(directory.0.join("restored.sqlite3")).unwrap();
    let session = MigrationSession::default();
    let summary = session.select(Some(&target)).unwrap().unwrap();
    session.confirm(&restored, &summary.token).unwrap();
    assert_eq!(tables(&restored, &campaign), finished);
    assert_eq!(tables(&store, &other_id), other_before);
    release_market(&store, &other_id);
    advance(&store, &other_id, 3);
    assert_eq!(
        preview_time(&store, other_id).unwrap().from_date,
        "2026-07-08"
    );
    assert_eq!(tables(&store, &campaign), finished);
    eprintln!("full-season certification passed: 34 rounds, 1,224 matches, {} appearances, {} export bytes, {:.2}s runtime",finished.simulated_appearances.len(),bytes.len(),started.elapsed().as_secs_f64());
    // G04 must also export a real complete season plus the opening calendar,
    // without requiring an explicit halfway development call in those 34 rounds.
    let preview = preview_season(&restored, campaign.clone()).unwrap();
    let counts = &preview.id_counts;
    let rollover = LifecycleRequest {
        campaign_id: campaign.clone(),
        season_id: preview.season_id,
        expected_revision: preview.revision,
        source_date: preview.source_date,
        source_boundary_key: preview.source_boundary_key,
        input_fingerprint: preview.input_fingerprint,
        ids: game_core::lifecycle_ops::LifecycleIds {
            players: many(counts.players as i64),
            player_states: many(counts.player_states as i64),
            contracts: many(counts.contracts as i64),
            registrations: many(counts.registrations as i64),
            ledger: many(counts.ledger as i64),
            fixtures: many(counts.fixtures as i64),
            seasons: many(counts.seasons as i64),
            settlements: many(counts.settlements as i64),
            objectives: many(counts.objectives as i64),
            snapshots: many(counts.snapshots as i64),
        },
        receipt_id: fresh(),
        audit_id: fresh(),
        action_id: fresh(),
        now: NOW.into(),
    };
    settle_season(&restored, rollover.clone()).unwrap();
    let settled = tables(&restored, &campaign);
    assert_eq!(settled.fixtures.len(), 2448);
    assert_eq!(settled.simulated_matches, finished.simulated_matches);
    assert_eq!(
        settled.simulated_appearances,
        finished.simulated_appearances
    );
    assert!(settled
        .development_snapshots
        .iter()
        .all(|d| d.period == DevelopmentPeriod::SeasonEnd));
    assert!(settle_season(&restored, rollover).unwrap().replayed);
    let settled_export = restored
        .export_snapshot(campaign.as_str(), "settled-season", NOW)
        .unwrap();
    let settled_bytes = serde_json::to_vec(&settled_export).unwrap();
    assert!(settled_bytes.len() <= EXPORT_LIMIT);
    eprintln!("settled-season export: {} bytes", settled_bytes.len());
}
