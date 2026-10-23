//! Persist one agreed transfer. No market tick and no clock movement.
use crate::{
    dates::{display_age, validate_timestamp, AgeDisplay, DateOnly},
    finance::{transfer_capacity, wage_commitment},
    guards::next_revision,
    market::MARKET_ENGINE_VERSION,
    policy::{
        evaluate_action, PolicyAction, PolicySnapshot, RegistrationPlayer, RuleReport, Severity,
    },
    progression::AdvanceOutcome,
    *,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeSet;
use ts_rs::TS;

const LEAGUE: &str = "league";

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
fn add(left: i64, right: i64) -> Result<i64, CommandError> {
    left.checked_add(right)
        .ok_or_else(|| invalid("Arithmetic is outside the safe integer range."))
}
fn sub(left: i64, right: i64) -> Result<i64, CommandError> {
    left.checked_sub(right)
        .ok_or_else(|| invalid("Arithmetic is outside the safe integer range."))
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SettleTransferRequest {
    pub campaign_id: EntityId,
    pub expected_revision: SafeInt,
    pub negotiation_id: EntityId,
    pub source_date: String,
    #[serde(deserialize_with = "crate::nulls::nullable")]
    pub source_boundary_key: Option<String>,
    pub transfer_id: EntityId,
    pub contract_id: EntityId,
    pub ledger_ids: Vec<EntityId>,
    #[serde(deserialize_with = "crate::nulls::nullable")]
    pub registration_id: Option<EntityId>,
    pub receipt_id: EntityId,
    pub audit_id: EntityId,
    pub action_id: EntityId,
    pub now: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegistrationWrite {
    pub existing_id: Option<EntityId>,
    pub homegrown_club: Option<bool>,
    pub homegrown_nation: Option<bool>,
    pub age_exempt: Option<bool>,
}

/// Row changes for one agreed negotiation. Client IDs are applied later.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SettlementPlan {
    pub negotiation_id: EntityId,
    pub player_id: EntityId,
    pub buyer_club_id: EntityId,
    pub seller_club_id: Option<EntityId>,
    pub fee_cents: i64,
    pub wage_cents: i64,
    pub squad_tier: SquadTier,
    pub kind: TransferKind,
    pub starts_on: String,
    pub expires_on: String,
    pub end_contract_id: Option<EntityId>,
    pub lineup_ids: Vec<EntityId>,
    pub ineligible_registration_ids: Vec<EntityId>,
    pub supersede_negotiation_ids: Vec<EntityId>,
    pub supersede_offer_ids: Vec<EntityId>,
    pub accept_offer_ids: Vec<EntityId>,
    pub needs_ledger: bool,
    pub registration: Option<RegistrationWrite>,
    pub event_seed: SafeInt,
}

pub struct PreparedSettlement {
    pub fingerprint_material: String,
}

fn validate_request(request: &SettleTransferRequest) -> Result<(), CommandError> {
    DateOnly::parse(&request.source_date).map_err(invalid)?;
    validate_timestamp(&request.now).map_err(invalid)?;
    if request.expected_revision.get() < 0 {
        return Err(invalid("Expected revision must be non-negative."));
    }
    Ok(())
}

fn loaded<'a>(
    tables: &'a SnapshotTables,
    id: &EntityId,
) -> Result<(&'a CampaignRow, &'a SeasonRow, &'a SimulationStateRow), CommandError> {
    let campaign = tables
        .campaigns
        .iter()
        .find(|c| &c.id == id)
        .ok_or_else(|| invalid("Campaign not found."))?;
    if campaign.mode != CampaignMode::Standalone {
        return Err(invalid("Only standalone careers can settle transfers."));
    }
    let season = tables
        .seasons
        .iter()
        .find(|s| s.id == campaign.active_season_id && s.campaign_id == campaign.id)
        .ok_or_else(|| invalid("Active season not found."))?;
    let clock = tables
        .simulation_states
        .iter()
        .find(|s| s.campaign_id == campaign.id && s.active_season_id == season.id)
        .ok_or_else(|| invalid("Saved game clock is missing."))?;
    Ok((campaign, season, clock))
}

fn negotiation<'a>(
    tables: &'a SnapshotTables,
    request: &SettleTransferRequest,
) -> Result<&'a NegotiationRow, CommandError> {
    tables
        .negotiations
        .iter()
        .find(|row| row.campaign_id == request.campaign_id && row.id == request.negotiation_id)
        .ok_or_else(|| {
            if tables.offers.iter().any(|offer| {
                offer.campaign_id == request.campaign_id
                    && offer.id == request.negotiation_id
                    && offer.negotiation_id.is_none()
            }) {
                invalid("A legacy offer cannot be settled.")
            } else {
                invalid("Negotiation was not found.")
            }
        })
}

