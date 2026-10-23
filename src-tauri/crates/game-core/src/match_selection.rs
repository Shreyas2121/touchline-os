//! Pure match selection. Callers supply one club's campaign-scoped roster and lineups.
use crate::{
    ability::role_ability,
    dates::DateOnly,
    selection::{formation_slots, lineup_problems, LineupDraft},
    CoreError, CoreResult, Formation, LineupRow, PlayerAttributes, PlayerLife, PositionGroup,
    RegistrationStatus,
};
use std::collections::BTreeSet;

pub const LINEUP_REQUIRED: &str = "Select a legal lineup before this matchday.";
pub const INSUFFICIENT_PLAYERS: &str = "This club cannot field 11 contracted players.";
const INVALID_SQUAD: &str = "Match squad data is incomplete or inconsistent.";

#[derive(Debug, Clone, Copy)]
pub struct MatchRegistration<'a> {
    pub competition_key: &'a str,
    pub status: RegistrationStatus,
    pub age_exempt: Option<bool>,
}

#[derive(Debug, Clone, Copy)]
pub struct MatchPlayer<'a> {
    /// Used only to resolve a saved lineup, never for ranking.
    pub player_id: &'a str,
    pub simulation_key: &'a str,
    pub position_group: PositionGroup,
    pub attributes: &'a PlayerAttributes,
    pub goalkeeping: Option<i64>,
    pub fitness: i64,
    pub sharpness: i64,
    pub life: PlayerLife,
    /// The contract must be active at this club on the match date.
    pub contract_active: bool,
    pub injury_until_date: Option<&'a DateOnly>,
    pub suspension_matches: i64,
    pub registration: Option<MatchRegistration<'a>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SelectionMode {
    SavedLineup,
    /// Automatic selection; the managed-club report labels this Emergency selection.
    Emergency,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SelectedPlayer {
    pub simulation_key: String,
    pub slot: String,
    pub started: bool,
    pub effective: i64,
    /// Kickoff facts retained for the deterministic substitution policy.
    pub position_group: PositionGroup,
    pub fitness: i64,
    pub sharpness: i64,
    pub injury_until_date: Option<DateOnly>,
    pub suspension_matches: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ClubSelection {
    Ready {
        mode: SelectionMode,
        formation: Formation,
        players: Vec<SelectedPlayer>,
    },
    Blocked {
        message: &'static str,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlannedSub {
    pub minute: u8,
    pub outgoing_simulation_key: String,
    pub incoming_simulation_key: String,
}

/// Home advantage is deliberately applied later by the engine.
pub fn effective_strength(
    attributes: &PlayerAttributes,
    player_group: PositionGroup,
    slot_group: PositionGroup,
    goalkeeping: Option<i64>,
    fitness: i64,
    sharpness: i64,
) -> CoreResult<i64> {
    if !(0..=100).contains(&fitness)
        || !(0..=100).contains(&sharpness)
        || slot_group == PositionGroup::Unknown
    {
        return Err(CoreError::Invalid(INVALID_SQUAD));
    }
    // Validate all attributes even when a stored goalkeeping rating replaces the base.
    let role = role_ability(attributes, player_group)?.get();
    let base = if player_group == PositionGroup::Gk {
        goalkeeping
            .filter(|v| (0..=100).contains(v))
            .unwrap_or(role)
    } else {
        role
    };
    let slot_base = if player_group == slot_group {
        base
    } else if player_group == PositionGroup::Gk || slot_group == PositionGroup::Gk {
        base / 2
    } else {
        base.checked_mul(3).ok_or(CoreError::Arithmetic)? / 4
    };
    let fit = slot_base
        .checked_mul(fitness)
        .ok_or(CoreError::Arithmetic)?
        / 100;
    fit.checked_mul(50_i64.checked_add(sharpness).ok_or(CoreError::Arithmetic)?)
        .map(|value| value / 150)
        .ok_or(CoreError::Arithmetic)
}

fn injured(player: &MatchPlayer<'_>, date: &DateOnly) -> bool {
    player.injury_until_date.is_some_and(|until| date < until)
}
fn available(player: &MatchPlayer<'_>, date: &DateOnly) -> bool {
    !injured(player, date) && player.suspension_matches == 0
}
fn contracted(player: &MatchPlayer<'_>) -> bool {
    player.contract_active && player.life == PlayerLife::Active
}
fn registered(player: &MatchPlayer<'_>) -> bool {
    player.registration.is_some_and(|r| {
        r.competition_key == "league"
            && (r.status == RegistrationStatus::Registered || r.age_exempt == Some(true))
    })
}
fn strength(player: &MatchPlayer<'_>, group: PositionGroup) -> CoreResult<i64> {
    effective_strength(
        player.attributes,
        player.position_group,
        group,
        player.goalkeeping,
        player.fitness,
        player.sharpness,
    )
}
fn selected(
    player: &MatchPlayer<'_>,
    slot: &str,
    group: PositionGroup,
    started: bool,
) -> CoreResult<SelectedPlayer> {
    Ok(SelectedPlayer {
        simulation_key: player.simulation_key.into(),
        slot: slot.into(),
        started,
        effective: strength(player, group)?,
        position_group: player.position_group,
        fitness: player.fitness,
        sharpness: player.sharpness,
        injury_until_date: player.injury_until_date.cloned(),
        suspension_matches: player.suspension_matches,
    })
}
fn validate_roster(players: &[MatchPlayer<'_>]) -> CoreResult<()> {
    let mut ids = BTreeSet::new();
    let mut keys = BTreeSet::new();
    for player in players {
        if player.player_id.is_empty()
            || player.simulation_key.is_empty()
            || crate::js_trim(player.simulation_key) != player.simulation_key
            || player.simulation_key.chars().any(char::is_control)
            || !ids.insert(player.player_id)
            || !keys.insert(player.simulation_key)
            || player.suspension_matches < 0
        {
            return Err(CoreError::Invalid(INVALID_SQUAD));
        }
        if contracted(player) {
            strength(player, player.position_group)?;
        }
    }
    Ok(())
}

pub fn select_managed_club(
    players: &[MatchPlayer<'_>],
    lineups: &[LineupRow],
    active_season_id: &str,
    match_date: &DateOnly,
) -> ClubSelection {
    let selection = || -> CoreResult<ClubSelection> {
        validate_roster(players)?;
        let eligible = players
            .iter()
            .filter(|p| contracted(p) && available(p, match_date) && registered(p))
            .collect::<Vec<_>>();
        let latest = lineups
            .iter()
            .filter(|l| l.season_id.as_str() == active_season_id)
            .min_by(|a, b| {
                b.updated_at
                    .cmp(&a.updated_at)
                    .then_with(|| a.id.as_str().cmp(b.id.as_str()))
            });
        if let Some(lineup) = latest {
            if let Some(players) = saved_selection(lineup, &eligible)? {
                return Ok(ClubSelection::Ready {
                    mode: SelectionMode::SavedLineup,
                    formation: lineup.formation,
                    players,
                });
            }
        }
        if eligible.len() >= 11
            && eligible
                .iter()
                .any(|p| p.position_group == PositionGroup::Gk)
        {
            return Ok(ClubSelection::Blocked {
                message: LINEUP_REQUIRED,
            });
        }
        automatic_selection(players, match_date)
    };
    selection().unwrap_or(ClubSelection::Blocked {
        message: INVALID_SQUAD,
    })
}

fn saved_selection(
    lineup: &LineupRow,
    eligible: &[&MatchPlayer<'_>],
) -> CoreResult<Option<Vec<SelectedPlayer>>> {
    let draft = LineupDraft {
        name: lineup.name.clone(),
        formation: lineup.formation,
        starters: lineup.starters.clone(),
        bench_player_ids: lineup
            .bench_player_ids
            .iter()
            .map(|id| id.as_str().into())
            .collect(),
    };
    let ids = eligible.iter().map(|p| p.player_id).collect::<Vec<_>>();
    // Extra saved bench slots are ignored, but must not hide duplicate identities.
    let all_ids = draft
        .starters
        .iter()
        .map(|s| s.player_id.as_str())
        .chain(draft.bench_player_ids.iter().map(String::as_str))
        .collect::<Vec<_>>();
    if all_ids.iter().copied().collect::<BTreeSet<_>>().len() != all_ids.len()
        || draft.bench_player_ids.len() > 12
    {
        return Ok(None);
    }
    let draft = LineupDraft {
        bench_player_ids: draft.bench_player_ids.into_iter().take(9).collect(),
        ..draft
    };
    if !lineup_problems(&draft, &ids).is_empty() || draft.starters.len() != 11 {
        return Ok(None);
    }
    let mut result = Vec::new();
    for &(slot, group) in formation_slots(lineup.formation) {
        let Some(starter) = lineup.starters.iter().find(|s| s.slot == slot) else {
            return Ok(None);
        };
        let player = eligible
            .iter()
            .find(|p| p.player_id == starter.player_id.as_str())
            .expect("validated roster");
        if group == PositionGroup::Gk && player.position_group != PositionGroup::Gk {
            return Ok(None);
        }
        result.push(selected(player, slot, group, true)?);
    }
    for id in lineup.bench_player_ids.iter().take(9) {
        let player = eligible
            .iter()
            .find(|p| p.player_id == id.as_str())
            .expect("validated roster");
        result.push(selected(player, "bench", player.position_group, false)?);
    }
    Ok(Some(result))
}

pub fn select_ai_club(
    players: &[MatchPlayer<'_>],
    match_date: &DateOnly,
) -> CoreResult<ClubSelection> {
    validate_roster(players)?;
    automatic_selection(players, match_date)
}

fn automatic_selection(players: &[MatchPlayer<'_>], date: &DateOnly) -> CoreResult<ClubSelection> {
    let contracted = players.iter().filter(|p| contracted(p)).collect::<Vec<_>>();
    let allow_injured = contracted.iter().filter(|p| !injured(p, date)).count() < 11;
    let allow_suspended = contracted
        .iter()
        .filter(|p| p.suspension_matches == 0)
        .count()
        < 11;
    let mut pool = contracted
        .into_iter()
        .filter(|p| {
            (!injured(p, date) || allow_injured) && (p.suspension_matches == 0 || allow_suspended)
        })
        .collect::<Vec<_>>();
    if pool.len() < 11 {
        return Ok(ClubSelection::Blocked {
            message: INSUFFICIENT_PLAYERS,
        });
    }
    let mut selected_players = Vec::new();
    for &(slot, group) in formation_slots(Formation::F433) {
        pool.sort_by(|a, b| {
            let goalkeeper = |p: &MatchPlayer<'_>| {
                group == PositionGroup::Gk && p.position_group == PositionGroup::Gk
            };
            goalkeeper(b)
                .cmp(&goalkeeper(a))
                .then_with(|| available(b, date).cmp(&available(a, date)))
                .then_with(|| {
                    strength(b, group)
                        .expect("validated strength")
                        .cmp(&strength(a, group).expect("validated strength"))
                })
                .then_with(|| b.fitness.cmp(&a.fitness))
                .then_with(|| b.sharpness.cmp(&a.sharpness))
                .then_with(|| a.simulation_key.cmp(b.simulation_key))
        });
        let player = pool.remove(0);
        selected_players.push(selected(player, slot, group, true)?);
    }
    // Injured or suspended emergency starters may be necessary; bench replacements are available.
    pool.retain(|p| available(p, date));
    pool.sort_by(|a, b| {
        strength(b, b.position_group)
            .expect("validated strength")
            .cmp(&strength(a, a.position_group).expect("validated strength"))
            .then_with(|| b.fitness.cmp(&a.fitness))
            .then_with(|| b.sharpness.cmp(&a.sharpness))
            .then_with(|| a.simulation_key.cmp(b.simulation_key))
    });
    for player in pool.into_iter().take(9) {
        selected_players.push(selected(player, "bench", player.position_group, false)?);
    }
    Ok(ClubSelection::Ready {
        mode: SelectionMode::Emergency,
        formation: Formation::F433,
        players: selected_players,
    })
}

/// Walk formation slot order and retain bench order; G04 orders the resulting events by minute.
pub fn plan_substitutions(selection: &ClubSelection) -> CoreResult<Vec<PlannedSub>> {
    let ClubSelection::Ready {
        formation, players, ..
    } = selection
    else {
        return Err(CoreError::Invalid(LINEUP_REQUIRED));
    };
    let mut keys = BTreeSet::new();
    let slots = formation_slots(*formation);
    if players.iter().filter(|p| p.started).count() != 11
        || players.iter().filter(|p| !p.started).count() > 9
        || players.iter().any(|p| {
            !keys.insert(p.simulation_key.as_str())
                || p.simulation_key.is_empty()
                || !(0..=100).contains(&p.fitness)
                || !(0..=100).contains(&p.sharpness)
                || p.position_group == PositionGroup::Unknown
        })
    {
        return Err(CoreError::Invalid(INVALID_SQUAD));
    }
    let mut used = BTreeSet::new();
    let mut planned = Vec::new();
    for &(slot, _) in slots {
        let starters = players
            .iter()
            .filter(|p| p.started && p.slot == slot)
            .collect::<Vec<_>>();
        if starters.len() != 1 {
            return Err(CoreError::Invalid(INVALID_SQUAD));
        }
        let starter = starters[0];
        if planned.len() == 5 || starter.fitness >= 80 {
            continue;
        }
        if let Some(incoming) = players.iter().find(|p| {
            !p.started
                && p.position_group == starter.position_group
                && p.fitness > starter.fitness
                && !used.contains(p.simulation_key.as_str())
        }) {
            used.insert(incoming.simulation_key.as_str());
            planned.push(PlannedSub {
                minute: if starter.fitness < 60 { 60 } else { 75 },
                outgoing_simulation_key: starter.simulation_key.clone(),
                incoming_simulation_key: incoming.simulation_key.clone(),
            });
        }
    }
    Ok(planned)
}
