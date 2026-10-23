//! One agreed transfer, replayed against a real schema 4 database.
use game_app::*;
use game_core::{career::CareerInput, management::CreationKind, policy::Preset, *};
use rusqlite::{params, Connection};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

const NOW: &str = "2026-10-23T12:00:00.000Z";
const FEE: i64 = 1_000_000;
const WAGE: i64 = 50_000;
static SEQUENCE: AtomicU64 = AtomicU64::new(0);

struct Directory(PathBuf);
impl Directory {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "touchline-settlement-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn store(&self) -> NativeStore {
        NativeStore::open(self.0.join("career.sqlite3")).unwrap()
    }
    fn file(&self) -> PathBuf {
        self.0.join("career.sqlite3")
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        assert!(self.0.starts_with(std::env::temp_dir()));
        std::fs::remove_dir_all(&self.0).unwrap();
    }
}

fn n(value: i64) -> SafeInt {
    SafeInt::new(value).unwrap()
}
fn id(namespace: u32, ordinal: i64) -> EntityId {
    EntityId::new(format!("{namespace:08x}-0000-4000-8000-{ordinal:012x}")).unwrap()
}
fn career() -> CreationRequest {
    CreationRequest {
        kind: CreationKind::Career,
        reset_revision: None,
        career: CareerInput {
            campaign_id: id(0x90410001, 1),
            name: "Settlement career".into(),
            seed: "p09-g04-settlement".into(),
            start_year: n(2026),
            club_key: "club:01".into(),
            rules_mode: RulesMode::Challenge,
            preset: Preset::Balanced,
            now: NOW.into(),
            season_id: id(0x90410002, 1),
            clock_id: id(0x90410003, 1),
            constitution_id: id(0x90410004, 1),
            allocation_id: id(0x90410005, 1),
            receipt_id: id(0x90410006, 1),
            audit_event_id: id(0x90410007, 1),
            action_id: id(0x90410008, 1),
        },
    }
}
fn snapshot(store: &NativeStore, campaign: &EntityId) -> CampaignSnapshot {
    store
        .export_snapshot(campaign.as_str(), "settlement-test", NOW)
        .unwrap()
}
fn player_at<'a>(tables: &'a SnapshotTables, club: &EntityId, skip: usize) -> &'a PlayerRow {
    tables
        .players
        .iter()
        .filter(|player| player.club_id.as_ref() == Some(club))
        .nth(skip)
        .unwrap()
}
fn balance(tables: &SnapshotTables, club: &EntityId) -> i64 {
    tables
        .club_simulation_states
        .iter()
        .find(|state| &state.club_id == club)
        .unwrap()
        .transfer_balance_cents
        .get()
}
fn balance_sum(tables: &SnapshotTables) -> i64 {
    tables
        .club_simulation_states
        .iter()
        .map(|state| state.transfer_balance_cents.get())
        .sum()
}
struct Bid<'a> {
    negotiation: &'a EntityId,
    player: &'a EntityId,
    buyer: &'a EntityId,
    seller: &'a EntityId,
    status: &'a str,
    fee: i64,
    wage: i64,
}
fn insert_negotiation(
    db: &Connection,
    campaign: &EntityId,
    season: &EntityId,
    expires: &str,
    opened: &str,
    bid: Bid<'_>,
) {
    db.execute(
        "INSERT INTO negotiations (
            id, campaignId, seasonId, playerId, buyerClubId, sellerClubId, status,
            feeCents, reservedCents, wageCents, reservedWageCents, squadTier, expiresOn,
            counterCount, openedOn, deadlineOn, resolvedOn, engineVersion, eventSeed, qualification
        ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8,?9,?9,'rotation',?10,0,?11,'2026-08-31',NULL,'1',7,NULL)",
        params![
            bid.negotiation.as_str(),
            campaign.as_str(),
            season.as_str(),
            bid.player.as_str(),
            bid.buyer.as_str(),
            bid.seller.as_str(),
            bid.status,
            bid.fee,
            bid.wage,
            expires,
            opened,
        ],
    )
    .unwrap();
}
fn settle_request(
    campaign: &EntityId,
    revision: SafeInt,
    negotiation: &EntityId,
    source_date: &str,
    boundary: Option<String>,
    ordinal: i64,
    ledgers: bool,
) -> SettleTransferRequest {
    SettleTransferRequest {
        campaign_id: campaign.clone(),
        expected_revision: revision,
        negotiation_id: negotiation.clone(),
        source_date: source_date.into(),
        source_boundary_key: boundary,
        transfer_id: id(0x90420001, ordinal),
        contract_id: id(0x90420002, ordinal),
        ledger_ids: if ledgers {
            vec![id(0x90420003, ordinal), id(0x90420004, ordinal)]
        } else {
            Vec::new()
        },
        registration_id: None,
        receipt_id: id(0x90420005, ordinal),
        audit_id: id(0x90420006, ordinal),
        action_id: id(0x90420007, ordinal),
        now: NOW.into(),
    }
}