fn club_key<'a>(
    tables: &'a SnapshotTables,
    campaign: &EntityId,
    club: &EntityId,
) -> Result<&'a str, CommandError> {
    tables
        .club_simulation_states
        .iter()
        .find(|state| &state.campaign_id == campaign && &state.club_id == club)
        .map(|state| state.simulation_key.as_str())
        .ok_or_else(|| invalid("Club simulation key is missing."))
}

fn player_key<'a>(
    tables: &'a SnapshotTables,
    campaign: &EntityId,
    player: &EntityId,
) -> Result<&'a str, CommandError> {
    tables
        .player_simulation_states
        .iter()
        .find(|state| &state.campaign_id == campaign && &state.player_id == player)
        .map(|state| state.simulation_key.as_str())
        .ok_or_else(|| invalid("Player simulation key is missing."))
}

fn open_negotiation(status: NegotiationStatus) -> bool {
    matches!(
        status,
        NegotiationStatus::Proposed | NegotiationStatus::Countered | NegotiationStatus::Agreed
    )
}

fn operation_key(season: &SeasonRow, buyer_key: &str, player_key: &str, opened: &str) -> String {
    format!(
        "season:{}:transfer:{buyer_key}:player:{player_key}:opened:{opened}",
        season.id.as_str()
    )
}

fn fingerprint(
    request: &SettleTransferRequest,
    clock: &SimulationStateRow,
    buyer_key: &str,
    player_key: &str,
    negotiation: &NegotiationRow,
) -> Result<String, CommandError> {
    serde_json::to_string(&(
        "transfer",
        &request.campaign_id,
        request.expected_revision,
        &request.source_date,
        &request.source_boundary_key,
        MARKET_ENGINE_VERSION,
        &clock.root_seed,
        buyer_key,
        player_key,
        &negotiation.opened_on,
        negotiation.fee_cents,
        negotiation.wage_cents,
        negotiation.squad_tier,
    ))
    .map_err(invalid)
}

fn identity(
    tables: &SnapshotTables,
    request: &SettleTransferRequest,
) -> Result<(String, String), CommandError> {
    let (campaign, season, clock) = loaded(tables, &request.campaign_id)?;
    let negotiation = negotiation(tables, request)?;
    if negotiation.season_id != season.id {
        return Err(invalid("The negotiation is not in the active season."));
    }
    let buyer_key = club_key(tables, &campaign.id, &negotiation.buyer_club_id)?;
    let player_key = player_key(tables, &campaign.id, &negotiation.player_id)?;
    let operation = operation_key(season, buyer_key, player_key, &negotiation.opened_on);
    let material = fingerprint(request, clock, buyer_key, player_key, negotiation)?;
    Ok((operation, material))
}

fn receipt<'a>(
    tables: &'a SnapshotTables,
    campaign: &EntityId,
    operation: &str,
) -> Option<&'a SimulationReceiptRow> {
    tables
        .simulation_receipts
        .iter()
        .find(|row| &row.campaign_id == campaign && row.operation_key == operation)
}

fn cursor(
    campaign: &CampaignRow,
    clock: &SimulationStateRow,
    request: &SettleTransferRequest,
) -> Result<(), CommandError> {
    if campaign.revision != request.expected_revision {
        return Err(conflict("Campaign revision is stale."));
    }
    if request.source_date != clock.current_date
        || request.source_boundary_key != clock.last_boundary_key
    {
        return Err(conflict(
            "Source date or cursor does not match the saved date.",
        ));
    }
    Ok(())
}

fn constitution<'a>(
    tables: &'a SnapshotTables,
    campaign: &EntityId,
) -> Option<&'a ConstitutionRow> {
    tables
        .constitutions
        .iter()
        .filter(|row| &row.campaign_id == campaign)
        .max_by_key(|row| row.version.get())
}

fn years(player: &PlayerRow, season: &SeasonRow) -> Result<Option<SafeInt>, CommandError> {
    match display_age(player, season) {
        AgeDisplay::Exact { years } | AgeDisplay::Estimated { years } => {
            Ok(Some(SafeInt::new(years).map_err(core)?))
        }
        AgeDisplay::Unknown => Ok(None),
    }
}

fn player_row<'a>(
    tables: &'a SnapshotTables,
    campaign: &EntityId,
    player: &EntityId,
) -> Result<&'a PlayerRow, CommandError> {
    tables
        .players
        .iter()
        .find(|row| &row.campaign_id == campaign && &row.id == player)
        .ok_or_else(|| invalid("Player was not found."))
}

