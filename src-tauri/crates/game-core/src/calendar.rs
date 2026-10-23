use crate::{
    dates::{add_days, DateOnly},
    random::{derive_event_seed, EventKind},
    CalendarPhase, CoreError, CoreResult, SeasonRow, SeasonStatus, SimulationStateRow,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const MATCH_SIMULATION_UNAVAILABLE: &str = "Use Sim Matchday to play the next league round.";
pub const RUN_MARKET_BEFORE_MATCHDAY: &str = "Run the transfer market before this matchday.";
pub const CLOSE_WINDOW_BEFORE_MATCHDAY: &str = "Close the winter window before this matchday.";
pub const ACCEPT_QUALIFYING_OFFER: &str =
    "Accept the qualifying offer before the window can close.";
pub const TRANSFER_WINDOW_CLOSED: &str = "The transfer window is closed.";
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
    SummerDate,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MarketDue {
    Tick,
    Close,
}
pub fn market_key(season_id: &str, date: &str) -> String {
    format!("season:{season_id}:market:{date}")
}
pub fn summer_arrival_key(season_id: &str, date: &str) -> String {
    format!("season:{season_id}:summer-date:{date}")
}
pub fn winter_close_key(season_id: &str) -> String {
    format!("season:{season_id}:window-close:winter")
}
pub fn summer_tick_dates(start: &DateOnly) -> CoreResult<Vec<DateOnly>> {
    (0..9).map(|step| add_days(start, step * 7)).collect()
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
    season_id: String,
    summer_ticks: Vec<DateOnly>,
    january_dates: Vec<DateOnly>,
    close_date: Option<DateOnly>,
    awaiting_tick: bool,
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
    let summer_ticks = summer_tick_dates(&dates.start_date)?;
    let january_end = DateOnly::parse(&format!("{}-01-31", start.year() + 1))?;
    let mut january_dates = Vec::new();
    let mut close_date = None;
    for round in 1..=34 {
        let played = add_days(&kickoff.date, (round - 1) * 7)?;
        let month_day = &played.as_str()[5..];
        if played.year() == start.year() + 1 && month_day <= "01-31" {
            january_dates.push(played.clone());
        }
        if close_date.is_none() && played > january_end {
            close_date = Some(played);
        }
    }
    let season_id = season.id.as_str().to_owned();
    let on_tick = summer_ticks.iter().any(|date| date == &current);
    let tick_market = market_key(&season_id, current.as_str());
    let tick_arrival = summer_arrival_key(&season_id, current.as_str());
    let close_key = winter_close_key(&season_id);
    let cursor = state.last_boundary_key.as_deref();
    let awaiting_tick = state.phase == CalendarPhase::Preseason
        && on_tick
        && ((cursor.is_none() && current == summer_ticks[0])
            || cursor == Some(tick_arrival.as_str()));
    let consumed_tick =
        state.phase == CalendarPhase::Preseason && on_tick && cursor == Some(tick_market.as_str());
    let consumed_january = state.phase == CalendarPhase::League
        && january_dates.iter().any(|date| date == &current)
        && cursor == Some(tick_market.as_str());
    let consumed_close = state.phase == CalendarPhase::League
        && close_date.as_ref() == Some(&current)
        && cursor == Some(close_key.as_str());
    let consumed_deadline = state.phase == CalendarPhase::Preseason
        && state.last_boundary_key.as_deref() == Some(&deadline.key)
        && current == deadline.date;
    let consumed_kickoff = state.phase == CalendarPhase::League
        && state.last_boundary_key.as_deref() == Some(&kickoff.key)
        && current == kickoff.date;
    let mut matchday = false;
    for round in 1..=34 {
        let played_date = add_days(&kickoff.date, (round - 1) * 7)?;
        let key = format!(
            "season:{}:matchday:{}",
            season.id.as_str(),
            played_date.as_str()
        );
        if state.last_boundary_key.as_deref() == Some(&key) {
            matchday = if round == 34 {
                state.phase == CalendarPhase::Review && current == played_date
            } else {
                state.phase == CalendarPhase::League && current == add_days(&played_date, 7)?
            };
            break;
        }
    }
    if !awaiting_tick
        && !consumed_tick
        && !consumed_january
        && !consumed_close
        && !consumed_deadline
        && !consumed_kickoff
        && !matchday
    {
        return Err(CoreError::Invalid(
            "Game date, phase and consumed boundary are inconsistent.",
        ));
    }
    Ok(FoundationClock {
        current,
        deadline,
        kickoff,
        season_id,
        summer_ticks,
        january_dates,
        close_date,
        awaiting_tick,
    })
}
fn next(context: FoundationClock, source: Option<&str>) -> Option<GameBoundary> {
    let key = source?;
    if key == context.deadline.key {
        return Some(context.kickoff);
    }
    let market = market_key(&context.season_id, context.current.as_str());
    if key == market {
        if let Some(index) = context
            .summer_ticks
            .iter()
            .position(|date| date == &context.current)
        {
            if let Some(next_date) = context.summer_ticks.get(index + 1) {
                return Some(GameBoundary {
                    key: summer_arrival_key(&context.season_id, next_date.as_str()),
                    date: next_date.clone(),
                    kind: BoundaryKind::SummerDate,
                });
            }
            return Some(context.deadline);
        }
    }
    None
}
pub fn market_due(state: &SimulationStateRow, season: &SeasonRow) -> CoreResult<Option<MarketDue>> {
    let context = foundation_clock(state, season)?;
    let cursor = state.last_boundary_key.as_deref();
    let market = market_key(&context.season_id, context.current.as_str());
    if context.awaiting_tick {
        return Ok(Some(MarketDue::Tick));
    }
    if state.phase == CalendarPhase::League
        && context
            .january_dates
            .iter()
            .any(|date| date == &context.current)
        && cursor != Some(market.as_str())
    {
        return Ok(Some(MarketDue::Tick));
    }
    if state.phase == CalendarPhase::League
        && context.close_date.as_ref() == Some(&context.current)
        && cursor != Some(winter_close_key(&context.season_id).as_str())
    {
        return Ok(Some(MarketDue::Close));
    }
    Ok(None)
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
    let awaiting_tick = context.awaiting_tick;
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
        reason: if target.is_some() || awaiting_tick {
            None
        } else if state.phase == CalendarPhase::Review {
            Some(crate::matchday::ROLLOVER_UNAVAILABLE.into())
        } else {
            Some(MATCH_SIMULATION_UNAVAILABLE.into())
        },
        target,
    })
}
