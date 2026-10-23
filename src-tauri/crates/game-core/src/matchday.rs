//! Round planning is pure; engines run before the store's write transaction.
use crate::{
    dates::{add_days, validate_timestamp, DateOnly},
    guards::next_revision,
    match_engine::{
        simulate_fixture, AvailabilityDelta, ClubSide, EngineInput, EngineMatch,
        MATCH_ENGINE_VERSION,
    },
    match_selection::{
        select_ai_club, select_managed_club, ClubSelection, MatchPlayer, MatchRegistration,
        SelectionMode,
    },
    progression::AdvanceOutcome,
    random::{derive_event_seed, EventKind},
    schedule::{schedule_season, standings, MatchScore, ScheduleClub},
    *,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use ts_rs::TS;

pub const ROLLOVER_UNAVAILABLE: &str = "Season rollover arrives in Phase 10.";
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
fn number(value: i64) -> Result<SafeInt, CommandError> {
    SafeInt::new(value).map_err(invalid)
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MatchdayPreview {
    pub campaign_id: EntityId,
    pub revision: SafeInt,
    pub from_date: String,
    pub source_boundary_key: Option<String>,
    pub allowed: bool,
    pub target_date: Option<String>,
    pub round: Option<SafeInt>,
    pub next_event: Option<String>,
    pub blocker: Option<String>,
    pub emergency: bool,
    pub event_seed: Option<SafeInt>,
    pub fixture_count: SafeInt,
    pub match_count: SafeInt,
    pub appearance_count: SafeInt,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SimMatchdayRequest {
    pub campaign_id: EntityId,
    pub expected_revision: SafeInt,
    pub source_date: String,
    #[serde(deserialize_with = "crate::nulls::nullable")]
    pub source_boundary_key: Option<String>,
    pub target_date: String,
    pub action_id: EntityId,
    pub audit_id: EntityId,
    pub receipt_id: EntityId,
    pub now: String,
    pub fixture_ids: Vec<EntityId>,
    pub match_ids: Vec<EntityId>,
    pub appearance_ids: Vec<EntityId>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MatchdayTableRow {
    pub club_id: EntityId,
    pub club_name: String,
    pub simulation_key: String,
    pub played: SafeInt,
    pub won: SafeInt,
    pub drawn: SafeInt,
    pub lost: SafeInt,
    pub goals_for: SafeInt,
    pub goals_against: SafeInt,
    pub goal_difference: SafeInt,
    pub points: SafeInt,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MatchdayLeague {
    pub name: String,
    pub rows: Vec<MatchdayTableRow>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MatchdayView {
    pub campaign_id: EntityId,
    pub round: SafeInt,
    pub calendar_exists: bool,
    pub fixtures: Vec<FixtureRow>,
    pub matches: Vec<SimulatedMatchRow>,
    pub appearances: Vec<SimulatedAppearanceRow>,
    pub labels: BTreeMap<String, String>,
    pub leagues: Vec<MatchdayLeague>,
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
        return Err(invalid("Only standalone careers can simulate matches."));
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

fn calendar(
    tables: &SnapshotTables,
    campaign: &CampaignRow,
    season: &SeasonRow,
) -> Result<Vec<FixtureRow>, CommandError> {
    let mut saved = tables
        .fixtures
        .iter()
        .filter(|f| f.campaign_id == campaign.id && f.season_id == season.id)
        .cloned()
        .collect::<Vec<_>>();
    if saved.is_empty() {
        let start = DateOnly::parse(
            season
                .start_date
                .as_deref()
                .ok_or_else(|| invalid("Season start is missing."))?,
        )
        .map_err(invalid)?;
        let mut clubs = Vec::new();
        for club in tables.clubs.iter().filter(|c| c.campaign_id == campaign.id) {
            let state = tables
                .club_simulation_states
                .iter()
                .find(|s| s.club_id == club.id)
                .ok_or_else(|| invalid("Club simulation state is missing."))?;
            let league = tables
                .leagues
                .iter()
                .find(|l| Some(&l.id) == club.league_id.as_ref())
                .ok_or_else(|| invalid("League is missing."))?;
            clubs.push(ScheduleClub {
                simulation_key: &state.simulation_key,
                league_tier: league
                    .tier
                    .ok_or_else(|| invalid("League tier is missing."))?
                    .get(),
            });
        }
        for (i, f) in schedule_season(start.year(), &clubs)
            .map_err(invalid)?
            .into_iter()
            .enumerate()
        {
            let club_id = |key: &str| {
                tables
                    .club_simulation_states
                    .iter()
                    .find(|c| c.simulation_key == key && c.campaign_id == campaign.id)
                    .map(|c| c.club_id.clone())
                    .ok_or_else(|| invalid("Club key is missing."))
            };
            saved.push(FixtureRow {
                // Pure temporary slots; replaced with request IDs before writing.
                id: EntityId::new(format!("planned-fixture-{i}")).map_err(invalid)?,
                campaign_id: campaign.id.clone(),
                season_id: season.id.clone(),
                league_id: tables
                    .leagues
                    .iter()
                    .find(|l| {
                        l.campaign_id == campaign.id
                            && l.tier.map(SafeInt::get) == Some(f.league_tier)
                    })
                    .ok_or_else(|| invalid("League tier is missing."))?
                    .id
                    .clone(),
                round: number(i64::from(f.round))?,
                match_date: f.match_date.as_str().into(),
                home_club_id: club_id(&f.home_simulation_key)?,
                away_club_id: club_id(&f.away_simulation_key)?,
                fixture_key: f.fixture_key,
                status: FixtureStatus::Scheduled,
            });
        }
    }
    saved.sort_by(|a, b| a.fixture_key.cmp(&b.fixture_key));
    if saved.len() != 1_224 {
        return Err(invalid("The saved calendar is incomplete."));
    }
    Ok(saved)
}

fn selection(
    tables: &SnapshotTables,
    campaign: &CampaignRow,
    club: &EntityId,
    date: &DateOnly,
) -> Result<ClubSelection, CommandError> {
    let mut injuries = BTreeMap::new();
    for state in tables
        .player_simulation_states
        .iter()
        .filter(|s| s.campaign_id == campaign.id)
    {
        injuries.insert(
            state.player_id.as_str(),
            state
                .injury_until_date
                .as_deref()
                .map(DateOnly::parse)
                .transpose()
                .map_err(invalid)?,
        );
    }
    let mut roster = Vec::new();
    for player in tables
        .players
        .iter()
        .filter(|p| p.campaign_id == campaign.id && p.club_id.as_ref() == Some(club))
    {
        let state = tables
            .player_simulation_states
            .iter()
            .find(|s| s.player_id == player.id && s.campaign_id == campaign.id)
            .ok_or_else(|| invalid("Player simulation state is missing."))?;
        let registration = tables.registrations.iter().find(|r| {
            r.player_id == player.id
                && r.season_id == campaign.active_season_id
                && r.competition_key == "league"
        });
        roster.push(MatchPlayer {
            player_id: player.id.as_str(),
            simulation_key: &state.simulation_key,
            position_group: player.position_group,
            attributes: &player.attributes,
            goalkeeping: state.goalkeeping.map(SafeInt::get),
            fitness: state.fitness.get(),
            sharpness: state.sharpness.get(),
            life: state.status,
            contract_active: tables.contracts.iter().any(|c| {
                c.player_id == player.id
                    && &c.club_id == club
                    && c.status == ContractStatus::Active
                    && c.starts_on.as_deref().is_none_or(|d| d <= date.as_str())
                    && c.expires_on.as_deref().is_none_or(|d| d >= date.as_str())
            }),
            injury_until_date: injuries.get(player.id.as_str()).and_then(Option::as_ref),
            suspension_matches: state.suspension_matches.get(),
            registration: registration.map(|r| MatchRegistration {
                competition_key: &r.competition_key,
                status: r.status,
                age_exempt: r.age_exempt,
            }),
        });
    }
    if club == &campaign.managed_club_id {
        Ok(select_managed_club(
            &roster,
            &tables.lineups,
            campaign.active_season_id.as_str(),
            date,
        ))
    } else {
        select_ai_club(&roster, date).map_err(invalid)
    }
}
fn material(selection: &ClubSelection) -> Result<Value, CommandError> {
    let ClubSelection::Ready { players, .. } = selection else {
        return Err(invalid(
            "Select a legal lineup in Tactics and check Registration before this matchday.",
        ));
    };
    serde_json::to_value(players).map_err(invalid)
}

pub struct PlannedFixture {
    fixture: FixtureRow,
    home: ClubSelection,
    away: ClubSelection,
    input: Value,
    result: EngineMatch,
}
pub struct PreparedMatchday {
    pub fingerprint_material: String,
    fixtures: Vec<FixtureRow>,
    played: Vec<PlannedFixture>,
}
fn fingerprint(
    tables: &SnapshotTables,
    request: &SimMatchdayRequest,
    inputs: &[(String, Value)],
) -> Result<String, CommandError> {
    let (_, _, clock) = loaded(tables, &request.campaign_id)?;
    serde_json::to_string(&(
        "matchday",
        &request.campaign_id,
        request.expected_revision,
        &request.source_date,
        &request.source_boundary_key,
        &request.target_date,
        MATCH_ENGINE_VERSION,
        &clock.root_seed,
        inputs,
    ))
    .map_err(invalid)
}
fn operation_key(season: &SeasonRow, date: &str) -> String {
    format!("season:{}:matchday:{date}", season.id.as_str())
}
fn validate_request(request: &SimMatchdayRequest) -> Result<(), CommandError> {
    DateOnly::parse(&request.source_date).map_err(invalid)?;
    DateOnly::parse(&request.target_date).map_err(invalid)?;
    validate_timestamp(&request.now).map_err(invalid)?;
    if request.expected_revision.get() < 0 {
        return Err(invalid("Expected revision must be non-negative."));
    }
    Ok(())
}

/// Reconstruct retry identity from persisted kickoff selections, never current fitness.
pub fn retry_material(
    tables: &SnapshotTables,
    request: &SimMatchdayRequest,
) -> Result<Option<String>, CommandError> {
    validate_request(request)?;
    let (campaign, season, _) = loaded(tables, &request.campaign_id)?;
    if !tables.simulation_receipts.iter().any(|r| {
        r.campaign_id == campaign.id
            && r.operation_key == operation_key(season, &request.target_date)
    }) {
        return Ok(None);
    }
    let mut fixtures = tables
        .fixtures
        .iter()
        .filter(|f| {
            f.campaign_id == campaign.id
                && f.season_id == season.id
                && f.match_date == request.target_date
        })
        .collect::<Vec<_>>();
    fixtures.sort_by(|a, b| a.fixture_key.cmp(&b.fixture_key));
    let inputs = fixtures
        .into_iter()
        .map(|f| {
            let saved = tables
                .simulated_matches
                .iter()
                .find(|m| m.fixture_id == f.id && m.campaign_id == campaign.id)
                .ok_or_else(|| invalid("Stored match is missing."))?;
            Ok((
                f.fixture_key.clone(),
                saved.input_snapshot["kickoff"].clone(),
            ))
        })
        .collect::<Result<Vec<_>, CommandError>>()?;
    Ok(Some(fingerprint(tables, request, &inputs)?))
}

fn round_plan(
    tables: &SnapshotTables,
    id: &EntityId,
) -> Result<(Vec<FixtureRow>, Vec<PlannedFixture>, bool), CommandError> {
    let (campaign, season, clock) = loaded(tables, id)?;
    if campaign.status == CampaignStatus::Archived {
        return Err(invalid("Restore this archived campaign before editing."));
    }
    if clock.phase == CalendarPhase::Review {
        return Err(invalid(ROLLOVER_UNAVAILABLE));
    }
    let all = calendar(tables, campaign, season)?;
    let round = all
        .iter()
        .filter(|f| f.status == FixtureStatus::Scheduled)
        .map(|f| f.round)
        .min_by_key(|v| v.get())
        .ok_or_else(|| invalid(ROLLOVER_UNAVAILABLE))?;
    let fixtures = all.iter().filter(|f| f.round == round).collect::<Vec<_>>();
    if fixtures.len() != 36
        || fixtures
            .iter()
            .any(|f| f.match_date != clock.current_date || f.status != FixtureStatus::Scheduled)
        || clock.phase != CalendarPhase::League
    {
        return Err(invalid("Continue to the next league matchday first."));
    }
    let expected_cursor = if round.get() == 1 {
        format!(
            "season:{}:league-kickoff",
            DateOnly::parse(&clock.current_date)
                .map_err(invalid)?
                .year()
        )
    } else {
        operation_key(
            season,
            add_days(&DateOnly::parse(&clock.current_date).map_err(invalid)?, -7)
                .map_err(invalid)?
                .as_str(),
        )
    };
    if clock.last_boundary_key.as_deref() != Some(&expected_cursor) {
        return Err(conflict("The saved matchday cursor is inconsistent."));
    }
    let mut played = Vec::new();
    let mut emergency = false;
    for fixture in fixtures {
        let date = DateOnly::parse(&fixture.match_date).map_err(invalid)?;
        let home = selection(tables, campaign, &fixture.home_club_id, &date)?;
        let away = selection(tables, campaign, &fixture.away_club_id, &date)?;
        for (club, selected) in [
            (&fixture.home_club_id, &home),
            (&fixture.away_club_id, &away),
        ] {
            if let ClubSelection::Blocked { message } = selected {
                return Err(invalid(format!("{message} Check Tactics or Registration.")));
            }
            if club == &campaign.managed_club_id {
                emergency |= matches!(
                    selected,
                    ClubSelection::Ready {
                        mode: SelectionMode::Emergency,
                        ..
                    }
                );
            }
        }
        let seed = derive_event_seed(
            &clock.root_seed,
            "1",
            EventKind::Fixture,
            &[&fixture.fixture_key],
        )
        .map_err(invalid)?;
        let input = json!({"home": material(&home)?, "away": material(&away)?, "engineVersion": MATCH_ENGINE_VERSION, "eventSeed": seed});
        let result = simulate_fixture(&EngineInput {
            root_seed: &clock.root_seed,
            fixture_key: &fixture.fixture_key,
            match_date: date,
            home: &home,
            away: &away,
        })
        .map_err(invalid)?;
        played.push(PlannedFixture {
            fixture: fixture.clone(),
            home,
            away,
            input,
            result,
        });
    }
    Ok((all, played, emergency))
}

pub fn preview(tables: &SnapshotTables, id: &EntityId) -> Result<MatchdayPreview, CommandError> {
    let (campaign, _, clock) = loaded(tables, id)?;
    let mut preview = MatchdayPreview {
        campaign_id: id.clone(),
        revision: campaign.revision,
        from_date: clock.current_date.clone(),
        source_boundary_key: clock.last_boundary_key.clone(),
        allowed: false,
        target_date: None,
        round: None,
        next_event: None,
        blocker: None,
        emergency: false,
        event_seed: None,
        fixture_count: number(0)?,
        match_count: number(0)?,
        appearance_count: number(0)?,
    };
    match round_plan(tables, id) {
        Err(error) => {
            preview.blocker = Some(match error {
                CommandError::Validation { message } | CommandError::Conflict { message } => {
                    message
                }
                _ => "The matchday could not be planned.".into(),
            })
        }
        Ok((all, played, emergency)) => {
            let first = &played[0];
            preview.allowed = true;
            preview.target_date = Some(first.fixture.match_date.clone());
            preview.round = Some(first.fixture.round);
            preview.emergency = emergency;
            preview.event_seed = Some(number(i64::from(first.result.event_seed))?);
            preview.fixture_count = number(if tables.fixtures.is_empty() {
                all.len() as i64
            } else {
                0
            })?;
            preview.match_count = number(played.len() as i64)?;
            preview.appearance_count = number(
                played
                    .iter()
                    .map(|f| f.result.appearances.len() as i64)
                    .sum(),
            )?;
            let fixture = played
                .iter()
                .find(|f| {
                    f.fixture.home_club_id == campaign.managed_club_id
                        || f.fixture.away_club_id == campaign.managed_club_id
                })
                .ok_or_else(|| invalid("Managed fixture is missing."))?;
            let name = |id: &EntityId| {
                tables
                    .clubs
                    .iter()
                    .find(|c| &c.id == id)
                    .map_or("Unknown club", |c| c.name.as_str())
            };
            preview.next_event = Some(format!(
                "{} v {}",
                name(&fixture.fixture.home_club_id),
                name(&fixture.fixture.away_club_id)
            ));
        }
    }
    Ok(preview)
}

pub fn prepare(
    tables: &SnapshotTables,
    request: &SimMatchdayRequest,
) -> Result<PreparedMatchday, CommandError> {
    validate_request(request)?;
    if let Some(fingerprint_material) = retry_material(tables, request)? {
        return Ok(PreparedMatchday {
            fingerprint_material,
            fixtures: Vec::new(),
            played: Vec::new(),
        });
    }
    let (fixtures, played, _) = round_plan(tables, &request.campaign_id)?;
    let inputs = played
        .iter()
        .map(|f| (f.fixture.fixture_key.clone(), f.input.clone()))
        .collect::<Vec<_>>();
    Ok(PreparedMatchday {
        fingerprint_material: fingerprint(tables, request, &inputs)?,
        fixtures,
        played,
    })
}

/// Transaction-side recheck performs selection only; never draws match randomness.
pub fn commit(
    tables: &mut SnapshotTables,
    request: &SimMatchdayRequest,
    prepared: PreparedMatchday,
    fingerprint_hash: &str,
) -> Result<AdvanceOutcome, CommandError> {
    validate_request(request)?;
    let (campaign, season, clock) = loaded(tables, &request.campaign_id)?;
    let (campaign, season, clock) = (campaign.clone(), season.clone(), clock.clone());
    if campaign.status == CampaignStatus::Archived {
        return Err(invalid("Restore this archived campaign before editing."));
    }
    let operation = operation_key(&season, &request.target_date);
    if let Some(receipt) = tables
        .simulation_receipts
        .iter()
        .find(|r| r.campaign_id == campaign.id && r.operation_key == operation)
    {
        if receipt.input_fingerprint != fingerprint_hash
            || retry_material(tables, request)?.as_deref() != Some(&prepared.fingerprint_material)
        {
            return Err(conflict(
                "This matchday was already recorded with different input.",
            ));
        }
        return Ok(AdvanceOutcome {
            campaign_id: campaign.id,
            revision: campaign.revision,
            replayed: true,
            receipt_id: receipt.id.clone(),
            operation_key: operation,
            current_date: clock.current_date,
            phase: clock.phase,
            last_boundary_key: clock.last_boundary_key,
        });
    }
    if campaign.revision != request.expected_revision {
        return Err(conflict("Campaign revision is stale."));
    }
    if request.source_date != clock.current_date
        || request.source_boundary_key != clock.last_boundary_key
        || request.target_date != clock.current_date
    {
        return Err(conflict(
            "Source date, cursor or target does not match the saved matchday.",
        ));
    }
    if prepared.played.len() != 36 {
        return Err(conflict("The prepared round is missing."));
    }
    let fresh = prepared.played.iter().map(|p| {
        let date = DateOnly::parse(&p.fixture.match_date).map_err(invalid)?;
        let home = selection(tables, &campaign, &p.fixture.home_club_id, &date)?;
        let away = selection(tables, &campaign, &p.fixture.away_club_id, &date)?;
        let input = json!({"home": material(&home)?, "away": material(&away)?, "engineVersion": MATCH_ENGINE_VERSION, "eventSeed": p.result.event_seed});
        Ok((p.fixture.fixture_key.clone(), input))
    }).collect::<Result<Vec<_>, CommandError>>()?;
    if fingerprint(tables, request, &fresh)? != prepared.fingerprint_material {
        return Err(conflict(
            "The match selection changed. Reload the saved campaign.",
        ));
    }
    let first_calendar = !tables
        .fixtures
        .iter()
        .any(|f| f.campaign_id == campaign.id && f.season_id == season.id);
    let appearances = prepared
        .played
        .iter()
        .map(|p| p.result.appearances.len())
        .sum::<usize>();
    if request.fixture_ids.len() != if first_calendar { 1_224 } else { 0 }
        || request.match_ids.len() != 36
        || request.appearance_ids.len() != appearances
    {
        return Err(invalid(
            "Matchday ID vectors must exactly cover the prepared round.",
        ));
    }
    let mut ids = BTreeSet::new();
    if request
        .fixture_ids
        .iter()
        .chain(&request.match_ids)
        .chain(&request.appearance_ids)
        .chain([&request.action_id, &request.audit_id, &request.receipt_id])
        .any(|id| !ids.insert(id.as_str()))
    {
        return Err(invalid("Matchday row IDs must be unique."));
    }
    let round = prepared.played[0].fixture.round;
    if first_calendar {
        tables
            .fixtures
            .extend(
                prepared
                    .fixtures
                    .into_iter()
                    .zip(&request.fixture_ids)
                    .map(|(mut f, id)| {
                        f.id = id.clone();
                        f
                    }),
            );
    }
    let mut appearance_ids = request.appearance_ids.iter();
    let mut updates = Vec::<AvailabilityDelta>::new();
    let mut selected_keys = BTreeSet::new();
    let mut played_clubs = BTreeSet::new();
    for (p, match_id) in prepared.played.into_iter().zip(&request.match_ids) {
        let fixture = tables
            .fixtures
            .iter_mut()
            .find(|f| f.fixture_key == p.fixture.fixture_key && f.campaign_id == campaign.id)
            .ok_or_else(|| invalid("Prepared fixture is missing."))?;
        if fixture.status != FixtureStatus::Scheduled {
            return Err(conflict("This fixture was already played."));
        }
        fixture.status = FixtureStatus::Played;
        let fixture_id = fixture.id.clone();
        played_clubs.extend([
            fixture.home_club_id.as_str().to_owned(),
            fixture.away_club_id.as_str().to_owned(),
        ]);
        let (
            ClubSelection::Ready { players: home, .. },
            ClubSelection::Ready { players: away, .. },
        ) = (&p.home, &p.away)
        else {
            return Err(invalid("Prepared selection is blocked."));
        };
        selected_keys.extend(home.iter().chain(away).map(|p| p.simulation_key.clone()));
        for a in &p.result.appearances {
            let player = tables
                .player_simulation_states
                .iter()
                .find(|s| s.campaign_id == campaign.id && s.simulation_key == a.simulation_key)
                .ok_or_else(|| invalid("Player key is missing."))?;
            tables.simulated_appearances.push(SimulatedAppearanceRow {
                id: appearance_ids
                    .next()
                    .ok_or_else(|| invalid("Appearance ID is missing."))?
                    .clone(),
                campaign_id: campaign.id.clone(),
                fixture_id: fixture_id.clone(),
                player_id: player.player_id.clone(),
                club_id: if a.side == ClubSide::Home {
                    fixture.home_club_id.clone()
                } else {
                    fixture.away_club_id.clone()
                },
                started: a.started,
                minutes: number(i64::from(a.minutes))?,
                goals: number(i64::from(a.goals))?,
                assists: number(i64::from(a.assists))?,
                rating: number(a.rating)?,
                yellow_cards: number(i64::from(a.yellow_cards))?,
                red_cards: number(i64::from(a.red_cards))?,
            });
        }
        updates.extend(p.result.availability);
        tables.simulated_matches.push(SimulatedMatchRow {
            id: match_id.clone(),
            campaign_id: campaign.id.clone(),
            fixture_id,
            home_goals: number(i64::from(p.result.home_goals))?,
            away_goals: number(i64::from(p.result.away_goals))?,
            home_xg_milli: number(p.result.home_xg_milli)?,
            away_xg_milli: number(p.result.away_xg_milli)?,
            timeline: serde_json::to_value(p.result.timeline).map_err(invalid)?,
            input_snapshot: json!({"kickoff": p.input, "chances": p.result.chances}),
            event_seed: number(i64::from(p.result.event_seed))?,
            engine_version: VersionOne,
        });
    }
    for state in tables
        .player_simulation_states
        .iter_mut()
        .filter(|s| s.campaign_id == campaign.id)
    {
        if let Some(delta) = updates
            .iter()
            .find(|d| d.simulation_key == state.simulation_key)
        {
            state.fitness = number(delta.fitness)?;
            state.sharpness = number(delta.sharpness)?;
            state.injury_until_date = delta.injury_until_date.as_ref().map(|d| d.as_str().into());
            state.suspension_matches = number(delta.suspension_matches)?;
        } else if !selected_keys.contains(&state.simulation_key)
            && tables.contracts.iter().any(|c| {
                c.player_id == state.player_id
                    && played_clubs.contains(c.club_id.as_str())
                    && c.status == ContractStatus::Active
                    && c.starts_on
                        .as_deref()
                        .is_none_or(|d| d <= request.target_date.as_str())
                    && c.expires_on
                        .as_deref()
                        .is_none_or(|d| d >= request.target_date.as_str())
            })
        {
            if state
                .injury_until_date
                .as_deref()
                .is_none_or(|d| d <= request.target_date.as_str())
            {
                state.fitness = number((state.fitness.get() + 8).min(100))?;
            }
            state.sharpness = number((state.sharpness.get() - 3).max(0))?;
            state.suspension_matches = number((state.suspension_matches.get() - 1).max(0))?;
        }
    }
    let revision = next_revision(campaign.revision).map_err(invalid)?;
    let next_date = if round.get() == 34 {
        request.target_date.clone()
    } else {
        add_days(&DateOnly::parse(&request.target_date).map_err(invalid)?, 7)
            .map_err(invalid)?
            .as_str()
            .into()
    };
    let phase = if round.get() == 34 {
        CalendarPhase::Review
    } else {
        CalendarPhase::League
    };
    let saved_clock = tables
        .simulation_states
        .iter_mut()
        .find(|s| s.id == clock.id)
        .ok_or_else(|| invalid("Clock is missing."))?;
    saved_clock.current_date = next_date.clone();
    saved_clock.phase = phase;
    saved_clock.last_boundary_key = Some(operation.clone());
    let saved_campaign = tables
        .campaigns
        .iter_mut()
        .find(|c| c.id == campaign.id)
        .ok_or_else(|| invalid("Campaign is missing."))?;
    saved_campaign.revision = revision;
    saved_campaign.updated_at = request.now.clone();
    let event_seed = tables
        .simulated_matches
        .iter()
        .find(|m| m.id == request.match_ids[0])
        .ok_or_else(|| invalid("Match is missing."))?
        .event_seed;
    tables.simulation_receipts.push(SimulationReceiptRow {
        id: request.receipt_id.clone(),
        campaign_id: campaign.id.clone(),
        operation_key: operation.clone(),
        input_revision: request.expected_revision,
        input_fingerprint: fingerprint_hash.into(),
        event_seed,
        simulation_version: VersionOne,
        // A boundary identifies the whole round; receipts retain their existing
        // 32-reference limit even though the round contains 36 matches.
        outcome_refs: vec![
            OutcomeRef::Season {
                id: season.id.clone(),
            },
            OutcomeRef::Boundary {
                key: operation.clone(),
            },
        ],
        created_at: request.now.clone(),
    });
    let payload =
        json!({"matchdayFingerprint": fingerprint_hash, "operationKey": operation, "round": round});
    tables.audit_events.push(AuditEventRow {
        id: request.audit_id.clone(),
        campaign_id: campaign.id.clone(),
        season_id: Some(season.id),
        action_id: request.action_id.clone(),
        action_type: AuditAction::SimulationMatchday,
        created_at: request.now.clone(),
        summary: format!("Played round {}: 36 league fixtures.", round.get()),
        payload: AuditPayload(
            payload
                .as_object()
                .cloned()
                .ok_or_else(|| invalid("Audit could not be encoded."))?,
        ),
    });
    Ok(AdvanceOutcome {
        campaign_id: campaign.id,
        revision,
        replayed: false,
        receipt_id: request.receipt_id.clone(),
        operation_key: operation.clone(),
        current_date: next_date,
        phase,
        last_boundary_key: Some(operation),
    })
}

pub fn view(
    tables: &SnapshotTables,
    id: &EntityId,
    round: Option<SafeInt>,
) -> Result<MatchdayView, CommandError> {
    let (campaign, season, _) = loaded(tables, id)?;
    let exists = tables
        .fixtures
        .iter()
        .any(|f| f.campaign_id == campaign.id && f.season_id == season.id);
    let all = calendar(tables, campaign, season)?;
    let round = round.unwrap_or_else(|| {
        all.iter()
            .filter(|f| f.status == FixtureStatus::Played)
            .map(|f| f.round)
            .max_by_key(|r| r.get())
            .unwrap_or(SafeInt::new(1).expect("one"))
    });
    if !(1..=34).contains(&round.get()) {
        return Err(invalid("Choose a round from 1 to 34."));
    }
    let fixtures = all
        .iter()
        .filter(|f| f.round == round)
        .cloned()
        .collect::<Vec<_>>();
    let fixture_ids = fixtures
        .iter()
        .map(|f| f.id.as_str())
        .collect::<BTreeSet<_>>();
    let mut leagues = Vec::new();
    let mut league_rows = tables
        .leagues
        .iter()
        .filter(|l| l.campaign_id == campaign.id)
        .collect::<Vec<_>>();
    league_rows.sort_by_key(|l| l.tier.map(SafeInt::get));
    for league in league_rows {
        let clubs = tables
            .clubs
            .iter()
            .filter(|c| c.league_id.as_ref() == Some(&league.id))
            .collect::<Vec<_>>();
        let keys = clubs
            .iter()
            .map(|c| {
                tables
                    .club_simulation_states
                    .iter()
                    .find(|s| s.club_id == c.id)
                    .map(|s| s.simulation_key.as_str())
                    .ok_or_else(|| invalid("Club key is missing."))
            })
            .collect::<Result<Vec<_>, _>>()?;
        let mut scores = Vec::new();
        for f in all
            .iter()
            .filter(|f| f.league_id == league.id && f.round.get() <= round.get())
        {
            if let Some(m) = tables
                .simulated_matches
                .iter()
                .find(|m| m.fixture_id == f.id && m.campaign_id == campaign.id)
            {
                let key = |id: &EntityId| {
                    tables
                        .club_simulation_states
                        .iter()
                        .find(|s| &s.club_id == id)
                        .map(|s| s.simulation_key.as_str())
                        .ok_or_else(|| invalid("Club key is missing."))
                };
                scores.push(MatchScore {
                    home_simulation_key: key(&f.home_club_id)?,
                    away_simulation_key: key(&f.away_club_id)?,
                    home_goals: m.home_goals.get(),
                    away_goals: m.away_goals.get(),
                });
            }
        }
        let rows = standings(&keys, &scores)
            .map_err(invalid)?
            .into_iter()
            .map(|r| {
                let state = tables
                    .club_simulation_states
                    .iter()
                    .find(|s| s.simulation_key == r.simulation_key && s.campaign_id == campaign.id)
                    .ok_or_else(|| invalid("Club key is missing."))?;
                let club = clubs
                    .iter()
                    .find(|c| c.id == state.club_id)
                    .ok_or_else(|| invalid("Club is missing."))?;
                Ok(MatchdayTableRow {
                    club_id: club.id.clone(),
                    club_name: club.name.clone(),
                    simulation_key: r.simulation_key,
                    played: number(i64::from(r.played))?,
                    won: number(i64::from(r.won))?,
                    drawn: number(i64::from(r.drawn))?,
                    lost: number(i64::from(r.lost))?,
                    goals_for: number(i64::from(r.goals_for))?,
                    goals_against: number(i64::from(r.goals_against))?,
                    goal_difference: number(i64::from(r.goal_difference))?,
                    points: number(i64::from(r.points))?,
                })
            })
            .collect::<Result<Vec<_>, CommandError>>()?;
        leagues.push(MatchdayLeague {
            name: league.name.clone(),
            rows,
        });
    }
    let mut labels = BTreeMap::new();
    for c in &tables.clubs {
        labels.insert(c.id.as_str().into(), c.name.clone());
    }
    for p in &tables.players {
        labels.insert(p.id.as_str().into(), p.name.clone());
    }
    for p in &tables.player_simulation_states {
        if let Some(name) = labels.get(p.player_id.as_str()).cloned() {
            labels.insert(p.simulation_key.clone(), name);
        }
    }
    Ok(MatchdayView {
        campaign_id: id.clone(),
        round,
        calendar_exists: exists,
        matches: tables
            .simulated_matches
            .iter()
            .filter(|m| m.campaign_id == campaign.id && fixture_ids.contains(m.fixture_id.as_str()))
            .cloned()
            .collect(),
        appearances: tables
            .simulated_appearances
            .iter()
            .filter(|a| a.campaign_id == campaign.id && fixture_ids.contains(a.fixture_id.as_str()))
            .cloned()
            .collect(),
        fixtures,
        labels,
        leagues,
    })
}
