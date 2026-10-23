//! Pure version-one instant matches. No entity ids, persistence, or wall clock.
use crate::{
    dates::{add_days, DateOnly},
    match_selection::{plan_substitutions, ClubSelection, SelectedPlayer},
    random::{derive_event_seed, EventKind, Mulberry32},
    selection::formation_slots,
    CoreError, CoreResult, PositionGroup, SafeInt,
};
use std::collections::BTreeSet;

pub const MATCH_ENGINE_VERSION: &str = "1";
const INVALID: &str = "Invalid match selection.";

pub struct EngineInput<'a> {
    pub root_seed: &'a str,
    pub fixture_key: &'a str,
    pub match_date: DateOnly,
    pub home: &'a ClubSelection,
    pub away: &'a ClubSelection,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ClubSide {
    Home,
    Away,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MatchEventKind {
    Goal,
    Yellow,
    Red,
    Substitution,
    Injury,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchEvent {
    pub kind: MatchEventKind,
    pub minute: u8,
    pub side: ClubSide,
    pub simulation_key: String,
    pub assist_key: Option<String>,
    pub xg_milli: Option<i64>,
    /// Only substitutions use this field; simulation_key is the outgoing player.
    pub incoming_simulation_key: Option<String>,
}

/// All shots, including misses. Goals also appear in the closed event timeline.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineChance {
    pub minute: u8,
    pub side: ClubSide,
    pub simulation_key: String,
    pub xg_milli: i64,
    pub scored: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EngineAppearance {
    pub side: ClubSide,
    pub simulation_key: String,
    pub started: bool,
    pub minutes: u8,
    pub goals: u8,
    pub assists: u8,
    pub rating: i64,
    pub yellow_cards: u8,
    pub red_cards: u8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AvailabilityDelta {
    pub simulation_key: String,
    pub fitness: i64,
    pub sharpness: i64,
    pub injury_until_date: Option<DateOnly>,
    pub suspension_matches: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EngineMatch {
    pub event_seed: u32,
    pub home_goals: u8,
    pub away_goals: u8,
    pub home_xg_milli: i64,
    pub away_xg_milli: i64,
    pub chances: Vec<EngineChance>,
    pub timeline: Vec<MatchEvent>,
    pub appearances: Vec<EngineAppearance>,
    /// Selected players only. The round caller applies the unused-player rule to
    /// contracted roster members outside the supplied selections, without RNG.
    pub availability: Vec<AvailabilityDelta>,
}

fn checked(value: Option<i64>) -> CoreResult<i64> {
    SafeInt::new(value.ok_or(CoreError::Arithmetic)?).map(SafeInt::get)
}

struct Player {
    kickoff: SelectedPlayer,
    group: PositionGroup,
    effective: i64,
    entered: Option<u8>,
    left: u8,
    yellow: u8,
    red: u8,
    injury: Option<DateOnly>,
}
impl Player {
    fn on_pitch(&self, minute: u8) -> bool {
        self.entered.is_some_and(|start| start <= minute) && self.left >= minute
    }
}

struct Team {
    side: ClubSide,
    players: Vec<Player>,
    substitutions: u8,
}
impl Team {
    fn new(selection: &ClubSelection, side: ClubSide) -> CoreResult<Self> {
        plan_substitutions(selection)?; // Shared Ready/formation/identity validation.
        let ClubSelection::Ready {
            formation, players, ..
        } = selection
        else {
            return Err(CoreError::Invalid(INVALID));
        };
        let mut ordered = Vec::new();
        for &(slot, group) in formation_slots(*formation) {
            ordered.push((
                players
                    .iter()
                    .find(|p| p.started && p.slot == slot)
                    .unwrap(),
                group,
            ));
        }
        ordered.extend(
            players
                .iter()
                .filter(|p| !p.started)
                .map(|p| (p, p.position_group)),
        );
        let players = ordered
            .into_iter()
            .map(|(p, group)| {
                SafeInt::new(p.effective)?;
                SafeInt::new(p.suspension_matches)?;
                if p.effective < 0
                    || p.suspension_matches < 0
                    || crate::js_trim(&p.simulation_key) != p.simulation_key
                    || p.simulation_key.chars().any(char::is_control)
                {
                    return Err(CoreError::Invalid(INVALID));
                }
                let advantage = if side == ClubSide::Home && p.started {
                    if group == PositionGroup::Gk {
                        2
                    } else {
                        4
                    }
                } else {
                    0
                };
                Ok(Player {
                    kickoff: p.clone(),
                    group,
                    effective: checked(p.effective.checked_add(advantage))?,
                    entered: p.started.then_some(0),
                    left: 90,
                    yellow: 0,
                    red: 0,
                    injury: None,
                })
            })
            .collect::<CoreResult<Vec<_>>>()?;
        Ok(Self {
            side,
            players,
            substitutions: 0,
        })
    }

    fn strength(&self, attack: bool) -> CoreResult<i64> {
        self.players
            .iter()
            .take(11)
            .filter(|p| matches!(p.group, PositionGroup::Fwd | PositionGroup::Mid) == attack)
            .try_fold(0_i64, |sum, p| checked(sum.checked_add(p.effective)))
    }

    fn event(&self, index: usize, minute: u8, kind: MatchEventKind) -> MatchEvent {
        MatchEvent {
            kind,
            minute,
            side: self.side,
            simulation_key: self.players[index].kickoff.simulation_key.clone(),
            assist_key: None,
            xg_milli: None,
            incoming_simulation_key: None,
        }
    }

    fn substitute(
        &mut self,
        outgoing: usize,
        incoming: usize,
        minute: u8,
        timeline: &mut Vec<MatchEvent>,
    ) {
        let mut event = self.event(outgoing, minute, MatchEventKind::Substitution);
        event.incoming_simulation_key = Some(self.players[incoming].kickoff.simulation_key.clone());
        timeline.push(event);
        self.players[outgoing].left = minute;
        self.players[incoming].entered = Some(minute);
        self.substitutions += 1;
    }
}

/// RNG order (version 1): one conversion draw per alternating chance; then
/// home starters followed by away starters in formation order, each with yellow
/// then straight-red draws at 30 and 75. A dismissal ends that player's draws.
/// Card windows are the v1 policy for the otherwise unspecified second yellow.
/// No card is rolled after a planned exit. Substitutions consume no draws.
/// Finally home then away, active players in slot order: injury risk, and only
/// on injury a duration draw. Injury minute is 89 (after the last chance).
/// Replacements are not rolled again. Stable timeline sorting preserves insertion
/// order for equal minute/side, including second-yellow then red.
pub fn simulate_fixture(input: &EngineInput<'_>) -> CoreResult<EngineMatch> {
    let event_seed = derive_event_seed(
        input.root_seed,
        "1",
        EventKind::Fixture,
        &[input.fixture_key],
    )?;
    let mut rng = Mulberry32::new(event_seed);
    let mut teams = [
        Team::new(input.home, ClubSide::Home)?,
        Team::new(input.away, ClubSide::Away)?,
    ];
    let mut keys = BTreeSet::new();
    if teams
        .iter()
        .flat_map(|t| &t.players)
        .any(|p| !keys.insert(&p.kickoff.simulation_key))
    {
        return Err(CoreError::Invalid(INVALID));
    }
    let attacks = [teams[0].strength(true)?, teams[1].strength(true)?];
    let defenses = [teams[0].strength(false)?, teams[1].strength(false)?];
    let counts = [
        checked(10_i64.checked_add(checked(attacks[0].checked_sub(defenses[1]))? / 50))?
            .clamp(4, 16) as usize,
        checked(8_i64.checked_add(checked(attacks[1].checked_sub(defenses[0]))? / 50))?.clamp(3, 16)
            as usize,
    ];
    let shooters = teams
        .iter()
        .map(|team| {
            [PositionGroup::Fwd, PositionGroup::Mid]
                .into_iter()
                .flat_map(|group| {
                    team.players
                        .iter()
                        .take(11)
                        .enumerate()
                        .filter_map(move |(i, p)| (p.group == group).then_some(i))
                })
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    let mut order = Vec::new();
    for i in 0..counts[0].max(counts[1]) {
        if i < counts[0] {
            order.push(0);
        }
        if i < counts[1] {
            order.push(1);
        }
    }
    let mut result = EngineMatch {
        event_seed,
        home_goals: 0,
        away_goals: 0,
        home_xg_milli: 0,
        away_xg_milli: 0,
        chances: Vec::new(),
        timeline: Vec::new(),
        appearances: Vec::new(),
        availability: Vec::new(),
    };
    let mut shot_index = [0, 0];
    let mut goals = [0_u8, 0];
    let mut xg = [0_i64, 0];
    for (i, &side) in order.iter().enumerate() {
        let team = &teams[side];
        let rotation = &shooters[side];
        let shooter = rotation[shot_index[side] % rotation.len()];
        let defender_count = teams[1 - side]
            .players
            .iter()
            .take(11)
            .filter(|p| matches!(p.group, PositionGroup::Gk | PositionGroup::Def))
            .count() as i64;
        let chance = checked(
            checked(40_i64.checked_add(checked(team.players[shooter].effective.checked_mul(2))?))?
                .checked_sub(defenses[1 - side] / defender_count.max(1) / 2),
        )?
        .clamp(20, 800);
        let minute = (1 + i * 88 / order.len()) as u8;
        let scored = rng.next_int(1000)? < chance;
        xg[side] = checked(xg[side].checked_add(chance))?;
        if scored {
            goals[side] = goals[side].checked_add(1).ok_or(CoreError::Arithmetic)?;
            let mut event = team.event(shooter, minute, MatchEventKind::Goal);
            event.xg_milli = Some(chance);
            if shot_index[side] > 0 {
                let previous = rotation[(shot_index[side] - 1) % rotation.len()];
                event.assist_key = Some(team.players[previous].kickoff.simulation_key.clone());
            }
            result.timeline.push(event);
        }
        result.chances.push(EngineChance {
            minute,
            side: team.side,
            simulation_key: team.players[shooter].kickoff.simulation_key.clone(),
            xg_milli: chance,
            scored,
        });
        shot_index[side] += 1;
    }
    if goals.iter().any(|&g| g > 15) {
        return Err(CoreError::Invalid(
            "Match score exceeds the supported range.",
        ));
    }
    for (side, selection) in [input.home, input.away].into_iter().enumerate() {
        let team = &mut teams[side];
        let plans = plan_substitutions(selection)?;
        for index in 0..11 {
            let planned_exit = plans
                .iter()
                .find(|p| p.outgoing_simulation_key == team.players[index].kickoff.simulation_key)
                .map(|p| p.minute);
            for minute in [30, 75] {
                if planned_exit.is_some_and(|exit| exit < minute) {
                    break;
                }
                if rng.next_int(100)? < 8 {
                    team.players[index].yellow += 1;
                    result
                        .timeline
                        .push(team.event(index, minute, MatchEventKind::Yellow));
                    if team.players[index].yellow == 2 {
                        team.players[index].red = 1;
                    }
                }
                if team.players[index].red == 0 && rng.next_int(100)? < 1 {
                    team.players[index].red = 1;
                }
                if team.players[index].red != 0 {
                    team.players[index].left = minute;
                    result
                        .timeline
                        .push(team.event(index, minute, MatchEventKind::Red));
                    break;
                }
            }
        }
        for plan in plans {
            let outgoing = team
                .players
                .iter()
                .position(|p| p.kickoff.simulation_key == plan.outgoing_simulation_key)
                .unwrap();
            let incoming = team
                .players
                .iter()
                .position(|p| p.kickoff.simulation_key == plan.incoming_simulation_key)
                .unwrap();
            if team.substitutions < 5
                && team.players[outgoing].on_pitch(plan.minute)
                && !(team.players[outgoing].red != 0 && team.players[outgoing].left <= plan.minute)
            {
                team.substitute(outgoing, incoming, plan.minute, &mut result.timeline);
            }
        }
    }
    for team in &mut teams {
        // Visit current occupants in original starter-slot order, not bench order.
        let occupants = (0..11)
            .filter_map(|i| {
                if team.players[i].on_pitch(89) {
                    Some(i)
                } else {
                    result
                        .timeline
                        .iter()
                        .find(|e| {
                            e.side == team.side
                                && e.kind == MatchEventKind::Substitution
                                && e.simulation_key == team.players[i].kickoff.simulation_key
                        })
                        .and_then(|e| {
                            team.players.iter().position(|p| {
                                Some(&p.kickoff.simulation_key)
                                    == e.incoming_simulation_key.as_ref()
                            })
                        })
                }
            })
            .collect::<Vec<_>>();
        for index in occupants {
            let injury_risk = checked(30_i64.checked_add(checked(
                100_i64.checked_sub(team.players[index].kickoff.fitness),
            )?))?;
            if rng.next_int(1000)? >= injury_risk {
                continue;
            }
            let until = add_days(
                &input.match_date,
                checked(7_i64.checked_add(rng.next_int(22)?))?,
            )?;
            team.players[index].injury = Some(
                team.players[index]
                    .kickoff
                    .injury_until_date
                    .clone()
                    .map_or(until.clone(), |old| old.max(until)),
            );
            result
                .timeline
                .push(team.event(index, 89, MatchEventKind::Injury));
            let group = team.players[index].kickoff.position_group;
            let replacement = team
                .players
                .iter()
                .enumerate()
                .filter(|(_, p)| {
                    !p.kickoff.started
                        && p.entered.is_none()
                        && p.kickoff.position_group == group
                        && p.kickoff.suspension_matches == 0
                        && p.kickoff
                            .injury_until_date
                            .as_ref()
                            .is_none_or(|d| d <= &input.match_date)
                })
                .min_by(|(_, a), (_, b)| {
                    b.effective
                        .cmp(&a.effective)
                        .then_with(|| b.kickoff.fitness.cmp(&a.kickoff.fitness))
                        .then_with(|| b.kickoff.sharpness.cmp(&a.kickoff.sharpness))
                        .then_with(|| a.kickoff.simulation_key.cmp(&b.kickoff.simulation_key))
                })
                .map(|(i, _)| i);
            if let Some(incoming) = replacement.filter(|_| team.substitutions < 5) {
                team.substitute(index, incoming, 89, &mut result.timeline);
            } else {
                team.players[index].left = 89;
            }
        }
    }
    result.home_goals = goals[0];
    result.away_goals = goals[1];
    result.home_xg_milli = xg[0];
    result.away_xg_milli = xg[1];
    result.timeline.sort_by_key(|e| (e.minute, e.side));
    for (side, team) in teams.iter().enumerate() {
        for p in &team.players {
            let minutes = p.entered.map_or(Ok(0), |start| {
                p.left.checked_sub(start).ok_or(CoreError::Arithmetic)
            })?;
            let injured = p.injury.is_some()
                || p.kickoff
                    .injury_until_date
                    .as_ref()
                    .is_some_and(|d| d > &input.match_date);
            let (fitness, sharpness) = if minutes == 0 {
                (
                    if injured {
                        p.kickoff.fitness
                    } else {
                        checked(p.kickoff.fitness.checked_add(8))?.min(100)
                    },
                    checked(p.kickoff.sharpness.checked_sub(3))?.max(0),
                )
            } else {
                let fitness =
                    checked(
                        p.kickoff
                            .fitness
                            .checked_sub(if minutes == 90 { 12 } else { 6 }),
                    )?
                    .clamp(40, 100);
                (
                    if injured {
                        fitness.min(p.kickoff.fitness)
                    } else {
                        fitness
                    },
                    if injured {
                        p.kickoff.sharpness
                    } else {
                        checked(
                            p.kickoff
                                .sharpness
                                .checked_add(if minutes == 90 { 4 } else { 2 }),
                        )?
                        .min(100)
                    },
                )
            };
            // Serve an existing ban first, then add this match's new ban.
            let served = if p.kickoff.suspension_matches > 0 {
                checked(p.kickoff.suspension_matches.checked_sub(1))?
            } else {
                0
            };
            result.availability.push(AvailabilityDelta {
                simulation_key: p.kickoff.simulation_key.clone(),
                fitness,
                sharpness,
                injury_until_date: p
                    .injury
                    .clone()
                    .or_else(|| p.kickoff.injury_until_date.clone()),
                suspension_matches: checked(served.checked_add(i64::from(p.red)))?,
            });
            if minutes == 0 {
                continue;
            }
            let player_goals = result
                .timeline
                .iter()
                .filter(|e| {
                    e.kind == MatchEventKind::Goal && e.simulation_key == p.kickoff.simulation_key
                })
                .count() as u8;
            let assists = result
                .timeline
                .iter()
                .filter(|e| {
                    e.kind == MatchEventKind::Goal
                        && e.assist_key.as_ref() == Some(&p.kickoff.simulation_key)
                })
                .count() as u8;
            let conceded = if p.group == PositionGroup::Gk {
                i64::from(goals[1 - side])
            } else {
                0
            };
            let bonus = match goals[side].cmp(&goals[1 - side]) {
                std::cmp::Ordering::Greater => 8,
                std::cmp::Ordering::Equal => 0,
                std::cmp::Ordering::Less => -6,
            };
            let clean_sheet = if p.group == PositionGroup::Gk && conceded == 0 {
                6
            } else {
                0
            };
            let mut rating =
                checked(60_i64.checked_add(checked(i64::from(player_goals).checked_mul(8))?))?;
            rating = checked(rating.checked_add(checked(i64::from(assists).checked_mul(4))?))?;
            rating = checked(rating.checked_add(bonus))?;
            rating = checked(rating.checked_add(clean_sheet))?;
            rating = checked(rating.checked_sub(conceded))?;
            result.appearances.push(EngineAppearance {
                side: team.side,
                simulation_key: p.kickoff.simulation_key.clone(),
                started: p.kickoff.started,
                minutes,
                goals: player_goals,
                assists,
                rating: rating.clamp(1, 99),
                yellow_cards: p.yellow,
                red_cards: p.red,
            });
        }
    }
    Ok(result)
}
