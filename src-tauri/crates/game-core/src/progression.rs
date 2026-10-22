//! Pure foundation progression. Persistence rechecks this plan inside one transaction.
use crate::{
    calendar::{preview_time_advance, BoundaryKind, MATCH_SIMULATION_UNAVAILABLE},
    dates::{validate_timestamp, DateOnly},
    guards::next_revision,
    AuditAction, AuditEventRow, AuditPayload, CalendarPhase, CampaignMode, CampaignRow,
    CampaignStatus, CommandError, EntityId, OutcomeRef, SafeInt, SeasonRow, SimulationReceiptRow,
    SimulationStateRow, SnapshotTables, VersionOne,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TimePreview {
    pub campaign_id: EntityId,
    pub revision: SafeInt,
    pub from_date: String,
    pub source_boundary_key: Option<String>,
    pub phase: CalendarPhase,
    pub allowed: bool,
    pub target_boundary_key: Option<String>,
    pub target_date: Option<String>,
    pub target_kind: Option<BoundaryKind>,
    pub next_event: Option<String>,
    pub event_seed: Option<SafeInt>,
    pub reason: Option<String>,
}

/// Source date, cursor, revision and target identity. No arbitrary future date.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdvanceRequest {
    pub campaign_id: EntityId,
    pub expected_revision: SafeInt,
    pub source_date: String,
    #[serde(deserialize_with = "crate::nulls::nullable")]
    pub source_boundary_key: Option<String>,
    pub target_boundary_key: String,
    pub action_id: EntityId,
    pub audit_id: EntityId,
    pub receipt_id: EntityId,
    pub now: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdvanceOutcome {
    pub campaign_id: EntityId,
    pub revision: SafeInt,
    pub replayed: bool,
    pub receipt_id: EntityId,
    pub operation_key: String,
    pub current_date: String,
    pub phase: CalendarPhase,
    pub last_boundary_key: Option<String>,
}

#[derive(Debug)]
pub struct AdvanceCommit {
    pub outcome: AdvanceOutcome,
    clock_id: EntityId,
    current_date: String,
    phase: CalendarPhase,
    last_boundary_key: String,
    revision: SafeInt,
    updated_at: String,
    receipt: SimulationReceiptRow,
    audit: AuditEventRow,
}

#[derive(Debug)]
pub enum AdvancePlan {
    Replay(AdvanceOutcome),
    Commit(Box<AdvanceCommit>),
}

struct Loaded<'a> {
    campaign: &'a CampaignRow,
    season: &'a SeasonRow,
    clock: &'a SimulationStateRow,
}