fn remedy(report: &RuleReport) -> Option<String> {
    if report.allowed {
        return None;
    }
    Some(
        report
            .verdicts
            .iter()
            .find(|verdict| verdict.severity == Severity::Block)
            .map(|verdict| verdict.remedy.clone())
            .unwrap_or_else(|| "The constitution blocks this transfer.".into()),
    )
}

fn scope(message: String) -> CommandError {
    CommandError::Scope { message }
}

fn buyer_registration(
    tables: &SnapshotTables,
    campaign: &CampaignRow,
    season: &SeasonRow,
    negotiation: &NegotiationRow,
    player: &PlayerRow,
    game_date: &str,
) -> Result<Option<RegistrationWrite>, CommandError> {
    if negotiation.buyer_club_id != campaign.managed_club_id {
        return Ok(None);
    }
    let Some(constitution) = constitution(tables, &campaign.id) else {
        return Ok(None);
    };
    let age = years(player, season)?;
    let date = DateOnly::parse(game_date).map_err(invalid)?;
    let (sales, prizes) = constitution
        .rules
        .iter()
        .find_map(|rule| match rule {
            ConstitutionRule::SellToBuy {
                sales_reinvestment_pct,
                prize_reinvestment_pct,
                ..
            } => Some((sales_reinvestment_pct.get(), prize_reinvestment_pct.get())),
            _ => None,
        })
        .unwrap_or((0, 0));
    let capacity = transfer_capacity(
        &tables.ledger_entries,
        &campaign.id,
        &season.id,
        &negotiation.buyer_club_id,
        sales,
        prizes,
    )
    .map_err(core)?;
    let snapshot = PolicySnapshot {
        revision: campaign.revision,
        remaining_capacity_cents: Some(SafeInt::new(capacity.remaining_cents).map_err(core)?),
    };
    let incoming = evaluate_action(
        &PolicyAction::IncomingTransfer {
            fee_cents: negotiation.fee_cents,
            age,
            is_free: negotiation.fee_cents.get() == 0,
            weekly_wage_cents: Some(negotiation.wage_cents),
            squad_tier: Some(negotiation.squad_tier),
        },
        &snapshot,
        constitution,
        &date,
    )
    .map_err(core)?;
    if let Some(message) = remedy(&incoming) {
        return Err(scope(message));
    }
    let sim = tables
        .player_simulation_states
        .iter()
        .find(|state| state.campaign_id == campaign.id && state.player_id == player.id)
        .ok_or_else(|| invalid("Player simulation state is missing."))?;
    let mut players = Vec::new();
    for registration in tables.registrations.iter().filter(|row| {
        row.campaign_id == campaign.id
            && row.season_id == season.id
            && row.competition_key == LEAGUE
            && row.player_id != player.id
    }) {
        let squad = player_row(tables, &campaign.id, &registration.player_id)?;
        if squad.club_id.as_ref() != Some(&negotiation.buyer_club_id) {
            continue;
        }
        players.push(RegistrationPlayer {
            player_id: registration.player_id.clone(),
            status: registration.status,
            homegrown_club: registration.homegrown_club,
            homegrown_nation: registration.homegrown_nation,
            age_exempt: registration.age_exempt,
            age: years(squad, season)?,
        });
    }
    players.push(RegistrationPlayer {
        player_id: player.id.clone(),
        status: RegistrationStatus::Registered,
        homegrown_club: Some(sim.homegrown_club),
        homegrown_nation: Some(sim.homegrown_nation),
        age_exempt: None,
        age,
    });
    let registration = evaluate_action(
        &PolicyAction::Registration {
            competition_key: LEAGUE.into(),
            players,
        },
        &snapshot,
        constitution,
        &date,
    )
    .map_err(core)?;
    if let Some(message) = remedy(&registration) {
        return Err(scope(message));
    }
    let under = constitution.rules.iter().find_map(|rule| match rule {
        ConstitutionRule::RegistrationQuota {
            age_exemption_under,
            ..
        } => *age_exemption_under,
        _ => None,
    });
    let existing = tables.registrations.iter().find(|row| {
        row.campaign_id == campaign.id
            && row.season_id == season.id
            && row.player_id == player.id
            && row.competition_key == LEAGUE
    });
    Ok(Some(RegistrationWrite {
        existing_id: existing.map(|row| row.id.clone()),
        homegrown_club: Some(sim.homegrown_club),
        homegrown_nation: Some(sim.homegrown_nation),
        age_exempt: age.and_then(|age| under.map(|under| age.get() < under.get())),
    }))
}

