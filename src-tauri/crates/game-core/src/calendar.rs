use crate::{
    dates::{add_days, DateOnly},
    random::{derive_event_seed, EventKind},
    CalendarPhase, CoreError, CoreResult, SeasonRow, SeasonStatus, SimulationStateRow,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const MATCH_SIMULATION_UNAVAILABLE: &str = "Match simulation arrives in Phase 8.";
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TransferWindow {
    Summer,
    Winter,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonDates {
    pub start_date: DateOnly,
    pub end_date: DateOnly,
}
pub fn season_dates(year: i64) -> CoreResult<SeasonDates> {
    if !(1900..2199).contains(&year) {
        return Err(CoreError::Invalid(
            "Choose a season start year from 1900 to 2198.",
        ));
    }
    Ok(SeasonDates {
        start_date: DateOnly::parse(&format!("{year}-07-01"))?,
        end_date: DateOnly::parse(&format!("{}-06-30", year + 1))?,
    })
}
pub fn transfer_window_on(date: &DateOnly) -> Option<TransferWindow> {
    match &date.as_str()[5..] {
        value if ("07-01"..="08-31").contains(&value) => Some(TransferWindow::Summer),
        value if ("01-01"..="01-31").contains(&value) => Some(TransferWindow::Winter),
        _ => None,
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
pub enum BoundaryKind {
    SummerDeadline,
    LeagueKickoff,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GameBoundary {
    pub key: String,
    pub date: DateOnly,
    pub kind: BoundaryKind,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockPreview {
    pub from_date: DateOnly,
    pub source_boundary_key: Option<String>,
    pub allowed: bool,
    pub target: Option<GameBoundary>,
    pub target_boundary_key: Option<String>,
    pub event_seed: Option<u32>,
    pub reason: Option<String>,
}
struct FoundationClock {
    current: DateOnly,
    deadline: GameBoundary,
    kickoff: GameBoundary,
}
fn foundation_clock(state: &SimulationStateRow, season: &SeasonRow) -> CoreResult<FoundationClock> {
    crate::validate::validate_simulation(state)
        .map_err(|_| CoreError::Invalid("Invalid simulation state."))?;
    crate::validate::validate_season(season).map_err(|_| CoreError::Invalid("Invalid season."))?;
    if season.campaign_id != state.campaign_id
        || season.id != state.active_season_id
        || season.status != SeasonStatus::Active
        || season.closed_at.is_some()
        || season.start_date.is_none()
    {
        return Err(CoreError::Invalid(
            "The clock must reference its campaign active season.",
        ));
    }
    let start = DateOnly::parse(
        season
            .start_date
            .as_deref()
            .ok_or(CoreError::Invalid("Missing season start."))?,
    )?;
    let current = DateOnly::parse(&state.current_date)?;
    let dates = season_dates(start.year())?;
    if start != dates.start_date
        || season.end_date.as_deref() != Some(dates.end_date.as_str())
        || current < dates.start_date
        || current > dates.end_date
    {
        return Err(CoreError::Invalid(
            "The clock must be inside an explicit July-June season.",
        ));
    }
    let deadline = GameBoundary {
        key: format!("season:{}:summer-deadline", start.year()),
        date: DateOnly::parse(&format!("{}-08-31", start.year()))?,
        kind: BoundaryKind::SummerDeadline,
    };
    let kickoff = GameBoundary {
        key: format!("season:{}:league-kickoff", start.year()),
        date: add_days(&deadline.date, 1)?,
        kind: BoundaryKind::LeagueKickoff,
    };
    let unconsumed = state.phase == CalendarPhase::Preseason
        && state.last_boundary_key.is_none()
        && current <= deadline.date;
    let consumed_deadline = state.phase == CalendarPhase::Preseason
        && state.last_boundary_key.as_deref() == Some(&deadline.key)
        && current == deadline.date;
    let consumed_kickoff = state.phase == CalendarPhase::League
        && state.last_boundary_key.as_deref() == Some(&kickoff.key)
        && current == kickoff.date;
    if !unconsumed && !consumed_deadline && !consumed_kickoff {
        return Err(CoreError::Invalid(
            "Game date, phase and consumed boundary are inconsistent.",
        ));
    }
    Ok(FoundationClock {
        current,
        deadline,
        kickoff,
    })
}
fn next(context: FoundationClock, source: Option<&str>) -> Option<GameBoundary> {
    match source {
        None => Some(context.deadline),
        Some(key) if key == context.deadline.key => Some(context.kickoff),
        _ => None,
    }
}
pub fn next_foundation_boundary(
    state: &SimulationStateRow,
    season: &SeasonRow,
) -> CoreResult<Option<GameBoundary>> {
    Ok(next(
        foundation_clock(state, season)?,
        state.last_boundary_key.as_deref(),
    ))
}
pub fn active_transfer_window(
    state: &SimulationStateRow,
    season: &SeasonRow,
) -> CoreResult<Option<TransferWindow>> {
    let context = foundation_clock(state, season)?;
    if state.last_boundary_key.as_deref() == Some(&context.deadline.key) {
        return Ok(None);
    }
    Ok(transfer_window_on(&context.current))
}
pub fn preview_time_advance(
    state: &SimulationStateRow,
    season: &SeasonRow,
) -> CoreResult<ClockPreview> {
    let context = foundation_clock(state, season)?;
    let from_date = context.current.clone();
    let source_boundary_key = state.last_boundary_key.clone();
    let target = next(context, state.last_boundary_key.as_deref());
    let event_seed = target
        .as_ref()
        .map(|target| derive_event_seed(&state.root_seed, "1", EventKind::Calendar, &[&target.key]))
        .transpose()?;
    Ok(ClockPreview {
        from_date,
        source_boundary_key,
        allowed: target.is_some(),
        target_boundary_key: target.as_ref().map(|t| t.key.clone()),
        event_seed,
        reason: target
            .is_none()
            .then(|| MATCH_SIMULATION_UNAVAILABLE.into()),
        target,
    })
}