fn invalid(message: impl Into<String>) -> CommandError {
    CommandError::Validation {
        message: message.into(),
    }
}
fn conflict(message: &str) -> CommandError {
    CommandError::Conflict {
        message: message.into(),
    }
}
fn historical() -> CommandError {
    CommandError::Scope {
        message: "This historical manual save is read-only. You can inspect, export or delete it."
            .into(),
    }
}
fn stopped() -> CommandError {
    CommandError::Scope {
        message: MATCH_SIMULATION_UNAVAILABLE.into(),
    }
}
pub fn boundary_label(kind: BoundaryKind) -> &'static str {
    match kind {
        BoundaryKind::SummerDeadline => "Summer deadline",
        BoundaryKind::LeagueKickoff => "League kickoff",
    }
}
pub fn advance_operation_key(season_id: &str, boundary_key: &str) -> Result<String, CommandError> {
    let key = format!("advance:{season_id}:{boundary_key}");
    if key.chars().count() > 200 {
        return Err(invalid("Target boundary is not supported."));
    }
    Ok(key)
}
fn validate_request(request: &AdvanceRequest) -> Result<(), CommandError> {
    if request.expected_revision.get() < 0 {
        return Err(invalid("Expected revision must be non-negative."));
    }
    DateOnly::parse(&request.source_date).map_err(|error| invalid(error.to_string()))?;
    validate_timestamp(&request.now).map_err(|error| invalid(error.to_string()))?;
    validate_key(&request.target_boundary_key, "Target boundary")?;
    if let Some(cursor) = &request.source_boundary_key {
        validate_key(cursor, "Source cursor")?;
    }
    Ok(())
}
fn validate_key(value: &str, label: &str) -> Result<(), CommandError> {
    if value.trim() != value || value.is_empty() || value.chars().count() > 200 {
        return Err(invalid(format!("{label} is not supported.")));
    }
    Ok(())
}
fn load<'a>(
    tables: &'a SnapshotTables,
    campaign_id: &EntityId,
) -> Result<Loaded<'a>, CommandError> {
    let campaign = tables
        .campaigns
        .iter()
        .find(|row| &row.id == campaign_id)
        .ok_or_else(|| invalid("Campaign not found."))?;
    if campaign.mode != CampaignMode::Standalone {
        return Err(historical());
    }
    let season = tables
        .seasons
        .iter()
        .find(|row| row.id == campaign.active_season_id && row.campaign_id == campaign.id)
        .ok_or_else(|| invalid("Active season not found."))?;
    let clock = tables
        .simulation_states
        .iter()
        .find(|row| row.campaign_id == campaign.id)
        .ok_or_else(|| invalid("Saved game clock is missing."))?;
    Ok(Loaded {
        campaign,
        season,
        clock,
    })
}
pub fn critical_material(
    tables: &SnapshotTables,
    request: &AdvanceRequest,
) -> Result<String, CommandError> {
    let loaded = load(tables, &request.campaign_id)?;
    if loaded.campaign.status == CampaignStatus::Archived {
        return Err(invalid("Restore this archived campaign before editing."));
    }
    validate_request(request)?;
    serde_json::to_string(&(
        "advance",
        loaded.campaign.id.as_str(),
        loaded.season.id.as_str(),
        request.expected_revision.get(),
        request.source_date.as_str(),
        request.source_boundary_key.as_deref(),
        request.target_boundary_key.as_str(),
        "1",
    ))
    .map_err(|_| invalid("Progression input could not be encoded."))
}
pub fn preview_saved(
    tables: &SnapshotTables,
    campaign_id: &EntityId,
) -> Result<TimePreview, CommandError> {
    let loaded = load(tables, campaign_id)?;
    let preview = preview_time_advance(loaded.clock, loaded.season)
        .map_err(|error| invalid(error.to_string()))?;
    let event_seed = preview
        .event_seed
        .map(|seed| SafeInt::new(i64::from(seed)))
        .transpose()
        .map_err(|error| invalid(error.to_string()))?;
    let mut view = TimePreview {
        campaign_id: loaded.campaign.id.clone(),
        revision: loaded.campaign.revision,
        from_date: preview.from_date.as_str().to_owned(),
        source_boundary_key: preview.source_boundary_key,
        phase: loaded.clock.phase,
        allowed: preview.allowed,
        target_boundary_key: preview.target_boundary_key,
        target_date: preview
            .target
            .as_ref()
            .map(|target| target.date.as_str().to_owned()),
        target_kind: preview.target.as_ref().map(|target| target.kind),
        next_event: preview
            .target
            .as_ref()
            .map(|target| boundary_label(target.kind).to_owned()),
        event_seed,
        reason: preview.reason,
    };
    if loaded.campaign.status == CampaignStatus::Archived {
        view.allowed = false;
        view.target_boundary_key = None;
        view.target_date = None;
        view.target_kind = None;
        view.next_event = None;
        view.event_seed = None;
        view.reason = Some("Restore this archived campaign before editing.".into());
    }
    Ok(view)
}
pub fn evaluate(
    tables: &SnapshotTables,
    request: &AdvanceRequest,
    fingerprint: &str,
) -> Result<AdvancePlan, CommandError> {
    let loaded = load(tables, &request.campaign_id)?;
    if loaded.campaign.status == CampaignStatus::Archived {
        return Err(invalid("Restore this archived campaign before editing."));
    }
    validate_request(request)?;
    let operation_key =
        advance_operation_key(loaded.season.id.as_str(), &request.target_boundary_key)?;
    let preview = preview_time_advance(loaded.clock, loaded.season)
        .map_err(|error| invalid(error.to_string()))?;
    if let Some(receipt) = tables
        .simulation_receipts
        .iter()
        .find(|row| row.campaign_id == loaded.campaign.id && row.operation_key == operation_key)
    {
        if receipt.input_fingerprint == fingerprint {
            return Ok(AdvancePlan::Replay(current_outcome(
                loaded.campaign,
                loaded.clock,
                receipt.id.clone(),
                operation_key,
            )));
        }
        if !preview.allowed {
            return Err(stopped());
        }
        return Err(conflict(
            "This progression was already recorded with different input.",
        ));
    }
    if !preview.allowed {
        return Err(stopped());
    }
    if loaded.campaign.revision != request.expected_revision {
        return Err(conflict("Campaign revision is stale."));
    }
    if request.source_date != loaded.clock.current_date
        || request.source_boundary_key != loaded.clock.last_boundary_key
    {
        return Err(conflict(
            "Source date or cursor does not match the saved game.",
        ));
    }
    let target = preview.target.as_ref().ok_or_else(stopped)?;
    if request.target_boundary_key != target.key {
        return Err(conflict("The requested boundary is not the next event."));
    }
    if tables
        .simulation_receipts
        .iter()
        .any(|row| row.id == request.receipt_id)
        || tables
            .audit_events
            .iter()
            .any(|row| row.id == request.audit_id || row.action_id == request.action_id)
    {
        return Err(conflict("Action identity was already used."));
    }
    let phase = match target.kind {
        BoundaryKind::SummerDeadline => CalendarPhase::Preseason,
        BoundaryKind::LeagueKickoff => CalendarPhase::League,
    };
    let revision =
        next_revision(loaded.campaign.revision).map_err(|error| invalid(error.to_string()))?;
    let event_seed = SafeInt::new(i64::from(
        preview
            .event_seed
            .ok_or_else(|| invalid("The next event has no seed."))?,
    ))
    .map_err(|error| invalid(error.to_string()))?;
    let summary = match target.kind {
        BoundaryKind::SummerDeadline => {
            format!(
                "Advanced to the summer deadline on {}.",
                target.date.as_str()
            )
        }
        BoundaryKind::LeagueKickoff => {
            format!("Advanced to league kickoff on {}.", target.date.as_str())
        }
    };
    let payload = json!({
        "advanceFingerprint": fingerprint,
        "operationKey": operation_key,
        "targetBoundaryKey": target.key,
    });
    let payload = payload
        .as_object()
        .cloned()
        .ok_or_else(|| invalid("Progression audit could not be encoded."))?;
    Ok(AdvancePlan::Commit(Box::new(AdvanceCommit {
        outcome: AdvanceOutcome {
            campaign_id: loaded.campaign.id.clone(),
            revision,
            replayed: false,
            receipt_id: request.receipt_id.clone(),
            operation_key: operation_key.clone(),
            current_date: target.date.as_str().to_owned(),
            phase,
            last_boundary_key: Some(target.key.clone()),
        },
        clock_id: loaded.clock.id.clone(),
        current_date: target.date.as_str().to_owned(),
        phase,
        last_boundary_key: target.key.clone(),
        revision,
        updated_at: request.now.clone(),
        receipt: SimulationReceiptRow {
            id: request.receipt_id.clone(),
            campaign_id: loaded.campaign.id.clone(),
            operation_key,
            input_revision: request.expected_revision,
            input_fingerprint: fingerprint.to_owned(),
            event_seed,
            simulation_version: VersionOne,
            outcome_refs: vec![
                OutcomeRef::Season {
                    id: loaded.season.id.clone(),
                },
                OutcomeRef::Boundary {
                    key: target.key.clone(),
                },
            ],
            created_at: request.now.clone(),
        },
        audit: AuditEventRow {
            id: request.audit_id.clone(),
            campaign_id: loaded.campaign.id.clone(),
            season_id: Some(loaded.season.id.clone()),
            action_id: request.action_id.clone(),
            action_type: AuditAction::SimulationAdvance,
            created_at: request.now.clone(),
            summary,
            payload: AuditPayload(payload),
        },
    })))
}
fn current_outcome(
    campaign: &CampaignRow,
    clock: &SimulationStateRow,
    receipt_id: EntityId,
    operation_key: String,
) -> AdvanceOutcome {
    AdvanceOutcome {
        campaign_id: campaign.id.clone(),
        revision: campaign.revision,
        replayed: true,
        receipt_id,
        operation_key,
        current_date: clock.current_date.clone(),
        phase: clock.phase,
        last_boundary_key: clock.last_boundary_key.clone(),
    }
}
pub fn commit(tables: &mut SnapshotTables, planned: AdvanceCommit) -> AdvanceOutcome {
    let campaign_id = planned.outcome.campaign_id.clone();
    if let Some(campaign) = tables
        .campaigns
        .iter_mut()
        .find(|row| row.id == campaign_id)
    {
        campaign.revision = planned.revision;
        campaign.updated_at = planned.updated_at;
    }
    if let Some(clock) = tables
        .simulation_states
        .iter_mut()
        .find(|row| row.id == planned.clock_id)
    {
        clock.current_date = planned.current_date;
        clock.phase = planned.phase;
        clock.last_boundary_key = Some(planned.last_boundary_key);
    }
    tables.simulation_receipts.push(planned.receipt);
    tables.audit_events.push(planned.audit);
    planned.outcome
}