fn end_contract(
    tables: &SnapshotTables,
    campaign: &EntityId,
    negotiation: &NegotiationRow,
) -> Result<Option<EntityId>, CommandError> {
    let active = tables
        .contracts
        .iter()
        .filter(|contract| {
            &contract.campaign_id == campaign
                && contract.player_id == negotiation.player_id
                && contract.status == ContractStatus::Active
        })
        .collect::<Vec<_>>();
    match &negotiation.seller_club_id {
        Some(seller) => {
            if active.len() != 1 || active[0].club_id != *seller {
                return Err(invalid("The seller contract is missing."));
            }
            Ok(Some(active[0].id.clone()))
        }
        None => {
            if !active.is_empty() || negotiation.fee_cents.get() != 0 {
                return Err(invalid("A free agent transfer has no fee and no club."));
            }
            Ok(None)
        }
    }
}

fn afford(
    tables: &SnapshotTables,
    campaign: &EntityId,
    negotiation: &NegotiationRow,
) -> Result<(), CommandError> {
    let fee = negotiation.fee_cents.get();
    let buyer = tables
        .club_simulation_states
        .iter()
        .find(|state| &state.campaign_id == campaign && state.club_id == negotiation.buyer_club_id)
        .ok_or_else(|| invalid("Buyer balance is missing."))?;
    let other_fees = tables
        .negotiations
        .iter()
        .filter(|row| {
            &row.campaign_id == campaign
                && row.buyer_club_id == negotiation.buyer_club_id
                && row.id != negotiation.id
                && open_negotiation(row.status)
                && row.player_id != negotiation.player_id
        })
        .try_fold(0i64, |total, row| add(total, row.reserved_cents.get()))?;
    if fee > 0 {
        let remaining = sub(buyer.transfer_balance_cents.get(), fee)?;
        if remaining < other_fees {
            return Err(invalid("The transfer balance cannot cover this fee."));
        }
        let seller_id = negotiation
            .seller_club_id
            .as_ref()
            .ok_or_else(|| invalid("A fee requires a selling club."))?;
        let seller = tables
            .club_simulation_states
            .iter()
            .find(|state| &state.campaign_id == campaign && &state.club_id == seller_id)
            .ok_or_else(|| invalid("Seller balance is missing."))?;
        money(add(seller.transfer_balance_cents.get(), fee)?)?;
    }
    let wages = wage_commitment(
        tables.contracts.as_slice(),
        campaign,
        &negotiation.buyer_club_id,
    )
    .map_err(core)?;
    if wages.unknown_count > 0 {
        return Err(invalid("Weekly wage is unknown."));
    }
    let other_wages = tables
        .negotiations
        .iter()
        .filter(|row| {
            &row.campaign_id == campaign
                && row.buyer_club_id == negotiation.buyer_club_id
                && row.id != negotiation.id
                && open_negotiation(row.status)
                && row.player_id != negotiation.player_id
        })
        .try_fold(0i64, |total, row| add(total, row.reserved_wage_cents.get()))?;
    let committed = add(
        add(wages.known_cents, other_wages)?,
        negotiation.wage_cents.get(),
    )?;
    if committed > buyer.wage_budget_weekly_cents.get() {
        return Err(invalid("The wage budget cannot cover this contract."));
    }
    Ok(())
}

