use game_app::*;
use game_core::{
    career::CareerInput, management::CreationKind, market_ops::OfferDecision, policy::Preset, *,
};
use rusqlite::{params, Connection};
use std::sync::atomic::{AtomicU64, Ordering};

const NOW: &str = "2026-10-22T00:00:00.000Z";
static SEQ: AtomicU64 = AtomicU64::new(0);

struct Dir(std::path::PathBuf);
impl Dir {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "touchline-market-{}-{}",
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
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn id(label: &str) -> EntityId {
    EntityId::new(format!("{label}-{}", SEQ.fetch_add(1, Ordering::Relaxed))).unwrap()
}
fn money(value: i64) -> MoneyCents {
    MoneyCents::new(value).unwrap()
}
fn tables(store: &NativeStore, campaign: &EntityId) -> SnapshotTables {
    store
        .export_snapshot(campaign.as_str(), "market-check", NOW)
        .unwrap()
        .tables
}
fn career(store: &NativeStore) -> EntityId {
    let campaign = id("career");
    create_career(
        store,
        CreationRequest {
            kind: CreationKind::Career,
            reset_revision: None,
            career: CareerInput {
                campaign_id: campaign.clone(),
                name: "Market career".into(),
                seed: format!("market-{}", campaign.as_str()),
                start_year: SafeInt::new(2026).unwrap(),
                club_key: "club:01".into(),
                rules_mode: RulesMode::Challenge,
                preset: Preset::Balanced,
                now: NOW.into(),
                season_id: id("season"),
                clock_id: id("clock"),
                constitution_id: id("constitution"),
                allocation_id: id("allocation"),
                receipt_id: id("init-receipt"),
                audit_event_id: id("init-audit"),
                action_id: id("init-action"),
            },
        },
    )
    .unwrap();
    campaign
}
fn run(store: &NativeStore, preview: MarketPreview) -> Result<AdvanceOutcome, CommandError> {
    run_market(
        store,
        RunMarketRequest {
            campaign_id: preview.campaign_id,
            expected_revision: preview.revision,
            source_date: preview.from_date,
            source_boundary_key: preview.source_boundary_key,
            negotiation_ids: (0..preview.negotiation_count.get())
                .map(|i| id(&format!("n{i}")))
                .collect(),
            offer_ids: (0..preview.offer_count.get())
                .map(|i| id(&format!("o{i}")))
                .collect(),
            transfer_ids: (0..preview.transfer_count.get())
                .map(|i| id(&format!("t{i}")))
                .collect(),
            contract_ids: (0..preview.contract_count.get())
                .map(|i| id(&format!("c{i}")))
                .collect(),
            ledger_ids: (0..preview.ledger_count.get())
                .map(|i| id(&format!("l{i}")))
                .collect(),
            registration_ids: (0..preview.registration_count.get())
                .map(|i| id(&format!("r{i}")))
                .collect(),
            receipt_id: id("receipt"),
            audit_id: id("audit"),
            action_id: id("action"),
            now: NOW.into(),
        },
    )
}

#[test]
fn one_summer_tick_is_capped_replayed_and_rolled_back() {
    let dir = Dir::new();
    let store = dir.store();
    let campaign = career(&store);
    let preview = preview_time(&store, campaign.clone()).unwrap();
    assert_eq!(preview.from_date, "2026-07-01");
    assert!(!preview.allowed);
    let market = preview_market(&store, campaign.clone()).unwrap();
    assert_eq!(market.action, game_core::market_ops::MarketAction::Run);
    assert!(market.allowed);
    assert!(market.negotiation_count.get() <= 12);
    let first = run(&store, market.clone()).unwrap();
    assert!(!first.replayed);
    let ticked = tables(&store, &campaign);
    assert!(
        ticked
            .negotiations
            .iter()
            .filter(|row| row.opened_on == "2026-07-01")
            .count()
            <= 12
    );
    let again = run(&store, market).unwrap();
    assert!(again.replayed);
    assert_eq!(
        tables(&store, &campaign).negotiations.len(),
        ticked.negotiations.len()
    );
    let continued = preview_time(&store, campaign).unwrap();
    assert_eq!(continued.target_date.as_deref(), Some("2026-07-08"));
    assert!(continued.allowed);

    let rollback_dir = Dir::new();
    let fresh = rollback_dir.store();
    let campaign = career(&fresh);
    let before = tables(&fresh, &campaign);
    let preview = preview_market(&fresh, campaign.clone()).unwrap();
    let db = Connection::open(rollback_dir.0.join("game.sqlite3")).unwrap();
    db.execute_batch("CREATE TRIGGER fail_market_audit BEFORE INSERT ON auditEvents WHEN NEW.actionType='market.tick' BEGIN SELECT RAISE(ABORT, 'injected market audit failure'); END;").unwrap();
    assert!(run(&fresh, preview).is_err());
    assert_eq!(tables(&fresh, &campaign), before);
}

#[test]
fn a_qualifying_offer_blocks_the_deadline_until_it_is_accepted() {
    let dir = Dir::new();
    let store = dir.store();
    let campaign = career(&store);
    let saved = tables(&store, &campaign);
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
        .clubs
        .iter()
        .find(|row| row.id != managed)
        .unwrap()
        .id
        .clone();
    let negotiation = id("qual-neg");
    let offer = id("qual-offer");
    let db = Connection::open(dir.0.join("game.sqlite3")).unwrap();
    db.execute(
        "UPDATE simulationStates SET currentDate='2026-08-31', phase='preseason', lastBoundaryKey='season:2026:summer-deadline' WHERE campaignId=?1",
        params![campaign.as_str()],
    )
    .unwrap();
    db.execute(
        "INSERT INTO negotiations (
            id, campaignId, seasonId, playerId, buyerClubId, sellerClubId, status,
            feeCents, reservedCents, wageCents, reservedWageCents, squadTier, expiresOn,
            counterCount, openedOn, deadlineOn, resolvedOn, engineVersion, eventSeed, qualification
        ) VALUES (?1,?2,?3,?4,?5,?6,'agreed',1000,1000,1,1,'rotation','2027-06-30',0,'2026-08-17','2026-08-31',NULL,'1',1,NULL)",
        params![negotiation.as_str(), campaign.as_str(), season.as_str(), player.as_str(), buyer.as_str(), managed.as_str()],
    )
    .unwrap();
    db.execute(
        "INSERT INTO offers (
            id, campaignId, seasonId, playerId, bidderClubId, feeCents, status, receivedOn, resolvedOn,
            negotiationId, sellerClubId, deadlineOn, origin, marketValueCents, bidderPrestige, sellerPrestige, constitutionVersion, compulsory
        ) VALUES (?1,?2,?3,?4,?5,1000,'open','2026-08-17',NULL,?6,?7,'2026-08-31','ai',100,90,40,1,1)",
        params![offer.as_str(), campaign.as_str(), season.as_str(), player.as_str(), buyer.as_str(), negotiation.as_str(), managed.as_str()],
    )
    .unwrap();
    drop(db);
    let before = tables(&store, &campaign);
    let rejected = respond_offer(
        &store,
        RespondOfferRequest {
            campaign_id: campaign.clone(),
            expected_revision: before.campaigns[0].revision,
            source_date: "2026-08-31".into(),
            source_boundary_key: Some("season:2026:summer-deadline".into()),
            offer_id: offer.clone(),
            decision: OfferDecision::Reject,
            transfer_id: id("unused-transfer"),
            contract_id: id("unused-contract"),
            ledger_ids: vec![],
            registration_id: None,
            receipt_id: id("reject-receipt"),
            audit_id: id("reject-audit"),
            action_id: id("reject-action"),
            now: NOW.into(),
        },
    )
    .unwrap_err();
    assert_eq!(
        rejected.to_string(),
        "This bid qualifies and cannot be rejected while the rule is on."
    );
    assert_eq!(
        tables(&store, &campaign).campaigns[0].revision,
        before.campaigns[0].revision
    );
    let preview = preview_time(&store, campaign.clone()).unwrap();
    assert!(!preview.allowed);
    assert_eq!(
        preview.reason.as_deref(),
        Some("Accept the qualifying offer before the window can close.")
    );
    let board = transfer_board(&store, campaign.clone()).unwrap();
    let row = board
        .incoming
        .iter()
        .find(|row| row.offer_id == offer)
        .unwrap();
    assert_eq!(row.compulsory, "Compulsory");
    assert!(!row.reject_allowed);
    respond_offer(
        &store,
        RespondOfferRequest {
            campaign_id: campaign.clone(),
            expected_revision: before.campaigns[0].revision,
            source_date: "2026-08-31".into(),
            source_boundary_key: Some("season:2026:summer-deadline".into()),
            offer_id: offer,
            decision: OfferDecision::Accept,
            transfer_id: id("accept-transfer"),
            contract_id: id("accept-contract"),
            ledger_ids: vec![id("accept-ledger-a"), id("accept-ledger-b")],
            registration_id: None,
            receipt_id: id("accept-receipt"),
            audit_id: id("accept-audit"),
            action_id: id("accept-action"),
            now: NOW.into(),
        },
    )
    .unwrap();
    let opened = preview_time(&store, campaign).unwrap();
    assert!(opened.allowed);
    assert_eq!(opened.target_date.as_deref(), Some("2026-09-01"));
}

