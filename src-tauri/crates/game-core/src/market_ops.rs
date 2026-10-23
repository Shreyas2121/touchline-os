//! Window ticks, approaches, and the transfer board. Settlement of an agreed
//! AI deal uses the G04 movement in the same transaction as the tick.

use crate::ability::role_ability;
use crate::calendar::{
    self, market_key, winter_close_key, MarketDue, ACCEPT_QUALIFYING_OFFER, TRANSFER_WINDOW_CLOSED,
};
use crate::dates::{add_days, validate_timestamp, DateOnly};
use crate::finance::wage_commitment;
use crate::guards::next_revision;
use crate::market::{
    plan_openings, resolve_terms, Agreement, MarketClub, MarketPlayer, MarketSeedInputs,
    TermProposal, MARKET_ENGINE_VERSION,
};
use crate::policy::{
    evaluate_action, qualifying_stored_offer_count, PolicyAction, PolicySnapshot, Qualification,
    QualificationRule,
};
use crate::progression::AdvanceOutcome;
use crate::random::{derive_event_seed, EventKind};
use crate::settlement::{self, MovementIds};
use crate::*;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};
use ts_rs::TS;

fn invalid(message: impl ToString) -> CommandError {
    CommandError::Validation {
        message: message.to_string(),
    }
}
fn conflict(message: &str) -> CommandError {
    CommandError::Conflict {
        message: message.into(),
    }
}
fn core(error: CoreError) -> CommandError {
    invalid(error.to_string())
}
fn money(value: i64) -> Result<MoneyCents, CommandError> {
    MoneyCents::new(value).map_err(core)
}
fn number(value: i64) -> Result<SafeInt, CommandError> {
    SafeInt::new(value).map_err(core)
}
fn zero() -> MoneyCents {
    MoneyCents::new(0).expect("zero")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
pub enum MarketAction {
    Run,
    Close,
    None,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MarketPreview {
    pub campaign_id: EntityId,
    pub revision: SafeInt,
    pub from_date: String,
    pub source_boundary_key: Option<String>,
    pub action: MarketAction,
    pub allowed: bool,
    pub reason: Option<String>,
    pub negotiation_count: SafeInt,
    pub offer_count: SafeInt,
    pub transfer_count: SafeInt,
    pub contract_count: SafeInt,
    pub ledger_count: SafeInt,
    pub registration_count: SafeInt,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunMarketRequest {
    pub campaign_id: EntityId,
    pub expected_revision: SafeInt,
    pub source_date: String,
    pub source_boundary_key: Option<String>,
    pub negotiation_ids: Vec<EntityId>,
    pub offer_ids: Vec<EntityId>,
    pub transfer_ids: Vec<EntityId>,
    pub contract_ids: Vec<EntityId>,
    pub ledger_ids: Vec<EntityId>,
    pub registration_ids: Vec<EntityId>,
    pub receipt_id: EntityId,
    pub audit_id: EntityId,
    pub action_id: EntityId,
    pub now: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CloseWindowRequest {
    pub campaign_id: EntityId,
    pub expected_revision: SafeInt,
    pub source_date: String,
    pub source_boundary_key: Option<String>,
    pub receipt_id: EntityId,
    pub audit_id: EntityId,
    pub action_id: EntityId,
    pub now: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProposeTransferRequest {
    pub campaign_id: EntityId,
    pub expected_revision: SafeInt,
    pub source_date: String,
    pub source_boundary_key: Option<String>,
    pub player_id: EntityId,
    pub fee_cents: MoneyCents,
    pub wage_cents: MoneyCents,
    pub squad_tier: SquadTier,
    pub negotiation_id: EntityId,
    pub receipt_id: EntityId,
    pub audit_id: EntityId,
    pub action_id: EntityId,
    pub now: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub enum NegotiationDecision {
    Accept,
    Withdraw,
    Counter {
        fee_cents: MoneyCents,
        wage_cents: MoneyCents,
        squad_tier: SquadTier,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RespondNegotiationRequest {
    pub campaign_id: EntityId,
    pub expected_revision: SafeInt,
    pub source_date: String,
    pub source_boundary_key: Option<String>,
    pub negotiation_id: EntityId,
    pub decision: NegotiationDecision,
    pub receipt_id: EntityId,
    pub audit_id: EntityId,
    pub action_id: EntityId,
    pub now: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
pub enum OfferDecision {
    Accept,
    Reject,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RespondOfferRequest {
    pub campaign_id: EntityId,
    pub expected_revision: SafeInt,
    pub source_date: String,
    pub source_boundary_key: Option<String>,
    pub offer_id: EntityId,
    pub decision: OfferDecision,
    pub transfer_id: EntityId,
    pub contract_id: EntityId,
    pub ledger_ids: Vec<EntityId>,
    pub registration_id: Option<EntityId>,
    pub receipt_id: EntityId,
    pub audit_id: EntityId,
    pub action_id: EntityId,
    pub now: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IncomingOfferView {
    pub offer_id: EntityId,
    pub negotiation_id: EntityId,
    pub player_name: String,
    pub bidder_name: String,
    pub fee_cents: MoneyCents,
    pub wage_cents: MoneyCents,
    pub squad_tier: SquadTier,
    pub term: String,
    pub deadline: String,
    pub compulsory: String,
    pub reject_allowed: bool,
    pub ledger_count: SafeInt,
    pub needs_registration: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OutgoingNegotiationView {
    pub negotiation_id: EntityId,
    pub player_name: String,
    pub seller_name: String,
    pub fee_cents: MoneyCents,
    pub wage_cents: MoneyCents,
    pub squad_tier: SquadTier,
    pub status: NegotiationStatus,
    pub deadline: String,
    pub can_withdraw: bool,
    pub can_settle: bool,
    pub ledger_count: SafeInt,
    pub needs_registration: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompletedTransferView {
    pub transfer_id: EntityId,
    pub player_name: String,
    pub other_club: String,
    pub fee_cents: MoneyCents,
    pub kind: TransferKind,
    pub effective_on: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TransferBoard {
    pub incoming: Vec<IncomingOfferView>,
    pub outgoing: Vec<OutgoingNegotiationView>,
    pub completed: Vec<CompletedTransferView>,
}

#[derive(Debug, Clone)]
pub enum MarketCommand {
    Run(RunMarketRequest),
    Close(CloseWindowRequest),
    Propose(ProposeTransferRequest),
    RespondNegotiation(RespondNegotiationRequest),
    RejectOffer(RespondOfferRequest),
}

struct Slot {
    buyer_key: String,
    player_key: String,
    buyer_id: EntityId,
    seller_id: Option<EntityId>,
    player_id: EntityId,
    fee: i64,
    wage: i64,
    tier: SquadTier,
    valuation: i64,
    buyer_prestige: i64,
    seller_prestige: i64,
    counter_count: i64,
    compulsory: bool,
    settle: bool,
    needs_ledger: bool,
    needs_registration: bool,
}

fn loaded<'a>(
    tables: &'a SnapshotTables,
    id: &EntityId,
) -> Result<(&'a CampaignRow, &'a SeasonRow, &'a SimulationStateRow), CommandError> {
    let campaign = tables
        .campaigns
        .iter()
        .find(|row| &row.id == id)
        .ok_or_else(|| invalid("Campaign not found."))?;
    if campaign.mode != CampaignMode::Standalone {
        return Err(invalid(
            "Only standalone careers can use the transfer market.",
        ));
    }
    if campaign.status == CampaignStatus::Archived {
        return Err(invalid("Restore this archived campaign before editing."));
    }
    let season = tables
        .seasons
        .iter()
        .find(|row| row.id == campaign.active_season_id && row.campaign_id == campaign.id)
        .ok_or_else(|| invalid("Active season not found."))?;
    let clock = tables
        .simulation_states
        .iter()
        .find(|row| row.campaign_id == campaign.id && row.active_season_id == season.id)
        .ok_or_else(|| invalid("Saved game clock is missing."))?;
    Ok((campaign, season, clock))
}

fn constitution<'a>(
    tables: &'a SnapshotTables,
    campaign: &EntityId,
) -> Result<&'a ConstitutionRow, CommandError> {
    tables
        .constitutions
        .iter()
        .filter(|row| &row.campaign_id == campaign)
        .max_by_key(|row| row.version.get())
        .ok_or_else(|| invalid("Constitution is missing."))
}

fn rule_of(constitution: &ConstitutionRow) -> Option<QualificationRule> {
    constitution.rules.iter().find_map(|rule| match rule {
        ConstitutionRule::PrestigeBidSale {
            enabled: true,
            required_fee_numerator,
            required_fee_denominator,
            require_higher_prestige,
        } => Some(QualificationRule {
            required_fee_numerator: *required_fee_numerator,
            required_fee_denominator: *required_fee_denominator,
            require_higher_prestige: *require_higher_prestige,
        }),
        _ => None,
    })
}

pub fn window_is_blocked(
    tables: &SnapshotTables,
    campaign_id: &EntityId,
) -> Result<bool, CommandError> {
    let (campaign, _, clock) = loaded(tables, campaign_id)?;
    let Ok(constitution) = constitution(tables, &campaign.id) else {
        let open = tables.offers.iter().any(|offer| {
            offer.campaign_id == campaign.id
                && offer.status == OfferStatus::Open
                && offer.seller_club_id.as_ref() == Some(&campaign.managed_club_id)
        });
        return if open {
            Err(invalid("Constitution is missing."))
        } else {
            Ok(false)
        };
    };
    let count =
        qualifying_stored_offer_count(&tables.offers, &campaign.managed_club_id, constitution)
            .map_err(core)?;
    let report = evaluate_action(
        &PolicyAction::WindowClose {
            unresolved_qualifying_offers: number(count as i64)?,
        },
        &PolicySnapshot {
            revision: campaign.revision,
            remaining_capacity_cents: None,
        },
        constitution,
        &DateOnly::parse(&clock.current_date).map_err(invalid)?,
    )
    .map_err(core)?;
    Ok(!report.allowed)
}

fn offer_still_qualifies(
    offer: &OfferRow,
    constitution: &ConstitutionRow,
) -> Result<bool, CommandError> {
    if offer.status != OfferStatus::Open {
        return Ok(false);
    }
    Ok(qualifying_stored_offer_count(
        std::slice::from_ref(offer),
        offer
            .seller_club_id
            .as_ref()
            .unwrap_or(&offer.bidder_club_id),
        constitution,
    )
    .map_err(core)?
        > 0
        && offer.seller_club_id.is_some())
}

pub fn expire_noncompulsory(
    tables: &mut SnapshotTables,
    campaign_id: &EntityId,
    on: &str,
    due_only: bool,
) {
    let Ok(constitution) = constitution(tables, campaign_id) else {
        return;
    };
    let constitution = constitution.clone();
    let managed = tables
        .campaigns
        .iter()
        .find(|row| &row.id == campaign_id)
        .map(|row| row.managed_club_id.clone());
    let qualifying_negotiations = tables
        .offers
        .iter()
        .filter(|offer| {
            &offer.campaign_id == campaign_id
                && offer_still_qualifies(offer, &constitution).unwrap_or(false)
        })
        .filter_map(|offer| {
            offer
                .negotiation_id
                .as_ref()
                .map(|id| id.as_str().to_owned())
        })
        .collect::<BTreeSet<_>>();
    for negotiation in &mut tables.negotiations {
        if &negotiation.campaign_id != campaign_id || !open_status(negotiation.status) {
            continue;
        }
        if qualifying_negotiations.contains(negotiation.id.as_str()) {
            continue;
        }
        let agreed_purchase = negotiation.status == NegotiationStatus::Agreed
            && managed.as_ref() == Some(&negotiation.buyer_club_id);
        if due_only && agreed_purchase {
            continue;
        }
        if due_only && negotiation.deadline_on.as_str() > on {
            continue;
        }
        negotiation.status = NegotiationStatus::Expired;
        negotiation.reserved_cents = zero();
        negotiation.reserved_wage_cents = zero();
        negotiation.resolved_on = Some(on.to_owned());
    }
    for offer in &mut tables.offers {
        if &offer.campaign_id != campaign_id || offer.status != OfferStatus::Open {
            continue;
        }
        if offer_still_qualifies(offer, &constitution).unwrap_or(false) {
            continue;
        }
        if due_only
            && offer
                .deadline_on
                .as_deref()
                .is_some_and(|deadline| deadline > on)
        {
            continue;
        }
        offer.status = OfferStatus::Expired;
        offer.resolved_on = Some(on.to_owned());
    }
}

fn open_status(status: NegotiationStatus) -> bool {
    matches!(
        status,
        NegotiationStatus::Proposed | NegotiationStatus::Countered | NegotiationStatus::Agreed
    )
}

fn tier_name(tier: SquadTier) -> &'static str {
    match tier {
        SquadTier::Key => "key",
        SquadTier::Rotation => "rotation",
        SquadTier::Youth => "youth",
    }
}

fn club_by_key<'a>(
    tables: &'a SnapshotTables,
    campaign: &EntityId,
    key: &str,
) -> Result<&'a ClubSimulationStateRow, CommandError> {
    tables
        .club_simulation_states
        .iter()
        .find(|row| &row.campaign_id == campaign && row.simulation_key == key)
        .ok_or_else(|| invalid("Club simulation key is missing."))
}

fn player_by_key<'a>(
    tables: &'a SnapshotTables,
    campaign: &EntityId,
    key: &str,
) -> Result<&'a PlayerSimulationStateRow, CommandError> {
    tables
        .player_simulation_states
        .iter()
        .find(|row| &row.campaign_id == campaign && row.simulation_key == key)
        .ok_or_else(|| invalid("Player simulation key is missing."))
}

fn name_of(tables: &SnapshotTables, campaign: &EntityId, id: &EntityId, club: bool) -> String {
    if club {
        tables
            .clubs
            .iter()
            .find(|row| &row.campaign_id == campaign && &row.id == id)
            .map(|row| row.name.clone())
            .unwrap_or_else(|| "Unknown club".into())
    } else {
        tables
            .players
            .iter()
            .find(|row| &row.campaign_id == campaign && &row.id == id)
            .map(|row| row.name.clone())
            .unwrap_or_else(|| "Unknown player".into())
    }
}

fn window_end(date: &DateOnly) -> Result<DateOnly, CommandError> {
    let year = date.year();
    let end = if calendar::transfer_window_on(date) == Some(calendar::TransferWindow::Winter) {
        format!("{year}-01-31")
    } else {
        format!("{year}-08-31")
    };
    DateOnly::parse(&end).map_err(invalid)
}

fn deadline_on(date: &DateOnly) -> Result<String, CommandError> {
    let plus = add_days(date, 14).map_err(core)?;
    let end = window_end(date)?;
    Ok(if plus < end { plus } else { end }.as_str().to_owned())
}

fn market_players(
    tables: &SnapshotTables,
    campaign: &CampaignRow,
    season: &SeasonRow,
    today: &DateOnly,
) -> Result<Vec<MarketPlayer>, CommandError> {
    let mut minutes = BTreeMap::<String, (i64, i64, i64)>::new();
    for appearance in tables
        .simulated_appearances
        .iter()
        .filter(|row| row.campaign_id == campaign.id)
    {
        let in_season = tables.fixtures.iter().any(|fixture| {
            fixture.id == appearance.fixture_id
                && fixture.campaign_id == campaign.id
                && fixture.season_id == season.id
        });
        if !in_season {
            continue;
        }
        let entry = minutes
            .entry(appearance.player_id.as_str().to_owned())
            .or_insert((0, 0, 0));
        entry.0 += appearance.minutes.get();
        entry.1 += appearance.rating.get();
        entry.2 += 1;
    }
    let mut players = Vec::new();
    for player in tables
        .players
        .iter()
        .filter(|row| row.campaign_id == campaign.id)
    {
        let Some(sim) = tables.player_simulation_states.iter().find(|row| {
            row.campaign_id == campaign.id
                && row.player_id == player.id
                && row.status == PlayerLife::Active
        }) else {
            continue;
        };
        let age = if let Some(birth) = &player.birth_date {
            let birth = DateOnly::parse(birth).map_err(invalid)?;
            crate::dates::age_in_whole_years(&birth, today).map_err(core)?
        } else if let Some(reported) = player.reported_age {
            reported.get()
        } else {
            continue;
        };
        if !(16..=38).contains(&age) {
            continue;
        }
        let Ok(ability) = role_ability(&player.attributes, player.position_group) else {
            continue;
        };
        let Some(market_value) = player.market_value_cents else {
            continue;
        };
        let contract = tables.contracts.iter().find(|row| {
            row.campaign_id == campaign.id
                && row.player_id == player.id
                && row.status == ContractStatus::Active
        });
        let (seller_key, seller_prestige) = if let Some(club_id) = &player.club_id {
            let state = tables
                .club_simulation_states
                .iter()
                .find(|row| row.campaign_id == campaign.id && &row.club_id == club_id);
            let club = tables
                .clubs
                .iter()
                .find(|row| row.campaign_id == campaign.id && &row.id == club_id);
            match (state, club) {
                (Some(state), Some(club)) => (
                    Some(state.simulation_key.clone()),
                    Some(club.prestige.get()),
                ),
                _ => continue,
            }
        } else if contract.is_some() {
            continue;
        } else {
            (None, None)
        };
        let (season_minutes, rating_sum, appearance_count) = minutes
            .get(player.id.as_str())
            .copied()
            .unwrap_or((0, 0, 0));
        players.push(MarketPlayer {
            simulation_key: sim.simulation_key.clone(),
            position_group: player.position_group,
            age: Some(age),
            ability: Some(ability.get()),
            market_value_cents: Some(market_value.get()),
            seller_simulation_key: seller_key,
            seller_prestige,
            current_wage_cents: contract
                .and_then(|row| row.weekly_wage_cents)
                .map(|wage| wage.get()),
            current_tier: contract.and_then(|row| row.squad_tier),
            season_minutes,
            rating_sum,
            appearance_count,
        });
    }
    Ok(players)
}

fn market_clubs(
    tables: &SnapshotTables,
    campaign: &CampaignRow,
    players: &[MarketPlayer],
) -> Result<Vec<MarketClub>, CommandError> {
    let managed = tables
        .club_simulation_states
        .iter()
        .find(|row| row.campaign_id == campaign.id && row.club_id == campaign.managed_club_id)
        .map(|row| row.simulation_key.clone())
        .ok_or_else(|| invalid("Managed club simulation key is missing."))?;
    let mut clubs = Vec::new();
    for state in tables
        .club_simulation_states
        .iter()
        .filter(|row| row.campaign_id == campaign.id)
    {
        if state.simulation_key == managed {
            continue;
        }
        let wages =
            wage_commitment(&tables.contracts, &campaign.id, &state.club_id).map_err(core)?;
        if wages.unknown_count > 0 {
            continue;
        }
        let (reserved_fee, reserved_wage, open_buys) = tables
            .negotiations
            .iter()
            .filter(|row| {
                row.campaign_id == campaign.id
                    && row.buyer_club_id == state.club_id
                    && open_status(row.status)
            })
            .fold((0_i64, 0_i64, 0_i64), |total, row| {
                (
                    total.0 + row.reserved_cents.get(),
                    total.1 + row.reserved_wage_cents.get(),
                    total.2 + 1,
                )
            });
        let spendable = (state.transfer_balance_cents.get() - reserved_fee).max(0);
        let wage_room =
            (state.wage_budget_weekly_cents.get() - wages.known_cents - reserved_wage).max(0);
        let _ = players;
        clubs.push(MarketClub {
            simulation_key: state.simulation_key.clone(),
            prestige: tables
                .clubs
                .iter()
                .find(|club| club.campaign_id == campaign.id && club.id == state.club_id)
                .map(|club| club.prestige.get())
                .unwrap_or(0),
            spendable_cents: spendable,
            wage_room_cents: wage_room,
            open_buy_count: open_buys,
        });
    }
    Ok(clubs)
}

fn plan_slots(tables: &SnapshotTables, campaign_id: &EntityId) -> Result<Vec<Slot>, CommandError> {
    let mut scratch = tables.clone();
    let campaign_for_expiry = loaded(&scratch, campaign_id)?.0.id.clone();
    let today_for_expiry = loaded(&scratch, campaign_id)?.2.current_date.clone();
    expire_noncompulsory(&mut scratch, &campaign_for_expiry, &today_for_expiry, true);
    let (campaign, season, clock) = loaded(&scratch, campaign_id)?;
    let campaign = campaign.clone();
    let season = season.clone();
    let root_seed = clock.root_seed.clone();
    let current_date = clock.current_date.clone();
    let today = DateOnly::parse(&current_date).map_err(invalid)?;
    let players = market_players(&scratch, &campaign, &season, &today)?;
    let clubs = market_clubs(&scratch, &campaign, &players)?;
    let managed = scratch
        .club_simulation_states
        .iter()
        .find(|row| row.campaign_id == campaign.id && row.club_id == campaign.managed_club_id)
        .ok_or_else(|| invalid("Managed club simulation key is missing."))?
        .simulation_key
        .clone();
    let constitution = constitution(&scratch, &campaign.id)?;
    let qualifying = rule_of(constitution);
    let version = constitution.version;
    let mut compulsory = BTreeSet::new();
    for offer in scratch
        .offers
        .iter()
        .filter(|offer| offer.campaign_id == campaign.id)
    {
        if offer_still_qualifies(offer, constitution)? {
            if let Some(player) = scratch
                .player_simulation_states
                .iter()
                .find(|row| row.campaign_id == campaign.id && row.player_id == offer.player_id)
            {
                compulsory.insert(player.simulation_key.clone());
            }
        }
    }
    let mut open_pairs = BTreeSet::new();
    for negotiation in scratch
        .negotiations
        .iter()
        .filter(|row| row.campaign_id == campaign.id && open_status(row.status))
    {
        let buyer = scratch
            .club_simulation_states
            .iter()
            .find(|row| row.campaign_id == campaign.id && row.club_id == negotiation.buyer_club_id);
        let player = scratch
            .player_simulation_states
            .iter()
            .find(|row| row.campaign_id == campaign.id && row.player_id == negotiation.player_id);
        if let (Some(buyer), Some(player)) = (buyer, player) {
            open_pairs.insert((buyer.simulation_key.clone(), player.simulation_key.clone()));
        }
    }
    let operation = market_key(season.id.as_str(), today.as_str());
    let bids = plan_openings(
        &clubs,
        &players,
        &managed,
        &MarketSeedInputs {
            root_seed,
            operation_key: operation,
            stream_version: MARKET_ENGINE_VERSION.into(),
        },
        qualifying,
        &compulsory,
        &open_pairs,
    )
    .map_err(core)?;
    let mut slots = Vec::new();
    for (index, bid) in bids.into_iter().enumerate() {
        let Some(player) = players
            .iter()
            .find(|row| row.simulation_key == bid.player_key)
        else {
            continue;
        };
        let seller_managed = player.seller_simulation_key.as_deref() == Some(managed.as_str());
        let current_wage = player.current_wage_cents.unwrap_or(bid.wage_cents);
        let buyer = clubs
            .iter()
            .find(|club| club.simulation_key == bid.buyer_key);
        let Some(buyer_club) = buyer else { continue };
        let agreement = resolve_terms(TermProposal {
            fee_cents: bid.fee_cents,
            wage_cents: bid.wage_cents,
            tier: bid.tier,
            valuation_cents: bid.valuation_cents,
            current_wage_cents: current_wage,
            current_tier: player.current_tier,
            seller_is_managed: seller_managed,
            buyer_is_ai: true,
            spendable_cents: buyer_club.spendable_cents,
            wage_room_cents: buyer_club.wage_room_cents,
        })
        .map_err(core)?;
        let Agreement::Agreed {
            fee_cents,
            wage_cents,
            tier,
            counter_count,
        } = agreement
        else {
            continue;
        };
        if fee_cents > buyer_club.spendable_cents || wage_cents > buyer_club.wage_room_cents {
            continue;
        }
        let seller_prestige = player.seller_prestige.unwrap_or(0);
        let compulsory_bid = seller_managed
            && qualifying.is_some_and(|rule| {
                crate::policy::offer_qualifies(
                    money(fee_cents).unwrap_or(zero()),
                    Some(money(bid.valuation_cents).unwrap_or(zero())),
                    Some(number(buyer_club.prestige).unwrap_or(number(0).unwrap())),
                    Some(number(seller_prestige).unwrap_or(number(0).unwrap())),
                    rule,
                )
                .ok()
                    == Some(Qualification::Qualifies)
            });
        if compulsory_bid
            && (fee_cents > buyer_club.spendable_cents || wage_cents > buyer_club.wage_room_cents)
        {
            continue;
        }
        let buyer_id = club_by_key(&scratch, &campaign.id, &bid.buyer_key)?
            .club_id
            .clone();
        let player_id = player_by_key(&scratch, &campaign.id, &bid.player_key)?
            .player_id
            .clone();
        let seller_id = player
            .seller_simulation_key
            .as_deref()
            .map(|key| club_by_key(&scratch, &campaign.id, key).map(|row| row.club_id.clone()))
            .transpose()?;
        let negotiation_id = EntityId::new(format!("tick-negotiation-{index:02}")).map_err(core)?;
        let deadline = deadline_on(&today)?;
        let end = season
            .end_date
            .clone()
            .ok_or_else(|| invalid("Season end is missing."))?;
        scratch.negotiations.push(NegotiationRow {
            id: negotiation_id.clone(),
            campaign_id: campaign.id.clone(),
            season_id: season.id.clone(),
            player_id: player_id.clone(),
            buyer_club_id: buyer_id.clone(),
            seller_club_id: seller_id.clone(),
            status: NegotiationStatus::Agreed,
            fee_cents: money(fee_cents)?,
            reserved_cents: money(fee_cents)?,
            wage_cents: money(wage_cents)?,
            reserved_wage_cents: money(wage_cents)?,
            squad_tier: tier,
            expires_on: end,
            counter_count: number(counter_count)?,
            opened_on: today.as_str().to_owned(),
            deadline_on: deadline,
            resolved_on: None,
            engine_version: VersionOne,
            event_seed: number(i64::from(
                derive_event_seed(
                    &scratch
                        .simulation_states
                        .iter()
                        .find(|row| row.campaign_id == campaign.id)
                        .unwrap()
                        .root_seed,
                    "1",
                    EventKind::Market,
                    &[&market_key(season.id.as_str(), today.as_str())],
                )
                .map_err(core)?,
            ))?,
            qualification: Some(NegotiationQualification {
                fee_cents: money(fee_cents)?,
                valuation_cents: money(bid.valuation_cents)?,
                buyer_prestige: number(buyer_club.prestige)?,
                seller_prestige: number(seller_prestige)?,
                constitution_version: version,
                compulsory: number(i64::from(compulsory_bid))?,
            }),
        });
        let mut needs_ledger = false;
        let mut needs_registration = false;
        if !seller_managed {
            let request = settlement::SettleTransferRequest {
                campaign_id: campaign.id.clone(),
                expected_revision: campaign.revision,
                negotiation_id: negotiation_id.clone(),
                source_date: today.as_str().to_owned(),
                source_boundary_key: scratch
                    .simulation_states
                    .iter()
                    .find(|row| row.campaign_id == campaign.id)
                    .and_then(|row| row.last_boundary_key.clone()),
                transfer_id: EntityId::new(format!("tick-transfer-{index:02}")).map_err(core)?,
                contract_id: EntityId::new(format!("tick-contract-{index:02}")).map_err(core)?,
                ledger_ids: if fee_cents > 0 {
                    vec![
                        EntityId::new(format!("tick-ledger-{index:02}a")).map_err(core)?,
                        EntityId::new(format!("tick-ledger-{index:02}b")).map_err(core)?,
                    ]
                } else {
                    Vec::new()
                },
                registration_id: None,
                receipt_id: EntityId::new(format!("tick-receipt-{index:02}")).map_err(core)?,
                audit_id: EntityId::new(format!("tick-audit-{index:02}")).map_err(core)?,
                action_id: EntityId::new(format!("tick-action-{index:02}")).map_err(core)?,
                now: "2026-01-01T00:00:00.000Z".into(),
            };
            let plan = match settlement::settlement_plan(&scratch, &request) {
                Ok(plan) => plan,
                Err(_) => {
                    scratch.negotiations.pop();
                    continue;
                }
            };
            needs_ledger = plan.needs_ledger;
            needs_registration = plan
                .registration
                .as_ref()
                .is_some_and(|row| row.existing_id.is_none());
            let mut ids = MovementIds {
                transfer_id: request.transfer_id.clone(),
                contract_id: request.contract_id.clone(),
                ledger_ids: request.ledger_ids.clone(),
                registration_id: if needs_registration {
                    Some(EntityId::new(format!("tick-registration-{index:02}")).map_err(core)?)
                } else {
                    None
                },
                action_id: request.action_id.clone(),
                now: request.now.clone(),
            };
            if needs_registration {
                request_registration(&mut ids);
            }
            if settlement::apply_movement(&mut scratch, &plan, &ids).is_err() {
                return Err(invalid("The market tick could not reserve a bid."));
            }
        }
        slots.push(Slot {
            buyer_key: bid.buyer_key,
            player_key: bid.player_key,
            buyer_id,
            seller_id,
            player_id,
            fee: fee_cents,
            wage: wage_cents,
            tier,
            valuation: bid.valuation_cents,
            buyer_prestige: buyer_club.prestige,
            seller_prestige,
            counter_count,
            compulsory: compulsory_bid,
            settle: !seller_managed,
            needs_ledger,
            needs_registration,
        });
    }
    Ok(slots)
}

fn request_registration(ids: &mut MovementIds) {
    let _ = ids;
}

fn identities(slots: &[Slot]) -> Vec<(String, String, i64, i64, String, String, i64)> {
    let mut rows = slots
        .iter()
        .map(|slot| {
            (
                slot.buyer_key.clone(),
                slot.player_key.clone(),
                slot.fee,
                slot.wage,
                tier_name(slot.tier).to_owned(),
                if slot.settle { "settle" } else { "offer" }.to_owned(),
                slot.valuation,
            )
        })
        .collect::<Vec<_>>();
    rows.sort();
    rows
}

fn stored_identities(
    tables: &SnapshotTables,
    campaign: &CampaignRow,
    date: &str,
    seed: i64,
) -> Vec<(String, String, i64, i64, String, String, i64)> {
    let mut rows = Vec::new();
    for negotiation in tables.negotiations.iter().filter(|row| {
        row.campaign_id == campaign.id && row.opened_on == date && row.event_seed.get() == seed
    }) {
        let Some(buyer) = tables
            .club_simulation_states
            .iter()
            .find(|row| row.campaign_id == campaign.id && row.club_id == negotiation.buyer_club_id)
        else {
            continue;
        };
        let Some(player) = tables
            .player_simulation_states
            .iter()
            .find(|row| row.campaign_id == campaign.id && row.player_id == negotiation.player_id)
        else {
            continue;
        };
        let offer = tables.offers.iter().any(|offer| {
            offer.campaign_id == campaign.id
                && offer.negotiation_id.as_ref() == Some(&negotiation.id)
        });
        let valuation = negotiation
            .qualification
            .as_ref()
            .map(|row| row.valuation_cents.get())
            .unwrap_or(0);
        rows.push((
            buyer.simulation_key.clone(),
            player.simulation_key.clone(),
            negotiation.fee_cents.get(),
            negotiation.wage_cents.get(),
            tier_name(negotiation.squad_tier).to_owned(),
            if offer { "offer" } else { "settle" }.to_owned(),
            valuation,
        ));
    }
    rows.sort();
    rows
}

fn tick_seed(
    clock: &SimulationStateRow,
    season: &SeasonRow,
    date: &str,
) -> Result<i64, CommandError> {
    Ok(i64::from(
        derive_event_seed(
            &clock.root_seed,
            "1",
            EventKind::Market,
            &[&market_key(season.id.as_str(), date)],
        )
        .map_err(core)?,
    ))
}

fn validate_clock(
    request_date: &str,
    request_boundary: &Option<String>,
    now: &str,
    revision: SafeInt,
) -> Result<(), CommandError> {
    DateOnly::parse(request_date).map_err(invalid)?;
    validate_timestamp(now).map_err(invalid)?;
    if revision.get() < 0 {
        return Err(invalid("Expected revision must be non-negative."));
    }
    if let Some(cursor) = request_boundary {
        if cursor.trim() != cursor || cursor.is_empty() || cursor.chars().count() > 200 {
            return Err(invalid("Source cursor is not supported."));
        }
    }
    Ok(())
}

fn cursor_matches(
    clock: &SimulationStateRow,
    campaign: &CampaignRow,
    revision: SafeInt,
    date: &str,
    boundary: &Option<String>,
) -> Result<(), CommandError> {
    if campaign.revision != revision {
        return Err(conflict("Campaign revision is stale."));
    }
    if clock.current_date != date || &clock.last_boundary_key != boundary {
        return Err(conflict(
            "Source date or cursor does not match the saved game.",
        ));
    }
    Ok(())
}

fn fresh(tables: &SnapshotTables, id: &EntityId) -> bool {
    !tables.negotiations.iter().any(|row| &row.id == id)
        && !tables.offers.iter().any(|row| &row.id == id)
        && !tables.transfers.iter().any(|row| &row.id == id)
        && !tables.contracts.iter().any(|row| &row.id == id)
        && !tables.ledger_entries.iter().any(|row| &row.id == id)
        && !tables.registrations.iter().any(|row| &row.id == id)
        && !tables
            .audit_events
            .iter()
            .any(|row| &row.id == id || &row.action_id == id)
        && !tables.simulation_receipts.iter().any(|row| &row.id == id)
}

pub fn preview(
    tables: &SnapshotTables,
    campaign_id: &EntityId,
) -> Result<MarketPreview, CommandError> {
    let (campaign, _, clock) = loaded(tables, campaign_id)?;
    let due = calendar::market_due(
        clock,
        tables
            .seasons
            .iter()
            .find(|row| row.id == campaign.active_season_id)
            .ok_or_else(|| invalid("Active season not found."))?,
    )
    .map_err(invalid)?;
    let mut view = MarketPreview {
        campaign_id: campaign.id.clone(),
        revision: campaign.revision,
        from_date: clock.current_date.clone(),
        source_boundary_key: clock.last_boundary_key.clone(),
        action: MarketAction::None,
        allowed: false,
        reason: None,
        negotiation_count: number(0)?,
        offer_count: number(0)?,
        transfer_count: number(0)?,
        contract_count: number(0)?,
        ledger_count: number(0)?,
        registration_count: number(0)?,
    };
    match due {
        Some(MarketDue::Tick) => {
            let slots = plan_slots(tables, campaign_id)?;
            view.action = MarketAction::Run;
            view.allowed = true;
            if calendar::transfer_window_on(&DateOnly::parse(&clock.current_date).map_err(invalid)?)
                == Some(calendar::TransferWindow::Winter)
            {
                view.reason = Some(calendar::RUN_MARKET_BEFORE_MATCHDAY.into());
            }
            view.negotiation_count = number(slots.len() as i64)?;
            view.offer_count = number(slots.iter().filter(|slot| !slot.settle).count() as i64)?;
            view.transfer_count = number(slots.iter().filter(|slot| slot.settle).count() as i64)?;
            view.contract_count = view.transfer_count;
            view.ledger_count =
                number(slots.iter().filter(|slot| slot.needs_ledger).count() as i64 * 2)?;
            view.registration_count =
                number(slots.iter().filter(|slot| slot.needs_registration).count() as i64)?;
        }
        Some(MarketDue::Close) => {
            view.action = MarketAction::Close;
            if window_is_blocked(tables, campaign_id)? {
                view.allowed = false;
                view.reason = Some(ACCEPT_QUALIFYING_OFFER.into());
            } else {
                view.allowed = true;
                view.reason = Some(calendar::CLOSE_WINDOW_BEFORE_MATCHDAY.into());
            }
        }
        None => {}
    }
    Ok(view)
}

pub fn material(tables: &SnapshotTables, command: &MarketCommand) -> Result<String, CommandError> {
    match command {
        MarketCommand::Run(request) => {
            validate_clock(
                &request.source_date,
                &request.source_boundary_key,
                &request.now,
                request.expected_revision,
            )?;
            let (campaign, season, clock) = loaded(tables, &request.campaign_id)?;
            let operation = market_key(season.id.as_str(), &request.source_date);
            let seed = tick_seed(clock, season, &request.source_date)?;
            let proposals = if tables
                .simulation_receipts
                .iter()
                .any(|row| row.campaign_id == campaign.id && row.operation_key == operation)
            {
                stored_identities(tables, campaign, &request.source_date, seed)
            } else {
                identities(&plan_slots(tables, &request.campaign_id)?)
            };
            serde_json::to_string(&(
                "market",
                campaign.id.as_str(),
                request.expected_revision.get(),
                request.source_date.as_str(),
                request.source_boundary_key.as_deref(),
                MARKET_ENGINE_VERSION,
                clock.root_seed.as_str(),
                proposals,
            ))
            .map_err(|_| invalid("Market input could not be encoded."))
        }
        MarketCommand::Close(request) => simple_material(
            tables,
            &request.campaign_id,
            request.expected_revision,
            &request.source_date,
            &request.source_boundary_key,
            &request.now,
            "close",
        ),
        MarketCommand::Propose(request) => {
            let (campaign, _, clock) = loaded(tables, &request.campaign_id)?;
            let player = player_key(tables, &campaign.id, &request.player_id)?;
            let buyer = club_key(tables, &campaign.id, &campaign.managed_club_id)?;
            serde_json::to_string(&(
                "proposal",
                campaign.id.as_str(),
                request.expected_revision.get(),
                request.source_date.as_str(),
                request.source_boundary_key.as_deref(),
                MARKET_ENGINE_VERSION,
                clock.root_seed.as_str(),
                buyer,
                player,
                request.fee_cents.get(),
                request.wage_cents.get(),
                tier_name(request.squad_tier),
            ))
            .map_err(|_| invalid("Proposal input could not be encoded."))
        }
        MarketCommand::RespondNegotiation(request) => simple_material(
            tables,
            &request.campaign_id,
            request.expected_revision,
            &request.source_date,
            &request.source_boundary_key,
            &request.now,
            &format!("respond:{}", request.negotiation_id.as_str()),
        ),
        MarketCommand::RejectOffer(request) => simple_material(
            tables,
            &request.campaign_id,
            request.expected_revision,
            &request.source_date,
            &request.source_boundary_key,
            &request.now,
            &format!("reject:{}", request.offer_id.as_str()),
        ),
    }
}

fn simple_material(
    tables: &SnapshotTables,
    campaign_id: &EntityId,
    revision: SafeInt,
    date: &str,
    boundary: &Option<String>,
    now: &str,
    kind: &str,
) -> Result<String, CommandError> {
    validate_clock(date, boundary, now, revision)?;
    let (campaign, _, clock) = loaded(tables, campaign_id)?;
    serde_json::to_string(&(
        kind,
        campaign.id.as_str(),
        revision.get(),
        date,
        boundary.as_deref(),
        MARKET_ENGINE_VERSION,
        clock.root_seed.as_str(),
    ))
    .map_err(|_| invalid("Market input could not be encoded."))
}

fn player_key<'a>(
    tables: &'a SnapshotTables,
    campaign: &EntityId,
    player: &EntityId,
) -> Result<&'a str, CommandError> {
    tables
        .player_simulation_states
        .iter()
        .find(|row| &row.campaign_id == campaign && &row.player_id == player)
        .map(|row| row.simulation_key.as_str())
        .ok_or_else(|| invalid("Player simulation key is missing."))
}
fn club_key<'a>(
    tables: &'a SnapshotTables,
    campaign: &EntityId,
    club: &EntityId,
) -> Result<&'a str, CommandError> {
    tables
        .club_simulation_states
        .iter()
        .find(|row| &row.campaign_id == campaign && &row.club_id == club)
        .map(|row| row.simulation_key.as_str())
        .ok_or_else(|| invalid("Club simulation key is missing."))
}

fn outcome_now(
    campaign: &CampaignRow,
    clock: &SimulationStateRow,
    receipt: &EntityId,
    operation: String,
) -> AdvanceOutcome {
    AdvanceOutcome {
        campaign_id: campaign.id.clone(),
        revision: campaign.revision,
        replayed: true,
        receipt_id: receipt.clone(),
        operation_key: operation,
        current_date: clock.current_date.clone(),
        phase: clock.phase,
        last_boundary_key: clock.last_boundary_key.clone(),
    }
}

pub fn commit(
    tables: &mut SnapshotTables,
    command: &MarketCommand,
    fingerprint: &str,
) -> Result<AdvanceOutcome, CommandError> {
    match command {
        MarketCommand::Run(request) => commit_run(tables, request, fingerprint),
        MarketCommand::Close(request) => commit_close(tables, request, fingerprint),
        MarketCommand::Propose(request) => commit_propose(tables, request, fingerprint),
        MarketCommand::RespondNegotiation(request) => commit_respond(tables, request, fingerprint),
        MarketCommand::RejectOffer(request) => commit_reject(tables, request, fingerprint),
    }
}

fn commit_run(
    tables: &mut SnapshotTables,
    request: &RunMarketRequest,
    fingerprint: &str,
) -> Result<AdvanceOutcome, CommandError> {
    let (campaign, season, clock) = loaded(tables, &request.campaign_id)?;
    let operation = market_key(season.id.as_str(), &request.source_date);
    if let Some(receipt) = tables
        .simulation_receipts
        .iter()
        .find(|row| row.campaign_id == campaign.id && row.operation_key == operation)
    {
        if receipt.input_fingerprint == fingerprint {
            return Ok(outcome_now(campaign, clock, &receipt.id, operation));
        }
        return Err(conflict(
            "This market tick was already recorded with different input.",
        ));
    }
    let due = calendar::market_due(clock, season).map_err(invalid)?;
    if due != Some(MarketDue::Tick) {
        return Err(invalid("Run Market is not available on this date."));
    }
    cursor_matches(
        clock,
        campaign,
        request.expected_revision,
        &request.source_date,
        &request.source_boundary_key,
    )?;
    let slots = plan_slots(tables, &request.campaign_id)?;
    let offer_count = slots.iter().filter(|slot| !slot.settle).count();
    let transfer_count = slots.iter().filter(|slot| slot.settle).count();
    let ledger_count = slots.iter().filter(|slot| slot.needs_ledger).count() * 2;
    let registration_count = slots.iter().filter(|slot| slot.needs_registration).count();
    if request.negotiation_ids.len() != slots.len()
        || request.offer_ids.len() != offer_count
        || request.transfer_ids.len() != transfer_count
        || request.contract_ids.len() != transfer_count
        || request.ledger_ids.len() != ledger_count
        || request.registration_ids.len() != registration_count
    {
        return Err(invalid("Market ID vectors must exactly cover the plan."));
    }
    let mut seen = BTreeSet::new();
    let ids = request
        .negotiation_ids
        .iter()
        .chain(&request.offer_ids)
        .chain(&request.transfer_ids)
        .chain(&request.contract_ids)
        .chain(&request.ledger_ids)
        .chain(&request.registration_ids)
        .chain([&request.receipt_id, &request.audit_id, &request.action_id]);
    for id in ids {
        if !seen.insert(id.as_str().to_owned()) || !fresh(tables, id) {
            return Err(invalid("Market row IDs must be unique and unused."));
        }
    }
    let (campaign, season, clock) = loaded(tables, &request.campaign_id)?;
    let today = clock.current_date.clone();
    let season_id = season.id.clone();
    let campaign_id = campaign.id.clone();
    let managed = campaign.managed_club_id.clone();
    let revision = next_revision(campaign.revision).map_err(invalid)?;
    let root_seed = clock.root_seed.clone();
    let phase = clock.phase;
    let event_seed = number(tick_seed(clock, season, &today)?)?;
    expire_noncompulsory(tables, &campaign_id, &today, true);
    let end = tables
        .seasons
        .iter()
        .find(|row| row.id == season_id)
        .and_then(|row| row.end_date.clone())
        .ok_or_else(|| invalid("Season end is missing."))?;
    let constitution_version = constitution(tables, &campaign_id)?.version;
    let deadline = deadline_on(&DateOnly::parse(&today).map_err(invalid)?)?;
    let mut offer_index = 0;
    let mut transfer_index = 0;
    let mut ledger_index = 0;
    let mut registration_index = 0;
    let mut refs = vec![OutcomeRef::Boundary {
        key: operation.clone(),
    }];
    for (index, slot) in slots.iter().enumerate() {
        let negotiation_id = request.negotiation_ids[index].clone();
        tables.negotiations.push(NegotiationRow {
            id: negotiation_id.clone(),
            campaign_id: campaign_id.clone(),
            season_id: season_id.clone(),
            player_id: slot.player_id.clone(),
            buyer_club_id: slot.buyer_id.clone(),
            seller_club_id: slot.seller_id.clone(),
            status: NegotiationStatus::Agreed,
            fee_cents: money(slot.fee)?,
            reserved_cents: money(slot.fee)?,
            wage_cents: money(slot.wage)?,
            reserved_wage_cents: money(slot.wage)?,
            squad_tier: slot.tier,
            expires_on: end.clone(),
            counter_count: number(slot.counter_count)?,
            opened_on: today.clone(),
            deadline_on: deadline.clone(),
            resolved_on: None,
            engine_version: VersionOne,
            event_seed,
            qualification: Some(NegotiationQualification {
                fee_cents: money(slot.fee)?,
                valuation_cents: money(slot.valuation)?,
                buyer_prestige: number(slot.buyer_prestige)?,
                seller_prestige: number(slot.seller_prestige)?,
                constitution_version,
                compulsory: number(i64::from(slot.compulsory))?,
            }),
        });
        if refs.len() < 32 {
            refs.push(OutcomeRef::Negotiation {
                id: negotiation_id.clone(),
            });
        }
        if slot.settle {
            let plan = settlement::settlement_plan(
                tables,
                &settlement::SettleTransferRequest {
                    campaign_id: campaign_id.clone(),
                    expected_revision: request.expected_revision,
                    negotiation_id: negotiation_id.clone(),
                    source_date: today.clone(),
                    source_boundary_key: request.source_boundary_key.clone(),
                    transfer_id: request.transfer_ids[transfer_index].clone(),
                    contract_id: request.contract_ids[transfer_index].clone(),
                    ledger_ids: if slot.needs_ledger {
                        request.ledger_ids[ledger_index..ledger_index + 2].to_vec()
                    } else {
                        Vec::new()
                    },
                    registration_id: slot
                        .needs_registration
                        .then(|| request.registration_ids[registration_index].clone()),
                    receipt_id: request.receipt_id.clone(),
                    audit_id: request.audit_id.clone(),
                    action_id: request.action_id.clone(),
                    now: request.now.clone(),
                },
            )?;
            settlement::apply_movement(
                tables,
                &plan,
                &MovementIds {
                    transfer_id: request.transfer_ids[transfer_index].clone(),
                    contract_id: request.contract_ids[transfer_index].clone(),
                    ledger_ids: if slot.needs_ledger {
                        request.ledger_ids[ledger_index..ledger_index + 2].to_vec()
                    } else {
                        Vec::new()
                    },
                    registration_id: slot
                        .needs_registration
                        .then(|| request.registration_ids[registration_index].clone()),
                    action_id: request.action_id.clone(),
                    now: request.now.clone(),
                },
            )?;
            transfer_index += 1;
            if slot.needs_ledger {
                ledger_index += 2;
            }
            if slot.needs_registration {
                registration_index += 1;
            }
        } else {
            tables.offers.push(OfferRow {
                id: request.offer_ids[offer_index].clone(),
                campaign_id: campaign_id.clone(),
                season_id: season_id.clone(),
                player_id: slot.player_id.clone(),
                bidder_club_id: slot.buyer_id.clone(),
                fee_cents: money(slot.fee)?,
                status: OfferStatus::Open,
                received_on: today.clone(),
                resolved_on: None,
                negotiation_id: Some(negotiation_id),
                seller_club_id: Some(managed.clone()),
                deadline_on: Some(deadline.clone()),
                origin: Some(OfferOrigin::Ai),
                market_value_cents: Some(money(slot.valuation)?),
                bidder_prestige: Some(number(slot.buyer_prestige)?),
                seller_prestige: Some(number(slot.seller_prestige)?),
                constitution_version: Some(constitution_version),
                compulsory: slot.compulsory,
            });
            if refs.len() < 32 {
                refs.push(OutcomeRef::Offer {
                    id: request.offer_ids[offer_index].clone(),
                });
            }
            offer_index += 1;
        }
    }
    let _ = root_seed;
    finish(
        tables,
        &campaign_id,
        &season_id,
        revision,
        &operation,
        &today,
        phase,
        Some(operation.clone()),
        request.expected_revision,
        fingerprint,
        event_seed,
        &request.receipt_id,
        &request.audit_id,
        &request.action_id,
        &request.now,
        AuditAction::MarketTick,
        "Ran the transfer market.",
        refs,
    )
}

#[allow(clippy::too_many_arguments)]
fn finish(
    tables: &mut SnapshotTables,
    campaign_id: &EntityId,
    season_id: &EntityId,
    revision: SafeInt,
    operation: &str,
    date: &str,
    phase: CalendarPhase,
    boundary: Option<String>,
    input_revision: SafeInt,
    fingerprint: &str,
    event_seed: SafeInt,
    receipt_id: &EntityId,
    audit_id: &EntityId,
    action_id: &EntityId,
    now: &str,
    action: AuditAction,
    summary: &str,
    refs: Vec<OutcomeRef>,
) -> Result<AdvanceOutcome, CommandError> {
    let saved = tables
        .campaigns
        .iter_mut()
        .find(|row| &row.id == campaign_id)
        .ok_or_else(|| invalid("Campaign is missing."))?;
    saved.revision = revision;
    saved.updated_at = now.to_owned();
    if let Some(boundary) = &boundary {
        if let Some(clock) = tables
            .simulation_states
            .iter_mut()
            .find(|row| &row.campaign_id == campaign_id)
        {
            clock.last_boundary_key = Some(boundary.clone());
            clock.current_date = date.to_owned();
            clock.phase = phase;
        }
    }
    tables.simulation_receipts.push(SimulationReceiptRow {
        id: receipt_id.clone(),
        campaign_id: campaign_id.clone(),
        operation_key: operation.to_owned(),
        input_revision,
        input_fingerprint: fingerprint.to_owned(),
        event_seed,
        simulation_version: VersionOne,
        outcome_refs: refs,
        created_at: now.to_owned(),
    });
    let payload = json!({ "marketFingerprint": fingerprint, "operationKey": operation });
    tables.audit_events.push(AuditEventRow {
        id: audit_id.clone(),
        campaign_id: campaign_id.clone(),
        season_id: Some(season_id.clone()),
        action_id: action_id.clone(),
        action_type: action,
        created_at: now.to_owned(),
        summary: summary.into(),
        payload: AuditPayload(
            payload
                .as_object()
                .cloned()
                .ok_or_else(|| invalid("Audit could not be encoded."))?,
        ),
    });
    let clock = tables
        .simulation_states
        .iter()
        .find(|row| &row.campaign_id == campaign_id)
        .ok_or_else(|| invalid("Saved game clock is missing."))?;
    Ok(AdvanceOutcome {
        campaign_id: campaign_id.clone(),
        revision,
        replayed: false,
        receipt_id: receipt_id.clone(),
        operation_key: operation.to_owned(),
        current_date: clock.current_date.clone(),
        phase: clock.phase,
        last_boundary_key: clock.last_boundary_key.clone(),
    })
}

fn commit_close(
    tables: &mut SnapshotTables,
    request: &CloseWindowRequest,
    fingerprint: &str,
) -> Result<AdvanceOutcome, CommandError> {
    let (campaign, season, clock) = loaded(tables, &request.campaign_id)?;
    let operation = winter_close_key(season.id.as_str());
    if let Some(receipt) = tables
        .simulation_receipts
        .iter()
        .find(|row| row.campaign_id == campaign.id && row.operation_key == operation)
    {
        if receipt.input_fingerprint == fingerprint {
            return Ok(outcome_now(campaign, clock, &receipt.id, operation));
        }
        return Err(conflict(
            "This window close was already recorded with different input.",
        ));
    }
    if calendar::market_due(clock, season).map_err(invalid)? != Some(MarketDue::Close) {
        return Err(invalid("Close Window is not available on this date."));
    }
    cursor_matches(
        clock,
        campaign,
        request.expected_revision,
        &request.source_date,
        &request.source_boundary_key,
    )?;
    if window_is_blocked(tables, &request.campaign_id)? {
        return Err(invalid(ACCEPT_QUALIFYING_OFFER));
    }
    for id in [&request.receipt_id, &request.audit_id, &request.action_id] {
        if !fresh(tables, id) {
            return Err(invalid("Market row IDs must be unique and unused."));
        }
    }
    let (campaign, season, clock) = loaded(tables, &request.campaign_id)?;
    let revision = next_revision(campaign.revision).map_err(invalid)?;
    let campaign_id = campaign.id.clone();
    let season_id = season.id.clone();
    let date = clock.current_date.clone();
    let phase = clock.phase;
    let seed = number(i64::from(
        derive_event_seed(&clock.root_seed, "1", EventKind::Market, &[&operation]).map_err(core)?,
    ))?;
    expire_noncompulsory(tables, &campaign_id, &date, false);
    let boundary = operation.clone();
    finish(
        tables,
        &campaign_id,
        &season_id,
        revision,
        &operation,
        &date,
        phase,
        Some(boundary.clone()),
        request.expected_revision,
        fingerprint,
        seed,
        &request.receipt_id,
        &request.audit_id,
        &request.action_id,
        &request.now,
        AuditAction::MarketClose,
        "Closed the winter window.",
        vec![OutcomeRef::Boundary { key: boundary }],
    )
}

fn approach_open(clock: &SimulationStateRow, season: &SeasonRow) -> Result<(), CommandError> {
    let window = calendar::active_transfer_window(clock, season).map_err(invalid)?;
    if window.is_none() {
        return Err(invalid(TRANSFER_WINDOW_CLOSED));
    }
    Ok(())
}

fn commit_propose(
    tables: &mut SnapshotTables,
    request: &ProposeTransferRequest,
    fingerprint: &str,
) -> Result<AdvanceOutcome, CommandError> {
    let (campaign, season, clock) = loaded(tables, &request.campaign_id)?;
    approach_open(clock, season)?;
    let buyer_key = club_key(tables, &campaign.id, &campaign.managed_club_id)?.to_owned();
    let player_key = player_key(tables, &campaign.id, &request.player_id)?.to_owned();
    let operation = format!(
        "season:{}:proposal:{buyer_key}:player:{player_key}:fee:{}:wage:{}:tier:{}:opened:{}",
        season.id.as_str(),
        request.fee_cents.get(),
        request.wage_cents.get(),
        tier_name(request.squad_tier),
        request.source_date
    );
    if let Some(receipt) = tables
        .simulation_receipts
        .iter()
        .find(|row| row.campaign_id == campaign.id && row.operation_key == operation)
    {
        if receipt.input_fingerprint == fingerprint {
            return Ok(outcome_now(campaign, clock, &receipt.id, operation));
        }
        return Err(conflict(
            "This proposal was already recorded with different input.",
        ));
    }
    cursor_matches(
        clock,
        campaign,
        request.expected_revision,
        &request.source_date,
        &request.source_boundary_key,
    )?;
    for id in [
        &request.negotiation_id,
        &request.receipt_id,
        &request.audit_id,
        &request.action_id,
    ] {
        if !fresh(tables, id) {
            return Err(invalid("Market row IDs must be unique and unused."));
        }
    }
    let player = tables
        .players
        .iter()
        .find(|row| row.campaign_id == campaign.id && row.id == request.player_id)
        .ok_or_else(|| invalid("Player was not found."))?;
    if player.club_id.as_ref() == Some(&campaign.managed_club_id) {
        return Err(invalid("Choose a player at another club."));
    }
    let seller = player.club_id.clone();
    let current_wage = tables
        .contracts
        .iter()
        .find(|row| {
            row.campaign_id == campaign.id
                && row.player_id == request.player_id
                && row.status == ContractStatus::Active
        })
        .and_then(|row| row.weekly_wage_cents)
        .map(|wage| wage.get())
        .unwrap_or(request.wage_cents.get());
    let current_tier = tables
        .contracts
        .iter()
        .find(|row| {
            row.campaign_id == campaign.id
                && row.player_id == request.player_id
                && row.status == ContractStatus::Active
        })
        .and_then(|row| row.squad_tier);
    let valuation = player
        .market_value_cents
        .map(|value| value.get())
        .filter(|value| *value > 0)
        .ok_or_else(|| invalid("Market value is missing."))?;
    let state = tables
        .club_simulation_states
        .iter()
        .find(|row| row.campaign_id == campaign.id && row.club_id == campaign.managed_club_id)
        .ok_or_else(|| invalid("Buyer balance is missing."))?;
    let reserved = tables
        .negotiations
        .iter()
        .filter(|row| {
            row.campaign_id == campaign.id
                && row.buyer_club_id == campaign.managed_club_id
                && open_status(row.status)
        })
        .fold((0, 0), |total, row| {
            (
                total.0 + row.reserved_cents.get(),
                total.1 + row.reserved_wage_cents.get(),
            )
        });
    let wages = wage_commitment(&tables.contracts, &campaign.id, &campaign.managed_club_id)
        .map_err(core)?;
    let agreement = resolve_terms(TermProposal {
        fee_cents: request.fee_cents.get(),
        wage_cents: request.wage_cents.get(),
        tier: request.squad_tier,
        valuation_cents: valuation,
        current_wage_cents: current_wage,
        current_tier,
        seller_is_managed: false,
        buyer_is_ai: false,
        spendable_cents: (state.transfer_balance_cents.get() - reserved.0).max(0),
        wage_room_cents: (state.wage_budget_weekly_cents.get() - wages.known_cents - reserved.1)
            .max(0),
    })
    .map_err(core)?;
    let (status, fee, wage, tier, counters, reserve) = match agreement {
        Agreement::Rejected => (
            NegotiationStatus::Rejected,
            request.fee_cents.get(),
            request.wage_cents.get(),
            request.squad_tier,
            0,
            false,
        ),
        Agreement::Countered {
            fee_cents,
            wage_cents,
            tier,
            counter_count,
        } => (
            NegotiationStatus::Countered,
            fee_cents,
            wage_cents,
            tier,
            counter_count,
            true,
        ),
        Agreement::Agreed {
            fee_cents,
            wage_cents,
            tier,
            counter_count,
        } => (
            NegotiationStatus::Agreed,
            fee_cents,
            wage_cents,
            tier,
            counter_count,
            true,
        ),
    };
    let spendable = state.transfer_balance_cents.get() - reserved.0;
    let room = state.wage_budget_weekly_cents.get() - wages.known_cents - reserved.1;
    let reserve = reserve && fee <= spendable && wage <= room;
    let status = if reserve {
        status
    } else {
        NegotiationStatus::Rejected
    };
    let (campaign_id, season_id, revision, date, phase) = {
        let (campaign, season, clock) = loaded(tables, &request.campaign_id)?;
        (
            campaign.id.clone(),
            season.id.clone(),
            next_revision(campaign.revision).map_err(invalid)?,
            clock.current_date.clone(),
            clock.phase,
        )
    };
    let boundary = tables
        .simulation_states
        .iter()
        .find(|row| row.campaign_id == campaign_id)
        .and_then(|row| row.last_boundary_key.clone());
    tables.negotiations.push(NegotiationRow {
        id: request.negotiation_id.clone(),
        campaign_id: campaign_id.clone(),
        season_id: season_id.clone(),
        player_id: request.player_id.clone(),
        buyer_club_id: tables
            .campaigns
            .iter()
            .find(|row| row.id == campaign_id)
            .unwrap()
            .managed_club_id
            .clone(),
        seller_club_id: seller,
        status,
        fee_cents: money(fee)?,
        reserved_cents: money(if reserve { fee } else { 0 })?,
        wage_cents: money(wage)?,
        reserved_wage_cents: money(if reserve { wage } else { 0 })?,
        squad_tier: tier,
        expires_on: tables
            .seasons
            .iter()
            .find(|row| row.id == season_id)
            .and_then(|row| row.end_date.clone())
            .unwrap_or_else(|| date.clone()),
        counter_count: number(counters)?,
        opened_on: date.clone(),
        deadline_on: deadline_on(&DateOnly::parse(&date).map_err(invalid)?)?,
        resolved_on: (!reserve || status == NegotiationStatus::Rejected).then(|| date.clone()),
        engine_version: VersionOne,
        event_seed: number(0)?,
        qualification: None,
    });
    if status == NegotiationStatus::Rejected {
        tables.negotiations.last_mut().unwrap().reserved_cents = zero();
        tables.negotiations.last_mut().unwrap().reserved_wage_cents = zero();
        tables.negotiations.last_mut().unwrap().resolved_on = Some(date.clone());
    }
    finish(
        tables,
        &campaign_id,
        &season_id,
        revision,
        &operation,
        &date,
        phase,
        boundary,
        request.expected_revision,
        fingerprint,
        number(0)?,
        &request.receipt_id,
        &request.audit_id,
        &request.action_id,
        &request.now,
        AuditAction::TransferPropose,
        "Recorded the transfer proposal.",
        vec![OutcomeRef::Negotiation {
            id: request.negotiation_id.clone(),
        }],
    )
}

fn commit_respond(
    tables: &mut SnapshotTables,
    request: &RespondNegotiationRequest,
    fingerprint: &str,
) -> Result<AdvanceOutcome, CommandError> {
    let (campaign, season, clock) = loaded(tables, &request.campaign_id)?;
    let negotiation = tables
        .negotiations
        .iter()
        .find(|row| row.campaign_id == campaign.id && row.id == request.negotiation_id)
        .ok_or_else(|| invalid("Negotiation was not found."))?;
    if negotiation.buyer_club_id != campaign.managed_club_id {
        return Err(invalid(
            "Only the managed club can answer this negotiation.",
        ));
    }
    let buyer_key = club_key(tables, &campaign.id, &negotiation.buyer_club_id)?.to_owned();
    let player_key = player_key(tables, &campaign.id, &negotiation.player_id)?.to_owned();
    let operation = match &request.decision {
        NegotiationDecision::Accept => format!(
            "season:{}:proposal-accept:{buyer_key}:player:{player_key}:opened:{}",
            season.id.as_str(),
            negotiation.opened_on
        ),
        NegotiationDecision::Withdraw => format!(
            "season:{}:proposal-withdraw:{buyer_key}:player:{player_key}:opened:{}",
            season.id.as_str(),
            negotiation.opened_on
        ),
        NegotiationDecision::Counter {
            fee_cents,
            wage_cents,
            squad_tier,
        } => format!(
            "season:{}:proposal:{buyer_key}:player:{player_key}:fee:{}:wage:{}:tier:{}:opened:{}",
            season.id.as_str(),
            fee_cents.get(),
            wage_cents.get(),
            tier_name(*squad_tier),
            negotiation.opened_on
        ),
    };
    if let Some(receipt) = tables
        .simulation_receipts
        .iter()
        .find(|row| row.campaign_id == campaign.id && row.operation_key == operation)
    {
        if receipt.input_fingerprint == fingerprint {
            return Ok(outcome_now(campaign, clock, &receipt.id, operation));
        }
        return Err(conflict(
            "This response was already recorded with different input.",
        ));
    }
    cursor_matches(
        clock,
        campaign,
        request.expected_revision,
        &request.source_date,
        &request.source_boundary_key,
    )?;
    let qualifying = tables.offers.iter().any(|offer| {
        offer.campaign_id == campaign.id
            && offer.negotiation_id.as_ref() == Some(&request.negotiation_id)
            && constitution(tables, &campaign.id)
                .ok()
                .is_some_and(|constitution| {
                    offer_still_qualifies(offer, constitution).unwrap_or(false)
                })
    });
    if qualifying && matches!(request.decision, NegotiationDecision::Withdraw) {
        return Err(invalid(
            "This bid qualifies and cannot be rejected while the rule is on.",
        ));
    }
    for id in [&request.receipt_id, &request.audit_id, &request.action_id] {
        if !fresh(tables, id) {
            return Err(invalid("Market row IDs must be unique and unused."));
        }
    }
    let date = clock.current_date.clone();
    let phase = clock.phase;
    let boundary = clock.last_boundary_key.clone();
    let campaign_id = campaign.id.clone();
    let season_id = season.id.clone();
    let revision = next_revision(campaign.revision).map_err(invalid)?;
    let negotiation = tables
        .negotiations
        .iter_mut()
        .find(|row| row.campaign_id == campaign_id && row.id == request.negotiation_id)
        .unwrap();
    if !open_status(negotiation.status) {
        return Err(invalid("This negotiation is already closed."));
    }
    match &request.decision {
        NegotiationDecision::Accept => {
            if negotiation.status != NegotiationStatus::Countered
                && negotiation.status != NegotiationStatus::Agreed
            {
                return Err(invalid("There is no counter to accept."));
            }
            negotiation.status = NegotiationStatus::Agreed;
        }
        NegotiationDecision::Withdraw => {
            negotiation.status = NegotiationStatus::Withdrawn;
            negotiation.reserved_cents = zero();
            negotiation.reserved_wage_cents = zero();
            negotiation.resolved_on = Some(date.clone());
        }
        NegotiationDecision::Counter {
            fee_cents,
            wage_cents,
            squad_tier,
        } => {
            if negotiation.counter_count.get() >= 2 {
                return Err(invalid("This negotiation has no counter remaining."));
            }
            negotiation.fee_cents = *fee_cents;
            negotiation.wage_cents = *wage_cents;
            negotiation.squad_tier = *squad_tier;
            negotiation.reserved_cents = *fee_cents;
            negotiation.reserved_wage_cents = *wage_cents;
            negotiation.counter_count = number(negotiation.counter_count.get() + 1)?;
            negotiation.status = NegotiationStatus::Countered;
        }
    }
    finish(
        tables,
        &campaign_id,
        &season_id,
        revision,
        &operation,
        &date,
        phase,
        boundary,
        request.expected_revision,
        fingerprint,
        number(0)?,
        &request.receipt_id,
        &request.audit_id,
        &request.action_id,
        &request.now,
        AuditAction::TransferPropose,
        "Updated the transfer negotiation.",
        vec![OutcomeRef::Negotiation {
            id: request.negotiation_id.clone(),
        }],
    )
}

fn commit_reject(
    tables: &mut SnapshotTables,
    request: &RespondOfferRequest,
    fingerprint: &str,
) -> Result<AdvanceOutcome, CommandError> {
    if request.decision != OfferDecision::Reject {
        return Err(invalid("Accept the offer through settlement."));
    }
    let (campaign, season, clock) = loaded(tables, &request.campaign_id)?;
    let offer = tables
        .offers
        .iter()
        .find(|row| row.campaign_id == campaign.id && row.id == request.offer_id)
        .ok_or_else(|| invalid("Offer was not found."))?
        .clone();
    let buyer_key = club_key(tables, &campaign.id, &offer.bidder_club_id)?.to_owned();
    let player_key_value = player_key(tables, &campaign.id, &offer.player_id)?.to_owned();
    let operation = format!(
        "season:{}:offer-reject:{buyer_key}:player:{player_key_value}:opened:{}",
        season.id.as_str(),
        offer.received_on
    );
    if let Some(receipt) = tables
        .simulation_receipts
        .iter()
        .find(|row| row.campaign_id == campaign.id && row.operation_key == operation)
    {
        if receipt.input_fingerprint == fingerprint {
            return Ok(outcome_now(campaign, clock, &receipt.id, operation));
        }
        return Err(conflict(
            "This response was already recorded with different input.",
        ));
    }
    if offer.status != OfferStatus::Open
        || offer.seller_club_id.as_ref() != Some(&campaign.managed_club_id)
    {
        return Err(invalid("This offer cannot be rejected."));
    }
    let constitution = constitution(tables, &campaign.id)?;
    let date = DateOnly::parse(&clock.current_date).map_err(invalid)?;
    let report = evaluate_action(
        &PolicyAction::RejectOffer {
            fee_cents: offer.fee_cents,
            market_value_cents: offer.market_value_cents,
            bidder_prestige: offer.bidder_prestige,
            seller_prestige: offer.seller_prestige,
        },
        &PolicySnapshot {
            revision: campaign.revision,
            remaining_capacity_cents: None,
        },
        constitution,
        &date,
    )
    .map_err(core)?;
    if !report.allowed {
        return Err(invalid(
            report
                .verdicts
                .iter()
                .find(|verdict| verdict.severity == crate::policy::Severity::Block)
                .map(|verdict| verdict.message.clone())
                .unwrap_or_else(|| {
                    "This bid qualifies and cannot be rejected while the rule is on.".into()
                }),
        ));
    }
    cursor_matches(
        clock,
        campaign,
        request.expected_revision,
        &request.source_date,
        &request.source_boundary_key,
    )?;
    for id in [&request.receipt_id, &request.audit_id, &request.action_id] {
        if !fresh(tables, id) {
            return Err(invalid("Market row IDs must be unique and unused."));
        }
    }
    let revision = next_revision(campaign.revision).map_err(invalid)?;
    let campaign_id = campaign.id.clone();
    let season_id = season.id.clone();
    let current = clock.current_date.clone();
    let phase = clock.phase;
    let boundary = clock.last_boundary_key.clone();
    if let Some(negotiation_id) = &offer.negotiation_id {
        if let Some(negotiation) = tables
            .negotiations
            .iter_mut()
            .find(|row| row.campaign_id == campaign_id && &row.id == negotiation_id)
        {
            negotiation.status = NegotiationStatus::Rejected;
            negotiation.reserved_cents = zero();
            negotiation.reserved_wage_cents = zero();
            negotiation.resolved_on = Some(current.clone());
        }
    }
    if let Some(row) = tables
        .offers
        .iter_mut()
        .find(|row| row.campaign_id == campaign_id && row.id == request.offer_id)
    {
        row.status = OfferStatus::Rejected;
        row.resolved_on = Some(current.clone());
    }
    finish(
        tables,
        &campaign_id,
        &season_id,
        revision,
        &operation,
        &current,
        phase,
        boundary,
        request.expected_revision,
        fingerprint,
        number(0)?,
        &request.receipt_id,
        &request.audit_id,
        &request.action_id,
        &request.now,
        AuditAction::OfferRespond,
        "Rejected the offer.",
        vec![OutcomeRef::Offer {
            id: request.offer_id.clone(),
        }],
    )
}

pub fn accept_settlement_request(
    tables: &SnapshotTables,
    request: &RespondOfferRequest,
) -> Result<settlement::SettleTransferRequest, CommandError> {
    let (campaign, _, _) = loaded(tables, &request.campaign_id)?;
    let offer = tables
        .offers
        .iter()
        .find(|row| row.campaign_id == campaign.id && row.id == request.offer_id)
        .ok_or_else(|| invalid("Offer was not found."))?;
    let repeated = offer.status == OfferStatus::Accepted;
    if !repeated && (offer.status != OfferStatus::Open || offer.origin.is_none()) {
        return Err(invalid("A legacy offer cannot be settled."));
    }
    let negotiation_id = offer
        .negotiation_id
        .clone()
        .ok_or_else(|| invalid("Negotiation was not found."))?;
    Ok(settlement::SettleTransferRequest {
        campaign_id: request.campaign_id.clone(),
        expected_revision: request.expected_revision,
        negotiation_id,
        source_date: request.source_date.clone(),
        source_boundary_key: request.source_boundary_key.clone(),
        transfer_id: request.transfer_id.clone(),
        contract_id: request.contract_id.clone(),
        ledger_ids: request.ledger_ids.clone(),
        registration_id: request.registration_id.clone(),
        receipt_id: request.receipt_id.clone(),
        audit_id: request.audit_id.clone(),
        action_id: request.action_id.clone(),
        now: request.now.clone(),
    })
}

fn movement_shape(
    tables: &SnapshotTables,
    campaign_id: &EntityId,
    negotiation: &NegotiationRow,
) -> Result<(i64, bool), CommandError> {
    let plan = settlement::settlement_plan(
        tables,
        &settlement::SettleTransferRequest {
            campaign_id: campaign_id.clone(),
            expected_revision: number(0)?,
            negotiation_id: negotiation.id.clone(),
            source_date: "2026-07-01".into(),
            source_boundary_key: None,
            transfer_id: negotiation.id.clone(),
            contract_id: negotiation.id.clone(),
            ledger_ids: Vec::new(),
            registration_id: None,
            receipt_id: negotiation.id.clone(),
            audit_id: negotiation.id.clone(),
            action_id: negotiation.id.clone(),
            now: "2026-01-01T00:00:00.000Z".into(),
        },
    )?;
    Ok((
        if plan.needs_ledger { 2 } else { 0 },
        plan.registration
            .as_ref()
            .is_some_and(|row| row.existing_id.is_none()),
    ))
}

pub fn transfer_board(
    tables: &SnapshotTables,
    campaign_id: &EntityId,
) -> Result<TransferBoard, CommandError> {
    let (campaign, season, _) = loaded(tables, campaign_id)?;
    let constitution = constitution(tables, &campaign.id)?;
    let mut incoming = Vec::new();
    for offer in tables.offers.iter().filter(|row| {
        row.campaign_id == campaign.id
            && row.season_id == season.id
            && row.status == OfferStatus::Open
            && row.seller_club_id.as_ref() == Some(&campaign.managed_club_id)
    }) {
        let Some(negotiation_id) = &offer.negotiation_id else {
            continue;
        };
        let Some(negotiation) = tables
            .negotiations
            .iter()
            .find(|row| &row.id == negotiation_id)
        else {
            continue;
        };
        let qualifies = offer_still_qualifies(offer, constitution)?;
        incoming.push(IncomingOfferView {
            offer_id: offer.id.clone(),
            negotiation_id: negotiation_id.clone(),
            player_name: name_of(tables, &campaign.id, &offer.player_id, false),
            bidder_name: name_of(tables, &campaign.id, &offer.bidder_club_id, true),
            fee_cents: offer.fee_cents,
            wage_cents: negotiation.wage_cents,
            squad_tier: negotiation.squad_tier,
            term: negotiation.expires_on.clone(),
            deadline: offer
                .deadline_on
                .clone()
                .unwrap_or_else(|| negotiation.deadline_on.clone()),
            compulsory: if qualifies { "Compulsory" } else { "Ordinary" }.into(),
            reject_allowed: !qualifies,
            ledger_count: number(i64::from(offer.fee_cents.get() > 0) * 2)?,
            needs_registration: false,
        });
    }
    let mut outgoing = Vec::new();
    for negotiation in tables.negotiations.iter().filter(|row| {
        row.campaign_id == campaign.id
            && row.season_id == season.id
            && row.buyer_club_id == campaign.managed_club_id
            && open_status(row.status)
    }) {
        let seller = negotiation
            .seller_club_id
            .as_ref()
            .map(|id| name_of(tables, &campaign.id, id, true))
            .unwrap_or_else(|| "Free agent".into());
        let qualifying = tables.offers.iter().any(|offer| {
            offer.negotiation_id.as_ref() == Some(&negotiation.id)
                && offer_still_qualifies(offer, constitution).unwrap_or(false)
        });
        let shape = movement_shape(tables, &campaign.id, negotiation);
        outgoing.push(OutgoingNegotiationView {
            negotiation_id: negotiation.id.clone(),
            player_name: name_of(tables, &campaign.id, &negotiation.player_id, false),
            seller_name: seller,
            fee_cents: negotiation.fee_cents,
            wage_cents: negotiation.wage_cents,
            squad_tier: negotiation.squad_tier,
            status: negotiation.status,
            deadline: negotiation.deadline_on.clone(),
            can_withdraw: !qualifying,
            can_settle: negotiation.status == NegotiationStatus::Agreed && shape.is_ok(),
            ledger_count: number(shape.as_ref().map(|row| row.0).unwrap_or(0))?,
            needs_registration: shape.map(|row| row.1).unwrap_or(false),
        });
    }
    let mut completed = Vec::new();
    for transfer in tables.transfers.iter().filter(|row| {
        row.campaign_id == campaign.id
            && row.season_id == season.id
            && (row.from_club_id.as_ref() == Some(&campaign.managed_club_id)
                || row.to_club_id.as_ref() == Some(&campaign.managed_club_id))
    }) {
        let other = if transfer.from_club_id.as_ref() == Some(&campaign.managed_club_id) {
            transfer.to_club_id.clone()
        } else {
            transfer.from_club_id.clone()
        };
        completed.push(CompletedTransferView {
            transfer_id: transfer.id.clone(),
            player_name: name_of(tables, &campaign.id, &transfer.player_id, false),
            other_club: other
                .as_ref()
                .map(|id| name_of(tables, &campaign.id, id, true))
                .unwrap_or_else(|| "Free agent".into()),
            fee_cents: transfer.fee_cents,
            kind: transfer.kind,
            effective_on: transfer.effective_on.clone(),
        });
    }
    Ok(TransferBoard {
        incoming,
        outgoing,
        completed,
    })
}
