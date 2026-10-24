//! Authoritative market command dispatch and receipt/audit finalization.
mod approaches;
mod run;
use super::context::{conflict, core, cursor_matches, invalid, loaded, number};
use super::types::{CloseWindowRequest, MarketCommand};
use super::window::{expire_noncompulsory, window_is_blocked};
use crate::calendar;
use crate::calendar::winter_close_key;
use crate::calendar::MarketDue;
use crate::calendar::ACCEPT_QUALIFYING_OFFER;
use crate::guards::next_revision;
use crate::progression::AdvanceOutcome;
use crate::random::derive_event_seed;
use crate::random::EventKind;
use crate::{
    AuditAction, AuditEventRow, AuditPayload, CalendarPhase, CampaignRow, CommandError, EntityId,
    OutcomeRef, SafeInt, SimulationReceiptRow, SimulationStateRow, SnapshotTables, VersionOne,
};
pub use approaches::accept_settlement_request;
use approaches::{commit_propose, commit_reject, commit_respond};
use run::commit_run;
use serde_json::json;

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
