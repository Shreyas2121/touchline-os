//! Atomic tick execution from the ordered market plan.
use super::super::context::{
    conflict, constitution, cursor_matches, deadline_on, invalid, loaded, money, number,
};
use super::super::planning::{plan_slots, tick_seed};
use super::super::types::RunMarketRequest;
use super::super::window::expire_noncompulsory;
use super::{finish, fresh, outcome_now};
use crate::calendar;
use crate::calendar::market_key;
use crate::calendar::MarketDue;
use crate::dates::DateOnly;
use crate::guards::next_revision;
use crate::progression::AdvanceOutcome;
use crate::settlement;
use crate::settlement::MovementIds;
use crate::{
    AuditAction, CommandError, NegotiationQualification, NegotiationRow, NegotiationStatus,
    OfferOrigin, OfferRow, OfferStatus, OutcomeRef, SnapshotTables, VersionOne,
};
use std::collections::BTreeSet;

pub(super) fn commit_run(
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