/// Pure row plan for one agreed negotiation. Does not draw randomness or move the clock.
pub fn settlement_plan(
    tables: &SnapshotTables,
    request: &SettleTransferRequest,
) -> Result<SettlementPlan, CommandError> {
    validate_request(request)?;
    let (campaign, season, clock) = loaded(tables, &request.campaign_id)?;
    if campaign.status == CampaignStatus::Archived {
        return Err(invalid("Restore this archived campaign before editing."));
    }
    let negotiation = negotiation(tables, request)?;
    if negotiation.season_id != season.id {
        return Err(invalid("The negotiation is not in the active season."));
    }
    if negotiation.status != NegotiationStatus::Agreed {
        return Err(invalid("Only an agreed negotiation can be settled."));
    }
    if negotiation.reserved_cents != negotiation.fee_cents {
        return Err(invalid("The reservation does not match the agreed fee."));
    }
    let player = player_row(tables, &campaign.id, &negotiation.player_id)?;
    if negotiation.seller_club_id.as_ref() == Some(&negotiation.buyer_club_id)
        || player.club_id.as_ref() == Some(&negotiation.buyer_club_id)
    {
        return Err(invalid("A club cannot buy its own player."));
    }
    match &negotiation.seller_club_id {
        Some(seller) if player.club_id.as_ref() != Some(seller) => {
            return Err(invalid("The player does not belong to the selling club."));
        }
        None if player.club_id.is_some() => {
            return Err(invalid("A free agent transfer has no fee and no club."));
        }
        _ => {}
    }
    if !tables
        .clubs
        .iter()
        .any(|club| club.campaign_id == campaign.id && club.id == negotiation.buyer_club_id)
    {
        return Err(invalid("Buyer club was not found."));
    }
    let end_contract_id = end_contract(tables, &campaign.id, negotiation)?;
    afford(tables, &campaign.id, negotiation)?;
    let fee = negotiation.fee_cents.get();
    let seller_managed = negotiation.seller_club_id.as_ref() == Some(&campaign.managed_club_id);
    let lineup_ids = if seller_managed {
        tables
            .lineups
            .iter()
            .filter(|lineup| {
                lineup.campaign_id == campaign.id
                    && lineup.season_id == season.id
                    && (lineup
                        .starters
                        .iter()
                        .any(|starter| starter.player_id == negotiation.player_id)
                        || lineup
                            .bench_player_ids
                            .iter()
                            .any(|id| id == &negotiation.player_id))
            })
            .map(|lineup| lineup.id.clone())
            .collect()
    } else {
        Vec::new()
    };
    let ineligible_registration_ids = if seller_managed {
        tables
            .registrations
            .iter()
            .filter(|row| {
                row.campaign_id == campaign.id
                    && row.season_id == season.id
                    && row.player_id == negotiation.player_id
                    && row.competition_key == LEAGUE
            })
            .map(|row| row.id.clone())
            .collect()
    } else {
        Vec::new()
    };
    let registration = buyer_registration(
        tables,
        campaign,
        season,
        negotiation,
        player,
        &clock.current_date,
    )?;
    let supersede_negotiation_ids = tables
        .negotiations
        .iter()
        .filter(|row| {
            row.campaign_id == campaign.id
                && row.player_id == negotiation.player_id
                && row.id != negotiation.id
                && open_negotiation(row.status)
        })
        .map(|row| row.id.clone())
        .collect();
    let supersede_offer_ids = tables
        .offers
        .iter()
        .filter(|offer| {
            offer.campaign_id == campaign.id
                && offer.player_id == negotiation.player_id
                && offer.status == OfferStatus::Open
                && offer.negotiation_id.as_ref() != Some(&negotiation.id)
        })
        .map(|offer| offer.id.clone())
        .collect();
    let accept_offer_ids = tables
        .offers
        .iter()
        .filter(|offer| {
            offer.campaign_id == campaign.id
                && offer.status == OfferStatus::Open
                && offer.negotiation_id.as_ref() == Some(&negotiation.id)
        })
        .map(|offer| offer.id.clone())
        .collect();
    let expires_on = season
        .end_date
        .clone()
        .ok_or_else(|| invalid("Season end is missing."))?;
    Ok(SettlementPlan {
        negotiation_id: negotiation.id.clone(),
        player_id: negotiation.player_id.clone(),
        buyer_club_id: negotiation.buyer_club_id.clone(),
        seller_club_id: negotiation.seller_club_id.clone(),
        fee_cents: fee,
        wage_cents: negotiation.wage_cents.get(),
        squad_tier: negotiation.squad_tier,
        kind: if fee > 0 {
            TransferKind::Sale
        } else {
            TransferKind::Free
        },
        starts_on: clock.current_date.clone(),
        expires_on,
        end_contract_id,
        lineup_ids,
        ineligible_registration_ids,
        supersede_negotiation_ids,
        supersede_offer_ids,
        accept_offer_ids,
        needs_ledger: fee > 0,
        registration,
        event_seed: negotiation.event_seed,
    })
}

fn needs_registration_id(plan: &SettlementPlan) -> bool {
    plan.registration
        .as_ref()
        .is_some_and(|registration| registration.existing_id.is_none())
}

fn fresh_id(tables: &SnapshotTables, id: &EntityId) -> bool {
    !tables.transfers.iter().any(|row| &row.id == id)
        && !tables.contracts.iter().any(|row| &row.id == id)
        && !tables.ledger_entries.iter().any(|row| &row.id == id)
        && !tables.registrations.iter().any(|row| &row.id == id)
        && !tables.negotiations.iter().any(|row| &row.id == id)
        && !tables.offers.iter().any(|row| &row.id == id)
        && !tables
            .audit_events
            .iter()
            .any(|row| &row.id == id || &row.action_id == id)
        && !tables.simulation_receipts.iter().any(|row| &row.id == id)
}

