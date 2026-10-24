//! Managed-club proposals, negotiation responses, and offer decisions.
use super::super::context::{
    club_key, conflict, constitution, core, cursor_matches, deadline_on, invalid, loaded, money,
    number, open_status, player_key, tier_name, zero,
};
use super::super::types::{
    NegotiationDecision, OfferDecision, ProposeTransferRequest, RespondNegotiationRequest,
    RespondOfferRequest,
};
use super::super::window::offer_still_qualifies;
use super::{finish, fresh, outcome_now};
use crate::calendar;
use crate::calendar::TRANSFER_WINDOW_CLOSED;
use crate::dates::DateOnly;
use crate::finance::wage_commitment;
use crate::guards::next_revision;
use crate::market::resolve_terms;
use crate::market::Agreement;
use crate::market::TermProposal;
use crate::policy::evaluate_action;
use crate::policy::PolicyAction;
use crate::policy::PolicySnapshot;
use crate::progression::AdvanceOutcome;
use crate::settlement;
use crate::{
    AuditAction, CommandError, ContractStatus, NegotiationRow, NegotiationStatus, OfferStatus,
    OutcomeRef, SeasonRow, SimulationStateRow, SnapshotTables, VersionOne,
};

fn approach_open(clock: &SimulationStateRow, season: &SeasonRow) -> Result<(), CommandError> {
    let window = calendar::active_transfer_window(clock, season).map_err(invalid)?;
    if window.is_none() {
        return Err(invalid(TRANSFER_WINDOW_CLOSED));
    }
    Ok(())
}

pub(super) fn commit_propose(
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

pub(super) fn commit_respond(
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

pub(super) fn commit_reject(
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
