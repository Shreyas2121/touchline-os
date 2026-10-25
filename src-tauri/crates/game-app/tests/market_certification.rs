//! Fixed-seed market certification through the public services and real SQLite.
//! Phase 8 already plays all 34 rounds; this file stops at the winter close.
use game_app::*;
use game_core::{
    career::CareerInput,
    dates::{add_days, DateOnly},
    management::CreationKind,
    market_ops::{NegotiationDecision, OfferDecision},
    policy::Preset,
    *,
};
use rusqlite::Connection;
use std::{
    collections::{BTreeMap, BTreeSet},
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Instant,
};

const NOW: &str = "2026-10-23T12:00:00.000Z";
const SEED: &str = "p09-g06-market";
const EXPORT_LIMIT: usize = 32 * 1024 * 1024;
static SEQUENCE: AtomicU64 = AtomicU64::new(1);

struct Directory(PathBuf);
impl Directory {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "touchline-market-cert-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn store(&self) -> NativeStore {
        NativeStore::open(self.0.join("market.sqlite3")).unwrap()
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        assert!(self.0.starts_with(std::env::temp_dir()));
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn n(value: i64) -> SafeInt {
    SafeInt::new(value).unwrap()
}
fn money(value: i64) -> MoneyCents {
    MoneyCents::new(value).unwrap()
}
fn eid(namespace: u32, ordinal: i64) -> EntityId {
    EntityId::new(format!("{namespace:08x}-0000-4000-8000-{ordinal:012x}")).unwrap()
}
fn fresh() -> EntityId {
    eid(0x9060_0401, SEQUENCE.fetch_add(1, Ordering::Relaxed) as i64)
}
fn many(count: i64) -> Vec<EntityId> {
    (0..count).map(|_| fresh()).collect()
}
fn tables(store: &NativeStore, campaign: &EntityId) -> SnapshotTables {
    store
        .export_snapshot(campaign.as_str(), "market-certification", NOW)
        .unwrap()
        .tables
}
fn career(store: &NativeStore, ordinal: i64) -> EntityId {
    let campaign = eid(0x9060_0001, ordinal);
    create_career(
        store,
        CreationRequest {
            kind: CreationKind::Career,
            reset_revision: None,
            career: CareerInput {
                campaign_id: campaign.clone(),
                name: format!("Market certification {ordinal}"),
                seed: SEED.into(),
                start_year: n(2026),
                club_key: "club:01".into(),
                rules_mode: RulesMode::Challenge,
                preset: Preset::Balanced,
                now: NOW.into(),
                season_id: eid(0x9060_0002, ordinal),
                clock_id: eid(0x9060_0003, ordinal),
                constitution_id: eid(0x9060_0004, ordinal),
                allocation_id: eid(0x9060_0005, ordinal),
                receipt_id: eid(0x9060_0006, ordinal),
                audit_event_id: eid(0x9060_0007, ordinal),
                action_id: eid(0x9060_0008, ordinal),
            },
        },
    )
    .unwrap();
    campaign
}
fn request_for(preview: &MarketPreview) -> RunMarketRequest {
    RunMarketRequest {
        campaign_id: preview.campaign_id.clone(),
        expected_revision: preview.revision,
        source_date: preview.from_date.clone(),
        source_boundary_key: preview.source_boundary_key.clone(),
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
    }
}
fn run(store: &NativeStore, preview: &MarketPreview) -> RunMarketRequest {
    let request = request_for(preview);
    let outcome = run_market(store, request.clone()).unwrap();
    assert!(!outcome.replayed);
    request
}
fn balance_sum(saved: &SnapshotTables, campaign: &EntityId) -> i64 {
    saved
        .club_simulation_states
        .iter()
        .filter(|row| &row.campaign_id == campaign)
        .map(|row| row.transfer_balance_cents.get())
        .sum()
}
fn open_negotiation(status: NegotiationStatus) -> bool {
    matches!(
        status,
        NegotiationStatus::Proposed | NegotiationStatus::Countered | NegotiationStatus::Agreed
    )
}
fn assert_caps(saved: &SnapshotTables, campaign: &EntityId, date: &str) {
    let opened = saved
        .negotiations
        .iter()
        .filter(|row| &row.campaign_id == campaign && row.opened_on == date)
        .collect::<Vec<_>>();
    assert!(
        opened.len() <= 12,
        "{} negotiations on {date}",
        opened.len()
    );
    let mut created = BTreeMap::<&str, i64>::new();
    for row in &opened {
        *created.entry(row.buyer_club_id.as_str()).or_insert(0) += 1;
    }
    assert!(created.values().all(|count| *count <= 1));
    let mut open = BTreeMap::<&str, i64>::new();
    for row in saved
        .negotiations
        .iter()
        .filter(|row| &row.campaign_id == campaign && open_negotiation(row.status))
    {
        *open.entry(row.buyer_club_id.as_str()).or_insert(0) += 1;
    }
    assert!(open.values().all(|count| *count <= 3));
    for state in saved
        .club_simulation_states
        .iter()
        .filter(|row| &row.campaign_id == campaign)
    {
        let rows = saved
            .negotiations
            .iter()
            .filter(|row| {
                &row.campaign_id == campaign
                    && row.buyer_club_id == state.club_id
                    && open_negotiation(row.status)
            })
            .collect::<Vec<_>>();
        let reserved = rows.iter().map(|row| row.reserved_cents.get()).sum::<i64>();
        let balance = state.transfer_balance_cents.get();
        assert!(
            reserved <= balance,
            "{} reserved {reserved} against {balance}",
            state.club_id.as_str()
        );
        for row in rows {
            let others = reserved - row.reserved_cents.get();
            assert!(balance - others >= row.reserved_cents.get());
        }
    }
}
fn advance_once(store: &NativeStore, campaign: &EntityId) {
    let time = preview_time(store, campaign.clone()).unwrap();
    assert!(time.allowed, "{} {:?}", time.from_date, time.reason);
    advance_time(
        store,
        AdvanceRequest {
            campaign_id: campaign.clone(),
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
fn qualifying_ids(store: &NativeStore, campaign: &EntityId) -> Vec<EntityId> {
    transfer_board(store, campaign.clone())
        .unwrap()
        .incoming
        .into_iter()
        .filter(|row| !row.reject_allowed)
        .map(|row| row.offer_id)
        .collect()
}
fn accept_offer(
    store: &NativeStore,
    campaign: &EntityId,
    offer_id: &EntityId,
) -> RespondOfferRequest {
    let board = transfer_board(store, campaign.clone()).unwrap();
    let offer = board
        .incoming
        .iter()
        .find(|row| &row.offer_id == offer_id)
        .unwrap();
    let time = preview_time(store, campaign.clone()).unwrap();
    let request = RespondOfferRequest {
        campaign_id: campaign.clone(),
        expected_revision: time.revision,
        source_date: time.from_date,
        source_boundary_key: time.source_boundary_key,
        offer_id: offer_id.clone(),
        decision: OfferDecision::Accept,
        transfer_id: fresh(),
        contract_id: fresh(),
        ledger_ids: many(offer.ledger_count.get()),
        registration_id: offer.needs_registration.then(fresh),
        receipt_id: fresh(),
        audit_id: fresh(),
        action_id: fresh(),
        now: NOW.into(),
    };
    let outcome = respond_offer(store, request.clone()).unwrap();
    assert!(!outcome.replayed);
    request
}
fn sim(store: &NativeStore, campaign: &EntityId) {
    if preview_time(store, campaign.clone())
        .unwrap()
        .reason
        .as_deref()
        == Some(game_core::calendar::DEVELOPMENT_DUE)
    {
        let p = preview_development(store, campaign.clone()).unwrap();
        apply_development(
            store,
            LifecycleRequest {
                campaign_id: campaign.clone(),
                season_id: p.season_id,
                expected_revision: p.revision,
                source_date: p.source_date,
                source_boundary_key: p.source_boundary_key,
                input_fingerprint: p.input_fingerprint,
                ids: game_core::lifecycle_ops::LifecycleIds {
                    snapshots: (0..p.id_counts.snapshots).map(|_| fresh()).collect(),
                    ..Default::default()
                },
                receipt_id: fresh(),
                audit_id: fresh(),
                action_id: fresh(),
                now: NOW.into(),
            },
        )
        .unwrap();
    }
    let preview = preview_matchday(store, campaign.clone()).unwrap();
    assert!(
        preview.allowed,
        "{} {:?}",
        preview.from_date, preview.blocker
    );
    eprintln!("winter sim {}", preview.from_date);
    assert_eq!(preview.match_count, n(36));
    assert!((792..=1_152).contains(&preview.appearance_count.get()));
    let round = preview.round.unwrap().get();
    sim_matchday(
        store,
        SimMatchdayRequest {
            campaign_id: campaign.clone(),
            expected_revision: preview.revision,
            source_date: preview.from_date,
            source_boundary_key: preview.source_boundary_key,
            target_date: preview.target_date.unwrap(),
            action_id: eid(0x9060_0201, round),
            audit_id: eid(0x9060_0202, round),
            receipt_id: eid(0x9060_0203, round),
            now: NOW.into(),
            fixture_ids: (0..preview.fixture_count.get())
                .map(|index| eid(0x9060_0301, index))
                .collect(),
            match_ids: (0..36)
                .map(|index| eid(0x9060_0302, (round - 1) * 36 + index))
                .collect(),
            appearance_ids: (0..preview.appearance_count.get())
                .map(|index| eid(0x9060_0303, (round - 1) * 2_000 + index))
                .collect(),
        },
    )
    .unwrap();
}
fn contained<T: PartialEq>(earlier: &[T], later: &[T]) {
    for row in earlier {
        assert!(later.iter().any(|saved| saved == row));
    }
}

#[test]
fn summer_window_conserves_balances_and_replays_ticks() {
    let started = Instant::now();
    let directory = Directory::new();
    let mut store = directory.store();
    let version: i64 = Connection::open(directory.0.join("market.sqlite3"))
        .unwrap()
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, 5);
    let campaign = career(&store, 1);
    let original = balance_sum(&tables(&store, &campaign), &campaign);
    let start = DateOnly::parse("2026-07-01").unwrap();
    let mut july = None;
    for step in 0..9 {
        let date = add_days(&start, step * 7).unwrap();
        let time = preview_time(&store, campaign.clone()).unwrap();
        assert_eq!(time.from_date, date.as_str());
        assert!(!time.allowed);
        let market = preview_market(&store, campaign.clone()).unwrap();
        assert_eq!(market.action, game_core::market_ops::MarketAction::Run);
        assert!(market.allowed);
        assert!(market.negotiation_count.get() <= 12);
        let before = balance_sum(&tables(&store, &campaign), &campaign);
        let request = run(&store, &market);
        let saved = tables(&store, &campaign);
        assert_eq!(balance_sum(&saved, &campaign), before);
        assert_eq!(balance_sum(&saved, &campaign), original);
        assert_caps(&saved, &campaign, date.as_str());
        if step == 0 {
            july = Some(request);
            drop(store);
            store = directory.store();
            assert_eq!(tables(&store, &campaign), saved);
        }
        if step == 8 {
            drop(store);
            store = directory.store();
            assert_eq!(tables(&store, &campaign), saved);
            let revision = saved.campaigns[0].revision;
            let ids = saved
                .negotiations
                .iter()
                .map(|row| row.id.as_str().to_owned())
                .collect::<BTreeSet<_>>();
            let replay = run_market(&store, july.take().unwrap()).unwrap();
            assert!(replay.replayed);
            let after = tables(&store, &campaign);
            assert_eq!(after.campaigns[0].revision, revision);
            assert_eq!(
                after
                    .negotiations
                    .iter()
                    .map(|row| row.id.as_str().to_owned())
                    .collect::<BTreeSet<_>>(),
                ids
            );
            assert_eq!(balance_sum(&after, &campaign), original);
            advance_once(&store, &campaign);
            let deadline = preview_time(&store, campaign.clone()).unwrap();
            assert_eq!(deadline.from_date, "2026-08-31");
            let qualifying = qualifying_ids(&store, &campaign);
            if qualifying.is_empty() {
                assert!(deadline.allowed);
                assert_ne!(
                    deadline.reason.as_deref(),
                    Some(game_core::calendar::ACCEPT_QUALIFYING_OFFER)
                );
                advance_once(&store, &campaign);
            } else {
                let before = tables(&store, &campaign);
                let refused = respond_offer(
                    &store,
                    RespondOfferRequest {
                        campaign_id: campaign.clone(),
                        expected_revision: before.campaigns[0].revision,
                        source_date: before.simulation_states[0].current_date.clone(),
                        source_boundary_key: before.simulation_states[0].last_boundary_key.clone(),
                        offer_id: qualifying[0].clone(),
                        decision: OfferDecision::Reject,
                        transfer_id: fresh(),
                        contract_id: fresh(),
                        ledger_ids: vec![],
                        registration_id: None,
                        receipt_id: fresh(),
                        audit_id: fresh(),
                        action_id: fresh(),
                        now: NOW.into(),
                    },
                )
                .unwrap_err();
                assert_eq!(
                    refused.to_string(),
                    "This bid qualifies and cannot be rejected while the rule is on."
                );
                assert!(!deadline.allowed);
                assert_eq!(
                    deadline.reason.as_deref(),
                    Some(game_core::calendar::ACCEPT_QUALIFYING_OFFER)
                );
                let blocked = advance_time(
                    &store,
                    AdvanceRequest {
                        campaign_id: campaign.clone(),
                        expected_revision: deadline.revision,
                        source_date: deadline.from_date.clone(),
                        source_boundary_key: deadline.source_boundary_key.clone(),
                        target_boundary_key: "season:2026:league-kickoff".into(),
                        action_id: fresh(),
                        audit_id: fresh(),
                        receipt_id: fresh(),
                        now: NOW.into(),
                    },
                );
                assert!(blocked.is_err());
                assert_eq!(tables(&store, &campaign), before);
                for offer in qualifying {
                    let sum = balance_sum(&tables(&store, &campaign), &campaign);
                    let acceptance = accept_offer(&store, &campaign, &offer);
                    assert_eq!(balance_sum(&tables(&store, &campaign), &campaign), sum);
                    let replay = respond_offer(&store, acceptance).unwrap();
                    assert!(replay.replayed);
                    assert_eq!(balance_sum(&tables(&store, &campaign), &campaign), sum);
                }
                advance_once(&store, &campaign);
            }
            assert_eq!(
                preview_time(&store, campaign.clone()).unwrap().from_date,
                "2026-09-01"
            );
        }
        if step < 8 {
            advance_once(&store, &campaign);
        }
    }
    eprintln!(
        "market-certification summer: {:.2}s",
        started.elapsed().as_secs_f64()
    );
}

#[test]
fn qualifying_offer_blocks_close_until_one_accept() {
    let directory = Directory::new();
    let store = directory.store();
    let campaign = career(&store, 2);
    let mut snapshot = store
        .export_snapshot(campaign.as_str(), "qualifying-offer", NOW)
        .unwrap();
    let saved = &snapshot.tables;
    let season = saved.seasons[0].id.clone();
    let managed = saved.campaigns[0].managed_club_id.clone();
    let player = saved
        .players
        .iter()
        .find(|row| row.club_id.as_ref() == Some(&managed))
        .unwrap()
        .id
        .clone();
    let buyer = saved
        .club_simulation_states
        .iter()
        .find(|row| {
            row.campaign_id == campaign
                && row.club_id != managed
                && row.transfer_balance_cents.get() >= 1_000
        })
        .unwrap()
        .club_id
        .clone();
    let constitution = saved.constitutions[0].version;
    let negotiation = eid(0x9060_0501, 2);
    let offer = eid(0x9060_0502, 2);
    snapshot.tables.simulation_states[0].current_date = "2026-08-31".into();
    snapshot.tables.simulation_states[0].phase = CalendarPhase::Preseason;
    snapshot.tables.simulation_states[0].last_boundary_key =
        Some("season:2026:summer-deadline".into());
    snapshot.tables.negotiations.push(NegotiationRow {
        id: negotiation.clone(),
        campaign_id: campaign.clone(),
        season_id: season.clone(),
        player_id: player.clone(),
        buyer_club_id: buyer.clone(),
        seller_club_id: Some(managed.clone()),
        status: NegotiationStatus::Agreed,
        fee_cents: money(1_000),
        reserved_cents: money(1_000),
        wage_cents: money(1),
        reserved_wage_cents: money(1),
        squad_tier: SquadTier::Rotation,
        expires_on: "2027-06-30".into(),
        counter_count: n(0),
        opened_on: "2026-08-17".into(),
        deadline_on: "2026-08-31".into(),
        resolved_on: None,
        engine_version: VersionOne,
        event_seed: n(1),
        qualification: None,
    });
    snapshot.tables.offers.push(OfferRow {
        id: offer.clone(),
        campaign_id: campaign.clone(),
        season_id: season,
        player_id: player,
        bidder_club_id: buyer,
        fee_cents: money(1_000),
        status: OfferStatus::Open,
        received_on: "2026-08-17".into(),
        resolved_on: None,
        negotiation_id: Some(negotiation.clone()),
        seller_club_id: Some(managed),
        deadline_on: Some("2026-08-31".into()),
        origin: Some(OfferOrigin::Ai),
        market_value_cents: Some(money(100)),
        bidder_prestige: Some(n(90)),
        seller_prestige: Some(n(40)),
        constitution_version: Some(constitution),
        compulsory: true,
    });
    let path = directory.0.join("qualifying.json");
    std::fs::write(&path, serde_json::to_vec(&snapshot).unwrap()).unwrap();
    drop(store);
    let imported = NativeStore::open(directory.0.join("imported.sqlite3")).unwrap();
    let session = MigrationSession::default();
    let summary = session.select(Some(&path)).unwrap().unwrap();
    session.confirm(&imported, &summary.token).unwrap();
    let before = tables(&imported, &campaign);
    assert_eq!(before.offers.len(), 1);
    assert_eq!(
        balance_sum(&before, &campaign),
        balance_sum(&snapshot.tables, &campaign)
    );
    let refused = respond_offer(
        &imported,
        RespondOfferRequest {
            campaign_id: campaign.clone(),
            expected_revision: before.campaigns[0].revision,
            source_date: "2026-08-31".into(),
            source_boundary_key: Some("season:2026:summer-deadline".into()),
            offer_id: offer.clone(),
            decision: OfferDecision::Reject,
            transfer_id: fresh(),
            contract_id: fresh(),
            ledger_ids: vec![],
            registration_id: None,
            receipt_id: fresh(),
            audit_id: fresh(),
            action_id: fresh(),
            now: NOW.into(),
        },
    )
    .unwrap_err();
    assert_eq!(
        refused.to_string(),
        "This bid qualifies and cannot be rejected while the rule is on."
    );
    let withdrawn = respond_negotiation(
        &imported,
        RespondNegotiationRequest {
            campaign_id: campaign.clone(),
            expected_revision: before.campaigns[0].revision,
            source_date: "2026-08-31".into(),
            source_boundary_key: Some("season:2026:summer-deadline".into()),
            negotiation_id: negotiation,
            decision: NegotiationDecision::Withdraw,
            receipt_id: fresh(),
            audit_id: fresh(),
            action_id: fresh(),
            now: NOW.into(),
        },
    );
    assert!(withdrawn.is_err());
    let preview = preview_time(&imported, campaign.clone()).unwrap();
    assert!(!preview.allowed);
    assert_eq!(
        preview.reason.as_deref(),
        Some(game_core::calendar::ACCEPT_QUALIFYING_OFFER)
    );
    assert!(advance_time(
        &imported,
        AdvanceRequest {
            campaign_id: campaign.clone(),
            expected_revision: preview.revision,
            source_date: preview.from_date,
            source_boundary_key: preview.source_boundary_key,
            target_boundary_key: "season:2026:league-kickoff".into(),
            action_id: fresh(),
            audit_id: fresh(),
            receipt_id: fresh(),
            now: NOW.into(),
        },
    )
    .is_err());
    let blocked = tables(&imported, &campaign);
    assert_eq!(blocked, before);
    assert_eq!(blocked.offers[0].status, OfferStatus::Open);
    assert_eq!(blocked.negotiations[0].reserved_cents.get(), 1_000);
    let sum = balance_sum(&blocked, &campaign);
    let acceptance = accept_offer(&imported, &campaign, &offer);
    assert_eq!(balance_sum(&tables(&imported, &campaign), &campaign), sum);
    let replay = respond_offer(&imported, acceptance).unwrap();
    assert!(replay.replayed);
    let settled = tables(&imported, &campaign);
    assert_eq!(settled.campaigns[0].revision, replay.revision);
    assert_eq!(balance_sum(&settled, &campaign), sum);
    assert_eq!(settled.transfers.len(), before.transfers.len() + 1);
    advance_once(&imported, &campaign);
    assert_eq!(
        preview_time(&imported, campaign).unwrap().from_date,
        "2026-09-01"
    );
}

#[test]
#[ignore = "season certification: run pnpm native:test:season"]
fn winter_tick_and_close_leave_played_matches_unchanged() {
    let started = Instant::now();
    let directory = Directory::new();
    let store = directory.store();
    let campaign = career(&store, 3);
    let start = DateOnly::parse(
        tables(&store, &campaign).seasons[0]
            .start_date
            .as_deref()
            .unwrap(),
    )
    .unwrap();
    let kickoff = add_days(
        &DateOnly::parse(&format!("{}-08-31", start.year())).unwrap(),
        1,
    )
    .unwrap();
    let january_end = DateOnly::parse(&format!("{}-01-31", start.year() + 1)).unwrap();
    let mut first_january = None;
    let mut close_date = None;
    for round in 1..=34 {
        let played = add_days(&kickoff, (round - 1) * 7).unwrap();
        let month_day = &played.as_str()[5..];
        if first_january.is_none() && played.year() == start.year() + 1 && month_day <= "01-31" {
            first_january = Some(played.clone());
        }
        if close_date.is_none() && played > january_end {
            close_date = Some(played);
        }
    }
    let first_january = first_january.unwrap();
    let close_date = close_date.unwrap();
    // Reach kickoff through the public summer commands, accepting any qualifying bid.
    for _ in 0..40 {
        let time = preview_time(&store, campaign.clone()).unwrap();
        if time.from_date == kickoff.as_str() {
            break;
        }
        if time.reason.as_deref() == Some(game_core::calendar::ACCEPT_QUALIFYING_OFFER) {
            for offer in qualifying_ids(&store, &campaign) {
                accept_offer(&store, &campaign, &offer);
            }
            continue;
        }
        let market = preview_market(&store, campaign.clone()).unwrap();
        if market.action == game_core::market_ops::MarketAction::Run && market.allowed {
            run(&store, &market);
            continue;
        }
        advance_once(&store, &campaign);
    }
    assert_eq!(
        preview_time(&store, campaign.clone()).unwrap().from_date,
        kickoff.as_str()
    );
    loop {
        let preview = preview_matchday(&store, campaign.clone()).unwrap();
        if preview.from_date == first_january.as_str() {
            assert!(!preview.allowed);
            assert_eq!(
                preview.blocker.as_deref(),
                Some(game_core::calendar::RUN_MARKET_BEFORE_MATCHDAY)
            );
            break;
        }
        sim(&store, &campaign);
    }
    let played = tables(&store, &campaign);
    let market = preview_market(&store, campaign.clone()).unwrap();
    assert_eq!(market.action, game_core::market_ops::MarketAction::Run);
    run(&store, &market);
    let ticked = tables(&store, &campaign);
    contained(&played.simulated_matches, &ticked.simulated_matches);
    contained(&played.simulated_appearances, &ticked.simulated_appearances);
    sim(&store, &campaign);
    loop {
        let preview = preview_matchday(&store, campaign.clone()).unwrap();
        if preview.from_date == close_date.as_str() {
            assert!(!preview.allowed);
            assert_eq!(
                preview.blocker.as_deref(),
                Some(game_core::calendar::CLOSE_WINDOW_BEFORE_MATCHDAY)
            );
            break;
        }
        if preview.blocker.as_deref() == Some(game_core::calendar::RUN_MARKET_BEFORE_MATCHDAY) {
            let due = preview_market(&store, campaign.clone()).unwrap();
            assert!(due.allowed);
            run(&store, &due);
            continue;
        }
        sim(&store, &campaign);
    }
    let before_close = tables(&store, &campaign);
    contained(&played.simulated_matches, &before_close.simulated_matches);
    contained(
        &played.simulated_appearances,
        &before_close.simulated_appearances,
    );
    let mut closing = preview_market(&store, campaign.clone()).unwrap();
    if !closing.allowed {
        for offer in qualifying_ids(&store, &campaign) {
            accept_offer(&store, &campaign, &offer);
        }
        closing = preview_market(&store, campaign.clone()).unwrap();
    }
    assert_eq!(closing.action, game_core::market_ops::MarketAction::Close);
    assert!(closing.allowed);
    close_window(
        &store,
        CloseWindowRequest {
            campaign_id: campaign.clone(),
            expected_revision: closing.revision,
            source_date: closing.from_date.clone(),
            source_boundary_key: closing.source_boundary_key,
            receipt_id: fresh(),
            audit_id: fresh(),
            action_id: fresh(),
            now: NOW.into(),
        },
    )
    .unwrap();
    let closed = tables(&store, &campaign);
    assert_eq!(
        closed.simulation_states[0].current_date,
        close_date.as_str()
    );
    contained(&played.simulated_matches, &closed.simulated_matches);
    contained(&played.simulated_appearances, &closed.simulated_appearances);
    sim(&store, &campaign);
    let finished = tables(&store, &campaign);
    contained(&played.simulated_matches, &finished.simulated_matches);
    contained(
        &played.simulated_appearances,
        &finished.simulated_appearances,
    );
    let target = directory.0.join("winter-window.json");
    assert!(export_file(
        &store,
        campaign.as_str(),
        Some(&target),
        "winter-window",
        NOW
    )
    .unwrap());
    let bytes = std::fs::read(&target).unwrap();
    assert!(bytes.len() <= EXPORT_LIMIT, "{} bytes", bytes.len());
    let exported = parse_snapshot(&bytes).unwrap();
    assert_eq!(exported.source_schema_version, n(5));
    assert_eq!(exported.tables, finished);
    let restored = NativeStore::open(directory.0.join("restored.sqlite3")).unwrap();
    let session = MigrationSession::default();
    let summary = session.select(Some(&target)).unwrap().unwrap();
    session.confirm(&restored, &summary.token).unwrap();
    assert_eq!(tables(&restored, &campaign), finished);
    let mut review_snapshot = exported;
    let season_id = review_snapshot.tables.seasons[0].id.clone();
    let review_date = add_days(&kickoff, 33 * 7).unwrap();
    review_snapshot.tables.simulation_states[0].phase = CalendarPhase::Review;
    review_snapshot.tables.simulation_states[0].current_date = review_date.as_str().into();
    review_snapshot.tables.simulation_states[0].last_boundary_key = Some(format!(
        "season:{}:matchday:{}",
        season_id.as_str(),
        review_date.as_str()
    ));
    let review_path = directory.0.join("review.json");
    std::fs::write(&review_path, serde_json::to_vec(&review_snapshot).unwrap()).unwrap();
    let review_store = NativeStore::open(directory.0.join("review.sqlite3")).unwrap();
    let review_session = MigrationSession::default();
    let review_summary = review_session.select(Some(&review_path)).unwrap().unwrap();
    review_session
        .confirm(&review_store, &review_summary.token)
        .unwrap();
    let review = preview_matchday(&review_store, campaign.clone()).unwrap();
    assert!(!review.allowed);
    assert_eq!(
        review.blocker.as_deref(),
        Some(game_core::matchday::ROLLOVER_UNAVAILABLE)
    );
    let time = preview_time(&review_store, campaign).unwrap();
    assert!(!time.allowed);
    assert_eq!(
        time.reason.as_deref(),
        Some(game_core::matchday::ROLLOVER_UNAVAILABLE)
    );
    drop(store);
    eprintln!(
        "market-certification winter: {:.2}s, export {} bytes",
        started.elapsed().as_secs_f64(),
        bytes.len()
    );
}

#[test]
fn reservation_release_stale_revision_and_isolation() {
    let directory = Directory::new();
    let store = Arc::new(directory.store());
    let first = career(&store, 4);
    let second = career(&store, 5);
    let first_before = tables(&store, &first);
    let second_before = tables(&store, &second);
    let market = preview_market(&store, first.clone()).unwrap();
    let mut stale = request_for(&market);
    stale.expected_revision = n(market.revision.get() + 1);
    assert_eq!(
        run_market(&store, stale).unwrap_err().to_string(),
        "Campaign revision is stale."
    );
    assert_eq!(tables(&store, &first), first_before);

    let managed = first_before.campaigns[0].managed_club_id.clone();
    let candidates = first_before
        .players
        .iter()
        .filter(|row| {
            row.club_id.as_ref() != Some(&managed)
                && row.club_id.is_some()
                && row.market_value_cents.is_some_and(|value| value.get() > 0)
        })
        .map(|row| row.id.clone())
        .take(40)
        .collect::<Vec<_>>();
    let mut chosen = None;
    for player_id in candidates {
        let current = tables(&store, &first);
        let player = current
            .players
            .iter()
            .find(|row| row.id == player_id)
            .unwrap();
        let fee = player.market_value_cents.unwrap().get();
        let wage = current
            .contracts
            .iter()
            .find(|row| row.player_id == player.id && row.status == ContractStatus::Active)
            .and_then(|row| row.weekly_wage_cents)
            .map(|value| value.get())
            .unwrap_or(1)
            .max(1);
        let time = preview_time(&store, first.clone()).unwrap();
        propose_transfer(
            &store,
            ProposeTransferRequest {
                campaign_id: first.clone(),
                expected_revision: time.revision,
                source_date: time.from_date,
                source_boundary_key: time.source_boundary_key,
                player_id,
                fee_cents: money(fee),
                wage_cents: money(wage),
                squad_tier: SquadTier::Key,
                negotiation_id: fresh(),
                receipt_id: fresh(),
                audit_id: fresh(),
                action_id: fresh(),
                now: NOW.into(),
            },
        )
        .unwrap();
        let proposed = tables(&store, &first);
        if let Some(row) = proposed.negotiations.iter().find(|row| {
            row.buyer_club_id == managed
                && open_negotiation(row.status)
                && row.reserved_cents.get() > 0
        }) {
            chosen = Some(row.id.clone());
            break;
        }
    }
    let negotiation_id = chosen.expect("a market-value proposal should reserve a fee");
    let proposed = tables(&store, &first);
    let negotiation = proposed
        .negotiations
        .iter()
        .find(|row| row.id == negotiation_id)
        .unwrap();
    assert!(negotiation.reserved_cents.get() > 0);
    let reserved = negotiation.reserved_cents.get();
    let balance = proposed
        .club_simulation_states
        .iter()
        .find(|row| row.club_id == managed)
        .unwrap()
        .transfer_balance_cents
        .get();
    let spendable = |saved: &SnapshotTables| {
        let reserved = saved
            .negotiations
            .iter()
            .filter(|row| row.buyer_club_id == managed && open_negotiation(row.status))
            .map(|row| row.reserved_cents.get())
            .sum::<i64>();
        balance - reserved
    };
    let before_release = spendable(&proposed);
    let cursor = preview_time(&store, first.clone()).unwrap();
    let withdrawal = RespondNegotiationRequest {
        campaign_id: first.clone(),
        expected_revision: cursor.revision,
        source_date: cursor.from_date,
        source_boundary_key: cursor.source_boundary_key,
        negotiation_id: negotiation.id.clone(),
        decision: NegotiationDecision::Withdraw,
        receipt_id: fresh(),
        audit_id: fresh(),
        action_id: fresh(),
        now: NOW.into(),
    };
    assert!(
        !respond_negotiation(&store, withdrawal.clone())
            .unwrap()
            .replayed
    );
    let released = tables(&store, &first);
    assert_eq!(
        released
            .negotiations
            .iter()
            .find(|row| row.id == negotiation.id)
            .unwrap()
            .reserved_cents
            .get(),
        0
    );
    assert_eq!(
        released
            .club_simulation_states
            .iter()
            .find(|row| row.club_id == managed)
            .unwrap()
            .transfer_balance_cents
            .get(),
        balance
    );
    assert_eq!(spendable(&released), before_release + reserved);
    let replay = respond_negotiation(&store, withdrawal).unwrap();
    assert!(replay.replayed);
    assert_eq!(
        spendable(&tables(&store, &first)),
        before_release + reserved
    );

    let market = preview_market(&store, first.clone()).unwrap();
    let left = request_for(&market);
    let mut right = left.clone();
    right.receipt_id = fresh();
    right.audit_id = fresh();
    right.action_id = fresh();
    let left_store = Arc::clone(&store);
    let right_store = Arc::clone(&store);
    let first_call = std::thread::spawn(move || run_market(&left_store, left));
    let second_call = std::thread::spawn(move || run_market(&right_store, right));
    let results = [first_call.join().unwrap(), second_call.join().unwrap()];
    assert!(results.iter().all(|result| result.is_ok()));
    assert_eq!(
        results
            .iter()
            .filter(|result| result.as_ref().unwrap().replayed)
            .count(),
        1
    );
    let ticked = tables(&store, &first);
    let added = ticked
        .negotiations
        .iter()
        .filter(|row| {
            released
                .negotiations
                .iter()
                .all(|previous| previous.id != row.id)
        })
        .collect::<Vec<_>>();
    assert!(added.len() <= 12);
    let mut created = BTreeMap::<&str, i64>::new();
    for row in &added {
        *created.entry(row.buyer_club_id.as_str()).or_insert(0) += 1;
    }
    assert!(created.values().all(|count| *count <= 1));
    assert_caps(&ticked, &first, "2026-07-08");
    assert_eq!(
        ticked.simulation_receipts.len(),
        released.simulation_receipts.len() + 1
    );
    let mut conflict = request_for(&market);
    conflict.expected_revision = ticked.campaigns[0].revision;
    assert_eq!(
        run_market(&store, conflict).unwrap_err().to_string(),
        "This market tick was already recorded with different input."
    );
    assert_eq!(tables(&store, &first), ticked);
    assert_eq!(tables(&store, &second), second_before);
    let other = preview_market(&store, second.clone()).unwrap();
    run(&store, &other);
    assert_eq!(tables(&store, &first), ticked);
    assert!(tables(&store, &second).negotiations.len() <= 12);

    let audit_dir = Directory::new();
    let audit_store = audit_dir.store();
    let audit_campaign = career(&audit_store, 6);
    let before_audit = tables(&audit_store, &audit_campaign);
    let preview = preview_market(&audit_store, audit_campaign.clone()).unwrap();
    Connection::open(audit_dir.0.join("market.sqlite3"))
        .unwrap()
        .execute_batch("CREATE TRIGGER fail_market_audit BEFORE INSERT ON auditEvents WHEN NEW.actionType='market.tick' BEGIN SELECT RAISE(ABORT, 'injected market audit failure'); END;")
        .unwrap();
    assert!(run_market(&audit_store, request_for(&preview)).is_err());
    assert_eq!(tables(&audit_store, &audit_campaign), before_audit);
    assert!(before_audit.negotiations.is_empty());
}