fn assign_ids(
    tables: &SnapshotTables,
    request: &SettleTransferRequest,
    plan: &SettlementPlan,
) -> Result<(), CommandError> {
    let ledger_count = if plan.needs_ledger { 2 } else { 0 };
    if request.ledger_ids.len() != ledger_count
        || request.registration_id.is_some() != needs_registration_id(plan)
    {
        return Err(invalid(
            "Settlement ID vectors must exactly cover the plan.",
        ));
    }
    let mut seen = BTreeSet::new();
    let mut claim = |id: &EntityId| seen.insert(id.as_str().to_owned());
    if !claim(&request.transfer_id)
        || !claim(&request.contract_id)
        || !claim(&request.receipt_id)
        || !claim(&request.audit_id)
        || !claim(&request.action_id)
        || request.ledger_ids.iter().any(|id| !claim(id))
        || request
            .registration_id
            .as_ref()
            .is_some_and(|id| !claim(id))
    {
        return Err(invalid("Settlement row IDs must be unique."));
    }
    if !fresh_id(tables, &request.transfer_id)
        || !fresh_id(tables, &request.contract_id)
        || !fresh_id(tables, &request.receipt_id)
        || !fresh_id(tables, &request.audit_id)
        || !fresh_id(tables, &request.action_id)
        || request.ledger_ids.iter().any(|id| !fresh_id(tables, id))
        || request
            .registration_id
            .as_ref()
            .is_some_and(|id| !fresh_id(tables, id))
    {
        return Err(invalid("Settlement row IDs must be unused."));
    }
    Ok(())
}

fn zero() -> Result<MoneyCents, CommandError> {
    money(0)
}

pub struct MovementIds {
    pub transfer_id: EntityId,
    pub contract_id: EntityId,
    pub ledger_ids: Vec<EntityId>,
    pub registration_id: Option<EntityId>,
    pub action_id: EntityId,
    pub now: String,
}