#[test]
fn proposal_replay_does_not_duplicate_and_withdraw_releases_once() {
    let dir = Dir::new();
    let store = dir.store();
    let campaign = career(&store);
    let saved = tables(&store, &campaign);
    let managed = saved.campaigns[0].managed_club_id.clone();
    let player = saved
        .players
        .iter()
        .find(|row| {
            row.club_id.as_ref() != Some(&managed)
                && row.club_id.is_some()
                && row.market_value_cents.is_some_and(|value| value.get() > 0)
        })
        .unwrap();
    let fee = player.market_value_cents.unwrap().get();
    let wage = saved
        .contracts
        .iter()
        .find(|row| row.player_id == player.id && row.status == ContractStatus::Active)
        .and_then(|row| row.weekly_wage_cents)
        .map(|value| value.get())
        .unwrap_or(1_000)
        .max(1);
    let request = ProposeTransferRequest {
        campaign_id: campaign.clone(),
        expected_revision: saved.campaigns[0].revision,
        source_date: "2026-07-01".into(),
        source_boundary_key: None,
        player_id: player.id.clone(),
        fee_cents: money(fee),
        wage_cents: money(wage),
        squad_tier: SquadTier::Key,
        negotiation_id: id("proposal"),
        receipt_id: id("proposal-receipt"),
        audit_id: id("proposal-audit"),
        action_id: id("proposal-action"),
        now: NOW.into(),
    };
    assert!(!propose_transfer(&store, request.clone()).unwrap().replayed);
    let stored = tables(&store, &campaign);
    let managed_rows = stored
        .negotiations
        .iter()
        .filter(|row| row.buyer_club_id == managed)
        .count();
    assert_eq!(managed_rows, 1);
    let replay = propose_transfer(
        &store,
        ProposeTransferRequest {
            negotiation_id: id("other-proposal"),
            receipt_id: id("other-receipt"),
            audit_id: id("other-audit"),
            action_id: id("other-action"),
            ..request
        },
    )
    .unwrap();
    assert!(replay.replayed);
    assert_eq!(
        tables(&store, &campaign).negotiations.len(),
        stored.negotiations.len()
    );
    let open = tables(&store, &campaign);
    let negotiation = open
        .negotiations
        .iter()
        .find(|row| row.buyer_club_id == managed)
        .unwrap();
    assert!(negotiation.reserved_cents.get() > 0);
    respond_negotiation(
        &store,
        RespondNegotiationRequest {
            campaign_id: campaign.clone(),
            expected_revision: open.campaigns[0].revision,
            source_date: "2026-07-01".into(),
            source_boundary_key: None,
            negotiation_id: negotiation.id.clone(),
            decision: game_core::market_ops::NegotiationDecision::Withdraw,
            receipt_id: id("withdraw-receipt"),
            audit_id: id("withdraw-audit"),
            action_id: id("withdraw-action"),
            now: NOW.into(),
        },
    )
    .unwrap();
    let released = tables(&store, &campaign);
    let row = released
        .negotiations
        .iter()
        .find(|row| row.id == negotiation.id)
        .unwrap();
    assert_eq!(row.reserved_cents.get(), 0);
    assert_eq!(row.status, NegotiationStatus::Withdrawn);
}