#[test]
fn agreed_transfer_settles_once_and_leaves_july_on_august() {
    let dir = Directory::new();
    let store = dir.store();
    let created = create_career(&store, career()).unwrap();
    let campaign = created.campaign_id.clone();
    let before = snapshot(&store, &campaign);
    let tables = &before.tables;
    let saved = &tables.campaigns[0];
    let season = tables
        .seasons
        .iter()
        .find(|season| season.id == saved.active_season_id)
        .unwrap();
    let clock = &tables.simulation_states[0];
    let managed = saved.managed_club_id.clone();
    let others = tables
        .clubs
        .iter()
        .filter(|club| club.id != managed)
        .map(|club| club.id.clone())
        .collect::<Vec<_>>();
    let seller = others[0].clone();
    let buyer = others[1].clone();
    let rival = others[2].clone();
    let quota_seller = others[3].clone();
    let audit_seller = others[4].clone();
    let audit_buyer = others[5].clone();
    let mover = player_at(tables, &seller, 0);
    let sold = player_at(tables, &managed, 0);
    let stays = player_at(tables, &managed, 1);
    let quota_player = player_at(tables, &quota_seller, 0);
    let audit_player = player_at(tables, &audit_seller, 0);
    let buyer_key = tables
        .club_simulation_states
        .iter()
        .find(|state| state.club_id == buyer)
        .unwrap()
        .simulation_key
        .clone();
    let mover_key = tables
        .player_simulation_states
        .iter()
        .find(|state| state.player_id == mover.id)
        .unwrap()
        .simulation_key
        .clone();
    let negotiation = id(0x90430001, 1);
    let second = id(0x90430002, 1);
    let seller_negotiation = id(0x90430003, 1);
    let quota_negotiation = id(0x90430004, 1);
    let audit_negotiation = id(0x90430005, 1);
    let legacy = id(0x90430006, 1);
    let lineup = id(0x90430007, 1);
    let registration = id(0x90430008, 1);
    let expires = season.end_date.clone().unwrap();
    let opened = clock.current_date.clone();
    let db = Connection::open(dir.file()).unwrap();
    db.pragma_update(None, "foreign_keys", true).unwrap();
    insert_negotiation(
        &db,
        &campaign,
        &season.id,
        &expires,
        &opened,
        Bid {
            negotiation: &negotiation,
            player: &mover.id,
            buyer: &buyer,
            seller: &seller,
            status: "agreed",
            fee: FEE,
            wage: WAGE,
        },
    );
    insert_negotiation(
        &db,
        &campaign,
        &season.id,
        &expires,
        &opened,
        Bid {
            negotiation: &second,
            player: &mover.id,
            buyer: &rival,
            seller: &seller,
            status: "proposed",
            fee: 200_000,
            wage: 10_000,
        },
    );
    insert_negotiation(
        &db,
        &campaign,
        &season.id,
        &expires,
        &opened,
        Bid {
            negotiation: &seller_negotiation,
            player: &sold.id,
            buyer: &buyer,
            seller: &managed,
            status: "agreed",
            fee: FEE,
            wage: WAGE,
        },
    );
    insert_negotiation(
        &db,
        &campaign,
        &season.id,
        &expires,
        &opened,
        Bid {
            negotiation: &quota_negotiation,
            player: &quota_player.id,
            buyer: &managed,
            seller: &quota_seller,
            status: "agreed",
            fee: FEE,
            wage: WAGE,
        },
    );
    insert_negotiation(
        &db,
        &campaign,
        &season.id,
        &expires,
        &opened,
        Bid {
            negotiation: &audit_negotiation,
            player: &audit_player.id,
            buyer: &audit_buyer,
            seller: &audit_seller,
            status: "agreed",
            fee: FEE,
            wage: WAGE,
        },
    );
    db.execute(
        "INSERT INTO offers (
            id, campaignId, seasonId, playerId, bidderClubId, feeCents, status, receivedOn,
            resolvedOn, negotiationId, sellerClubId, deadlineOn, origin, marketValueCents,
            bidderPrestige, sellerPrestige, constitutionVersion, compulsory
        ) VALUES (?1,?2,?3,?4,?5,1000,'open',?6,NULL,NULL,?7,NULL,NULL,NULL,NULL,NULL,NULL,0)",
        params![
            legacy.as_str(),
            campaign.as_str(),
            season.id.as_str(),
            mover.id.as_str(),
            rival.as_str(),
            opened,
            seller.as_str(),
        ],
    )
    .unwrap();
    let starters = serde_json::json!([
        {"playerId": sold.id, "slot": "ST", "role": null},
        {"playerId": stays.id, "slot": "LW", "role": null}
    ])
    .to_string();
    let bench = serde_json::json!([sold.id]).to_string();
    db.execute(
        "INSERT INTO lineups (
            id, campaignId, seasonId, name, formation, starters, benchPlayerIds, updatedAt
        ) VALUES (?1,?2,?3,'First team','4-3-3',?4,?5,?6)",
        params![
            lineup.as_str(),
            campaign.as_str(),
            season.id.as_str(),
            starters,
            bench,
            NOW,
        ],
    )
    .unwrap();
    db.execute(
        "INSERT INTO registrations (
            id, campaignId, seasonId, playerId, competitionKey, status,
            homegrownClub, homegrownNation, ageExempt, provenance
        ) VALUES (?1,?2,?3,?4,'league','registered',1,1,0,'generated')",
        params![
            registration.as_str(),
            campaign.as_str(),
            season.id.as_str(),
            sold.id.as_str(),
        ],
    )
    .unwrap();
    db.execute(
        "UPDATE players SET birthDate='2004-06-01' WHERE id=?1",
        [quota_player.id.as_str()],
    )
    .unwrap();
    db.execute(
        "UPDATE playerSimulationStates SET homegrownClub=0, homegrownNation=0 WHERE playerId=?1",
        [quota_player.id.as_str()],
    )
    .unwrap();
    drop(db);

    let revision = snapshot(&store, &campaign).tables.campaigns[0].revision;
    let legacy_request = settle_request(
        &campaign,
        revision,
        &legacy,
        &opened,
        clock.last_boundary_key.clone(),
        9,
        true,
    );
    let legacy_error = settle_transfer(&store, legacy_request).unwrap_err();
    assert!(
        legacy_error.to_string().contains("legacy"),
        "{legacy_error}"
    );

    let stale = settle_request(
        &campaign,
        n(99),
        &negotiation,
        &opened,
        clock.last_boundary_key.clone(),
        1,
        true,
    );
    let stale_error = settle_transfer(&store, stale).unwrap_err();
    assert!(
        matches!(stale_error, CommandError::Conflict { .. }),
        "{stale_error}"
    );
    assert!(stale_error.to_string().contains("stale"), "{stale_error}");
    let unchanged = snapshot(&store, &campaign);
    assert!(unchanged
        .tables
        .negotiations
        .iter()
        .any(|row| row.id == negotiation && row.status == NegotiationStatus::Agreed));
    assert!(unchanged.tables.transfers.is_empty());

    let seeded = snapshot(&store, &campaign);
    let attributes = seeded
        .tables
        .players
        .iter()
        .find(|player| player.id == mover.id)
        .unwrap()
        .attributes
        .clone();
    let market_value = seeded
        .tables
        .players
        .iter()
        .find(|player| player.id == mover.id)
        .unwrap()
        .market_value_cents;
    let sim_before = seeded
        .tables
        .player_simulation_states
        .iter()
        .find(|state| state.player_id == mover.id)
        .unwrap()
        .clone();
    let appearances = seeded.tables.simulated_appearances.clone();
    let matches = seeded.tables.simulated_matches.clone();
    let fixtures = seeded.tables.fixtures.clone();
    let clock_before = seeded.tables.simulation_states[0].clone();
    let buyer_before = balance(&seeded.tables, &buyer);
    let seller_before = balance(&seeded.tables, &seller);
    let sum_before = balance_sum(&seeded.tables);
    let ledger_before = seeded.tables.ledger_entries.len();
    let request = settle_request(
        &campaign,
        seeded.tables.campaigns[0].revision,
        &negotiation,
        &opened,
        clock_before.last_boundary_key.clone(),
        1,
        true,
    );
    let settled = settle_transfer(&store, request.clone()).unwrap();
    assert!(!settled.replayed);
    assert_eq!(settled.current_date, clock_before.current_date);
    assert_eq!(settled.phase, clock_before.phase);
    assert_eq!(settled.last_boundary_key, clock_before.last_boundary_key);
    assert!(settled.operation_key.contains(&buyer_key));
    assert!(settled.operation_key.contains(&mover_key));
    assert!(settled.operation_key.contains(":transfer:"));

    let moved = snapshot(&store, &campaign);
    assert_eq!(moved.tables.campaigns[0].revision, settled.revision);
    assert_eq!(moved.tables.ledger_entries.len(), ledger_before + 2);
    assert_eq!(balance(&moved.tables, &buyer), buyer_before - FEE);
    assert_eq!(balance(&moved.tables, &seller), seller_before + FEE);
    assert_eq!(balance_sum(&moved.tables), sum_before);
    let deal = moved
        .tables
        .negotiations
        .iter()
        .find(|row| row.id == negotiation)
        .unwrap();
    assert_eq!(deal.status, NegotiationStatus::Settled);
    assert_eq!(deal.reserved_cents.get(), 0);
    assert_eq!(deal.reserved_wage_cents.get(), 0);
    assert_eq!(deal.resolved_on.as_deref(), Some(opened.as_str()));
    let other = moved
        .tables
        .negotiations
        .iter()
        .find(|row| row.id == second)
        .unwrap();
    assert_eq!(other.status, NegotiationStatus::Superseded);
    assert_eq!(other.reserved_cents.get(), 0);
    assert_eq!(other.reserved_wage_cents.get(), 0);
    let offer = moved
        .tables
        .offers
        .iter()
        .find(|row| row.id == legacy)
        .unwrap();
    assert_eq!(offer.status, OfferStatus::Superseded);
    let player = moved
        .tables
        .players
        .iter()
        .find(|row| row.id == mover.id)
        .unwrap();
    assert_eq!(player.club_id.as_ref(), Some(&buyer));
    assert_eq!(player.attributes, attributes);
    assert_eq!(player.market_value_cents, market_value);
    assert_eq!(
        moved
            .tables
            .player_simulation_states
            .iter()
            .find(|state| state.player_id == mover.id)
            .unwrap(),
        &sim_before
    );
    assert_eq!(moved.tables.simulated_appearances, appearances);
    assert_eq!(moved.tables.simulated_matches, matches);
    assert_eq!(moved.tables.fixtures, fixtures);
    assert_eq!(moved.tables.simulation_states[0], clock_before);
    let contracts = moved
        .tables
        .contracts
        .iter()
        .filter(|contract| contract.player_id == mover.id)
        .collect::<Vec<_>>();
    assert_eq!(
        contracts
            .iter()
            .filter(|contract| contract.status == ContractStatus::Active)
            .count(),
        1
    );
    assert!(contracts
        .iter()
        .any(|contract| contract.status == ContractStatus::Ended));
    let active = contracts
        .iter()
        .find(|contract| contract.status == ContractStatus::Active)
        .unwrap();
    assert_eq!(active.club_id, buyer);
    assert_eq!(active.weekly_wage_cents.unwrap().get(), WAGE);
    assert_eq!(active.squad_tier, Some(SquadTier::Rotation));
    assert_eq!(active.starts_on.as_deref(), Some(opened.as_str()));
    assert_eq!(active.expires_on.as_deref(), Some(expires.as_str()));
    let transfers = moved
        .tables
        .transfers
        .iter()
        .filter(|transfer| transfer.player_id == mover.id)
        .collect::<Vec<_>>();
    assert_eq!(transfers.len(), 1);
    assert_eq!(transfers[0].kind, TransferKind::Sale);
    assert_eq!(transfers[0].fee_cents.get(), FEE);
    assert!(moved.tables.ledger_entries.iter().any(|entry| {
        entry.club_id == buyer
            && entry.kind == LedgerKind::IncomingFee
            && entry.amount_cents.get() == FEE
    }));
    assert!(moved.tables.ledger_entries.iter().any(|entry| {
        entry.club_id == seller
            && entry.kind == LedgerKind::PlayerSale
            && entry.amount_cents.get() == FEE
    }));

    let replayed = settle_transfer(&store, request.clone()).unwrap();
    assert!(replayed.replayed);
    assert_eq!(replayed.revision, settled.revision);
    let after_replay = snapshot(&store, &campaign);
    assert_eq!(after_replay.tables.ledger_entries.len(), ledger_before + 2);
    assert_eq!(after_replay.tables.campaigns[0].revision, settled.revision);

    let mut mismatch = request.clone();
    mismatch.source_boundary_key = Some("not-the-saved-cursor".into());
    let mismatch_error = settle_transfer(&store, mismatch).unwrap_err();
    assert!(
        matches!(mismatch_error, CommandError::Conflict { .. }),
        "{mismatch_error}"
    );
    let after_mismatch = snapshot(&store, &campaign);
    assert_eq!(
        after_mismatch.tables.ledger_entries.len(),
        ledger_before + 2
    );
    assert_eq!(
        after_mismatch.tables.campaigns[0].revision,
        settled.revision
    );

    let seller_request = settle_request(
        &campaign,
        settled.revision,
        &seller_negotiation,
        &opened,
        clock_before.last_boundary_key.clone(),
        2,
        true,
    );
    settle_transfer(&store, seller_request).unwrap();
    let cleaned = snapshot(&store, &campaign);
    let lineup_row = cleaned
        .tables
        .lineups
        .iter()
        .find(|row| row.id == lineup)
        .unwrap();
    assert!(lineup_row
        .starters
        .iter()
        .all(|starter| starter.player_id != sold.id));
    assert!(lineup_row
        .starters
        .iter()
        .any(|starter| starter.player_id == stays.id));
    assert!(!lineup_row.bench_player_ids.contains(&sold.id));
    assert_eq!(
        cleaned
            .tables
            .registrations
            .iter()
            .find(|row| row.id == registration)
            .unwrap()
            .status,
        RegistrationStatus::Ineligible
    );
    assert_eq!(
        cleaned
            .tables
            .players
            .iter()
            .find(|player| player.id == sold.id)
            .unwrap()
            .club_id
            .as_ref(),
        Some(&buyer)
    );

    let quota_revision = cleaned.tables.campaigns[0].revision;
    let quota_club = cleaned
        .tables
        .players
        .iter()
        .find(|player| player.id == quota_player.id)
        .unwrap()
        .club_id
        .clone();
    let quota_error = settle_transfer(
        &store,
        settle_request(
            &campaign,
            quota_revision,
            &quota_negotiation,
            &opened,
            clock_before.last_boundary_key.clone(),
            3,
            true,
        ),
    )
    .unwrap_err();
    assert!(
        matches!(quota_error, CommandError::Scope { .. }),
        "{quota_error}"
    );
    assert!(
        quota_error.to_string().to_lowercase().contains("homegrown"),
        "{quota_error}"
    );
    let blocked = snapshot(&store, &campaign);
    assert_eq!(blocked.tables.campaigns[0].revision, quota_revision);
    assert_eq!(
        blocked
            .tables
            .players
            .iter()
            .find(|player| player.id == quota_player.id)
            .unwrap()
            .club_id,
        quota_club
    );
    assert!(blocked
        .tables
        .negotiations
        .iter()
        .any(|row| row.id == quota_negotiation && row.status == NegotiationStatus::Agreed));
    assert_eq!(
        blocked.tables.transfers.len(),
        cleaned.tables.transfers.len()
    );

    let audit_before = snapshot(&store, &campaign);
    Connection::open(dir.file())
        .unwrap()
        .execute_batch(
            "CREATE TRIGGER reject_settle_audit BEFORE INSERT ON auditEvents
             WHEN NEW.actionType = 'transfer.settle'
             BEGIN SELECT RAISE(ABORT, 'injected audit failure'); END;",
        )
        .unwrap();
    let audit_error = settle_transfer(
        &store,
        settle_request(
            &campaign,
            audit_before.tables.campaigns[0].revision,
            &audit_negotiation,
            &opened,
            clock_before.last_boundary_key.clone(),
            4,
            true,
        ),
    )
    .unwrap_err();
    assert!(!audit_error.to_string().is_empty());
    let rolled = snapshot(&store, &campaign);
    assert_eq!(
        rolled.tables.campaigns[0].revision,
        audit_before.tables.campaigns[0].revision
    );
    assert_eq!(
        rolled
            .tables
            .players
            .iter()
            .find(|player| player.id == audit_player.id)
            .unwrap()
            .club_id,
        audit_before
            .tables
            .players
            .iter()
            .find(|player| player.id == audit_player.id)
            .unwrap()
            .club_id
    );
    assert_eq!(
        balance(&rolled.tables, &audit_buyer),
        balance(&audit_before.tables, &audit_buyer)
    );
    assert_eq!(
        balance(&rolled.tables, &audit_seller),
        balance(&audit_before.tables, &audit_seller)
    );
    assert_eq!(
        rolled
            .tables
            .contracts
            .iter()
            .filter(|contract| contract.player_id == audit_player.id
                && contract.status == ContractStatus::Active)
            .count(),
        1
    );
    assert!(rolled.tables.negotiations.iter().any(|row| {
        row.id == audit_negotiation
            && row.status == NegotiationStatus::Agreed
            && row.resolved_on.is_none()
    }));
    assert_eq!(
        rolled.tables.transfers.len(),
        audit_before.tables.transfers.len()
    );
    assert_eq!(
        rolled.tables.simulation_states[0].current_date,
        clock_before.current_date
    );

    let preview = preview_time(&store, campaign).unwrap();
    assert_eq!(preview.from_date, "2026-07-01");
    assert_eq!(preview.target_date.as_deref(), Some("2026-08-31"));
    assert!(preview.allowed);
}