pub fn apply_movement(
    tables: &mut SnapshotTables,
    plan: &SettlementPlan,
    ids: &MovementIds,
) -> Result<(), CommandError> {
    let negotiation = tables
        .negotiations
        .iter()
        .find(|row| row.id == plan.negotiation_id)
        .ok_or_else(|| invalid("Negotiation was not found."))?;
    let campaign_id = negotiation.campaign_id.clone();
    let season_id = negotiation.season_id.clone();
    if plan.needs_ledger {
        let seller_id = plan
            .seller_club_id
            .clone()
            .ok_or_else(|| invalid("A fee requires a selling club."))?;
        let buyer_balance = {
            let state = tables
                .club_simulation_states
                .iter()
                .find(|state| {
                    state.campaign_id == campaign_id && state.club_id == plan.buyer_club_id
                })
                .ok_or_else(|| invalid("Buyer balance is missing."))?;
            money(sub(state.transfer_balance_cents.get(), plan.fee_cents)?)?
        };
        let seller_balance = {
            let state = tables
                .club_simulation_states
                .iter()
                .find(|state| state.campaign_id == campaign_id && state.club_id == seller_id)
                .ok_or_else(|| invalid("Seller balance is missing."))?;
            money(add(state.transfer_balance_cents.get(), plan.fee_cents)?)?
        };
        tables
            .club_simulation_states
            .iter_mut()
            .find(|state| state.campaign_id == campaign_id && state.club_id == plan.buyer_club_id)
            .ok_or_else(|| invalid("Buyer balance is missing."))?
            .transfer_balance_cents = buyer_balance;
        tables
            .club_simulation_states
            .iter_mut()
            .find(|state| state.campaign_id == campaign_id && state.club_id == seller_id)
            .ok_or_else(|| invalid("Seller balance is missing."))?
            .transfer_balance_cents = seller_balance;
        tables.ledger_entries.push(LedgerEntryRow {
            id: ids.ledger_ids[0].clone(),
            campaign_id: campaign_id.clone(),
            season_id: season_id.clone(),
            club_id: plan.buyer_club_id.clone(),
            kind: LedgerKind::IncomingFee,
            amount_cents: money(plan.fee_cents)?,
            effective_on: plan.starts_on.clone(),
            source_action_id: ids.action_id.clone(),
            reverses_entry_id: None,
            note: None,
        });
        tables.ledger_entries.push(LedgerEntryRow {
            id: ids.ledger_ids[1].clone(),
            campaign_id: campaign_id.clone(),
            season_id: season_id.clone(),
            club_id: seller_id,
            kind: LedgerKind::PlayerSale,
            amount_cents: money(plan.fee_cents)?,
            effective_on: plan.starts_on.clone(),
            source_action_id: ids.action_id.clone(),
            reverses_entry_id: None,
            note: None,
        });
    }
    if let Some(contract_id) = &plan.end_contract_id {
        tables
            .contracts
            .iter_mut()
            .find(|contract| &contract.id == contract_id && contract.campaign_id == campaign_id)
            .ok_or_else(|| invalid("The seller contract is missing."))?
            .status = ContractStatus::Ended;
    }
    tables.contracts.push(ContractRow {
        id: ids.contract_id.clone(),
        campaign_id: campaign_id.clone(),
        player_id: plan.player_id.clone(),
        club_id: plan.buyer_club_id.clone(),
        weekly_wage_cents: Some(money(plan.wage_cents)?),
        squad_tier: Some(plan.squad_tier),
        starts_on: Some(plan.starts_on.clone()),
        expires_on: Some(plan.expires_on.clone()),
        status: ContractStatus::Active,
    });
    tables.transfers.push(TransferRow {
        id: ids.transfer_id.clone(),
        campaign_id: campaign_id.clone(),
        season_id: season_id.clone(),
        player_id: plan.player_id.clone(),
        from_club_id: plan.seller_club_id.clone(),
        to_club_id: Some(plan.buyer_club_id.clone()),
        fee_cents: money(plan.fee_cents)?,
        kind: plan.kind,
        effective_on: plan.starts_on.clone(),
        source_action_id: ids.action_id.clone(),
    });
    tables
        .players
        .iter_mut()
        .find(|player| player.campaign_id == campaign_id && player.id == plan.player_id)
        .ok_or_else(|| invalid("Player was not found."))?
        .club_id = Some(plan.buyer_club_id.clone());
    let released = zero()?;
    for row in &mut tables.negotiations {
        if row.campaign_id == campaign_id && row.id == plan.negotiation_id {
            row.status = NegotiationStatus::Settled;
            row.reserved_cents = released;
            row.reserved_wage_cents = released;
            row.resolved_on = Some(plan.starts_on.clone());
        } else if plan
            .supersede_negotiation_ids
            .iter()
            .any(|id| id == &row.id)
        {
            row.status = NegotiationStatus::Superseded;
            row.reserved_cents = released;
            row.reserved_wage_cents = released;
            row.resolved_on = Some(plan.starts_on.clone());
        }
    }
    for offer in &mut tables.offers {
        if plan.supersede_offer_ids.iter().any(|id| id == &offer.id) {
            offer.status = OfferStatus::Superseded;
            offer.resolved_on = Some(plan.starts_on.clone());
        } else if plan.accept_offer_ids.iter().any(|id| id == &offer.id) {
            offer.status = OfferStatus::Accepted;
            offer.resolved_on = Some(plan.starts_on.clone());
        }
    }
    for lineup in &mut tables.lineups {
        if plan.lineup_ids.iter().any(|id| id == &lineup.id) {
            lineup
                .starters
                .retain(|starter| starter.player_id != plan.player_id);
            lineup.bench_player_ids.retain(|id| id != &plan.player_id);
            lineup.updated_at = ids.now.clone();
        }
    }
    for registration in &mut tables.registrations {
        if plan
            .ineligible_registration_ids
            .iter()
            .any(|id| id == &registration.id)
        {
            registration.status = RegistrationStatus::Ineligible;
        }
    }
    if let Some(registration) = &plan.registration {
        if let Some(existing) = &registration.existing_id {
            let row = tables
                .registrations
                .iter_mut()
                .find(|row| &row.id == existing && row.campaign_id == campaign_id)
                .ok_or_else(|| invalid("Registration was not found."))?;
            row.status = RegistrationStatus::Registered;
            row.homegrown_club = registration.homegrown_club;
            row.homegrown_nation = registration.homegrown_nation;
            row.age_exempt = registration.age_exempt;
        } else {
            tables.registrations.push(RegistrationRow {
                id: ids
                    .registration_id
                    .clone()
                    .ok_or_else(|| invalid("Registration ID is missing."))?,
                campaign_id: campaign_id.clone(),
                season_id: season_id.clone(),
                player_id: plan.player_id.clone(),
                competition_key: LEAGUE.into(),
                status: RegistrationStatus::Registered,
                homegrown_club: registration.homegrown_club,
                homegrown_nation: registration.homegrown_nation,
                age_exempt: registration.age_exempt,
                provenance: RecordSource::Generated,
            });
        }
    }
    Ok(())
}

fn apply(
    tables: &mut SnapshotTables,
    request: &SettleTransferRequest,
    plan: &SettlementPlan,
    fingerprint_hash: &str,
    operation: &str,
) -> Result<AdvanceOutcome, CommandError> {
    let (campaign, season, clock) = loaded(tables, &request.campaign_id)?;
    let campaign_id = campaign.id.clone();
    let season_id = season.id.clone();
    let revision = next_revision(campaign.revision).map_err(invalid)?;
    let current_date = clock.current_date.clone();
    let phase = clock.phase;
    let last_boundary_key = clock.last_boundary_key.clone();
    apply_movement(
        tables,
        plan,
        &MovementIds {
            transfer_id: request.transfer_id.clone(),
            contract_id: request.contract_id.clone(),
            ledger_ids: request.ledger_ids.clone(),
            registration_id: request.registration_id.clone(),
            action_id: request.action_id.clone(),
            now: request.now.clone(),
        },
    )?;
    let saved = tables
        .campaigns
        .iter_mut()
        .find(|row| row.id == campaign_id)
        .ok_or_else(|| invalid("Campaign is missing."))?;
    saved.revision = revision;
    saved.updated_at = request.now.clone();
    let mut outcome_refs = vec![
        OutcomeRef::Negotiation {
            id: plan.negotiation_id.clone(),
        },
        OutcomeRef::Transfer {
            id: request.transfer_id.clone(),
        },
        OutcomeRef::Player {
            id: plan.player_id.clone(),
        },
    ];
    for id in &request.ledger_ids {
        outcome_refs.push(OutcomeRef::Ledger { id: id.clone() });
    }
    tables.simulation_receipts.push(SimulationReceiptRow {
        id: request.receipt_id.clone(),
        campaign_id: campaign_id.clone(),
        operation_key: operation.into(),
        input_revision: request.expected_revision,
        input_fingerprint: fingerprint_hash.into(),
        event_seed: plan.event_seed,
        simulation_version: VersionOne,
        outcome_refs,
        created_at: request.now.clone(),
    });
    let payload = json!({
        "settlementFingerprint": fingerprint_hash,
        "operationKey": operation,
        "negotiationId": plan.negotiation_id,
        "transferId": request.transfer_id,
        "playerId": plan.player_id,
        "ledgerIds": request.ledger_ids,
    });
    tables.audit_events.push(AuditEventRow {
        id: request.audit_id.clone(),
        campaign_id,
        season_id: Some(season_id),
        action_id: request.action_id.clone(),
        action_type: AuditAction::TransferSettle,
        created_at: request.now.clone(),
        summary: "Settled the agreed transfer.".into(),
        payload: AuditPayload(
            payload
                .as_object()
                .cloned()
                .ok_or_else(|| invalid("Audit could not be encoded."))?,
        ),
    });
    Ok(AdvanceOutcome {
        campaign_id: request.campaign_id.clone(),
        revision,
        replayed: false,
        receipt_id: request.receipt_id.clone(),
        operation_key: operation.into(),
        current_date,
        phase,
        last_boundary_key,
    })
}

pub fn prepare(
    tables: &SnapshotTables,
    request: &SettleTransferRequest,
) -> Result<PreparedSettlement, CommandError> {
    validate_request(request)?;
    let (campaign, _, _) = loaded(tables, &request.campaign_id)?;
    if campaign.status == CampaignStatus::Archived {
        return Err(invalid("Restore this archived campaign before editing."));
    }
    let (operation, material) = identity(tables, request)?;
    if receipt(tables, &request.campaign_id, &operation).is_none() {
        let _ = settlement_plan(tables, request)?;
    }
    Ok(PreparedSettlement {
        fingerprint_material: material,
    })
}

/// Recheck the agreement inside the write transaction, then assign client IDs.
pub fn commit(
    tables: &mut SnapshotTables,
    request: &SettleTransferRequest,
    prepared: &PreparedSettlement,
    fingerprint_hash: &str,
) -> Result<AdvanceOutcome, CommandError> {
    validate_request(request)?;
    let (campaign, _, clock) = loaded(tables, &request.campaign_id)?;
    if campaign.status == CampaignStatus::Archived {
        return Err(invalid("Restore this archived campaign before editing."));
    }
    let (operation, material) = identity(tables, request)?;
    if material != prepared.fingerprint_material {
        return Err(conflict(
            "The agreement changed. Reload the saved campaign.",
        ));
    }
    if let Some(saved) = receipt(tables, &request.campaign_id, &operation) {
        if saved.input_fingerprint != fingerprint_hash {
            return Err(conflict(
                "This transfer was already recorded with different input.",
            ));
        }
        return Ok(AdvanceOutcome {
            campaign_id: campaign.id.clone(),
            revision: campaign.revision,
            replayed: true,
            receipt_id: saved.id.clone(),
            operation_key: operation,
            current_date: clock.current_date.clone(),
            phase: clock.phase,
            last_boundary_key: clock.last_boundary_key.clone(),
        });
    }
    let plan = settlement_plan(tables, request)?;
    let (_, _, clock) = loaded(tables, &request.campaign_id)?;
    let (campaign, _, _) = loaded(tables, &request.campaign_id)?;
    cursor(campaign, clock, request)?;
    let (operation, material) = identity(tables, request)?;
    if material != prepared.fingerprint_material {
        return Err(conflict(
            "The agreement changed. Reload the saved campaign.",
        ));
    }
    assign_ids(tables, request, &plan)?;
    apply(tables, request, &plan, fingerprint_hash, &operation)
}
