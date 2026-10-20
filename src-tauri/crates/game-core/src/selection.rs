use crate::{Formation, LineupStarter, PlayerRow, PlayerSimulationStateRow, PositionGroup};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// Only selection identities/groups belong here. SVG coordinates remain presentation.
pub fn formation_slots(formation: Formation) -> &'static [(&'static str, PositionGroup)] {
    use PositionGroup::{Def, Fwd, Gk, Mid};
    match formation {
        Formation::F433 => &[
            ("gk", Gk),
            ("rb", Def),
            ("rcb", Def),
            ("lcb", Def),
            ("lb", Def),
            ("rcm", Mid),
            ("cm", Mid),
            ("lcm", Mid),
            ("rw", Fwd),
            ("st", Fwd),
            ("lw", Fwd),
        ],
        Formation::F4231 => &[
            ("gk", Gk),
            ("rb", Def),
            ("rcb", Def),
            ("lcb", Def),
            ("lb", Def),
            ("rdm", Mid),
            ("ldm", Mid),
            ("rw", Fwd),
            ("cam", Mid),
            ("lw", Fwd),
            ("st", Fwd),
        ],
        Formation::F442 => &[
            ("gk", Gk),
            ("rb", Def),
            ("rcb", Def),
            ("lcb", Def),
            ("lb", Def),
            ("rm", Mid),
            ("rcm", Mid),
            ("lcm", Mid),
            ("lm", Mid),
            ("rst", Fwd),
            ("lst", Fwd),
        ],
        Formation::F352 => &[
            ("gk", Gk),
            ("rcb", Def),
            ("cb", Def),
            ("lcb", Def),
            ("rwb", Def),
            ("rcm", Mid),
            ("cm", Mid),
            ("lcm", Mid),
            ("lwb", Def),
            ("rst", Fwd),
            ("lst", Fwd),
        ],
    }
}
pub fn position_fit(group: PositionGroup, slot_group: PositionGroup) -> &'static str {
    if group == PositionGroup::Unknown {
        "Unknown position"
    } else if group == slot_group {
        "Position fit"
    } else {
        "Different position"
    }
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LineupDraft {
    pub name: String,
    pub formation: Formation,
    pub starters: Vec<LineupStarter>,
    pub bench_player_ids: Vec<String>,
}
pub fn empty_draft() -> LineupDraft {
    LineupDraft {
        name: String::new(),
        formation: Formation::F433,
        starters: vec![],
        bench_player_ids: vec![],
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PlaceCode {
    UnknownPlayer,
    UnknownSlot,
    BenchFull,
}
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(untagged)]
pub enum PlaceResult {
    Success {
        ok: bool,
        draft: LineupDraft,
    },
    Failure {
        ok: bool,
        draft: LineupDraft,
        code: PlaceCode,
    },
}
fn failed(draft: &LineupDraft, code: PlaceCode) -> PlaceResult {
    PlaceResult::Failure {
        ok: false,
        draft: draft.clone(),
        code,
    }
}
pub fn place_on_slot(
    draft: &LineupDraft,
    player_id: &str,
    slot_id: &str,
    roster_ids: &[&str],
) -> PlaceResult {
    if !roster_ids.contains(&player_id) {
        return failed(draft, PlaceCode::UnknownPlayer);
    }
    if !formation_slots(draft.formation)
        .iter()
        .any(|(id, _)| *id == slot_id)
    {
        return failed(draft, PlaceCode::UnknownSlot);
    }
    // Persisted roster IDs are validated; reject a malformed direct-call ID too.
    let Ok(id) = crate::EntityId::new(player_id) else {
        return failed(draft, PlaceCode::UnknownPlayer);
    };
    let mut next = draft.clone();
    next.starters
        .retain(|starter| starter.player_id.as_str() != player_id && starter.slot != slot_id);
    next.starters.push(LineupStarter {
        player_id: id,
        slot: slot_id.into(),
        role: None,
    });
    next.bench_player_ids.retain(|id| id != player_id);
    PlaceResult::Success {
        ok: true,
        draft: next,
    }
}
pub fn place_on_bench(draft: &LineupDraft, player_id: &str, roster_ids: &[&str]) -> PlaceResult {
    if !roster_ids.contains(&player_id) {
        return failed(draft, PlaceCode::UnknownPlayer);
    }
    let benched = draft.bench_player_ids.iter().any(|id| id == player_id);
    if !benched && draft.bench_player_ids.len() >= 12 {
        return failed(draft, PlaceCode::BenchFull);
    }
    let mut next = draft.clone();
    next.starters.retain(|s| s.player_id.as_str() != player_id);
    if !benched {
        next.bench_player_ids.push(player_id.into());
    }
    PlaceResult::Success {
        ok: true,
        draft: next,
    }
}
pub fn clear_slot(draft: &LineupDraft, slot_id: &str) -> LineupDraft {
    let mut next = draft.clone();
    if formation_slots(draft.formation)
        .iter()
        .any(|(id, _)| *id == slot_id)
    {
        next.starters.retain(|s| s.slot != slot_id);
    }
    next
}
pub fn switch_formation(draft: &LineupDraft, formation: Formation) -> LineupDraft {
    LineupDraft {
        formation,
        starters: vec![],
        ..draft.clone()
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LineupProblem {
    DuplicatePlayer,
    DuplicateSlot,
    UnknownSlot,
    BenchTooLong,
    TooManyStarters,
    UnknownPlayer,
}
pub fn lineup_problems(draft: &LineupDraft, roster_ids: &[&str]) -> Vec<LineupProblem> {
    let mut problems = Vec::new();
    let players = draft
        .starters
        .iter()
        .map(|s| s.player_id.as_str())
        .chain(draft.bench_player_ids.iter().map(String::as_str))
        .collect::<Vec<_>>();
    let slots = draft
        .starters
        .iter()
        .map(|s| s.slot.as_str())
        .collect::<Vec<_>>();
    if players.iter().copied().collect::<BTreeSet<_>>().len() != players.len() {
        problems.push(LineupProblem::DuplicatePlayer);
    }
    if slots.iter().copied().collect::<BTreeSet<_>>().len() != slots.len() {
        problems.push(LineupProblem::DuplicateSlot);
    }
    let valid_slots = formation_slots(draft.formation);
    if slots
        .iter()
        .any(|slot| !valid_slots.iter().any(|(id, _)| id == slot))
    {
        problems.push(LineupProblem::UnknownSlot);
    }
    if draft.bench_player_ids.len() > 12 {
        problems.push(LineupProblem::BenchTooLong);
    }
    if draft.starters.len() > 11 {
        problems.push(LineupProblem::TooManyStarters);
    }
    if players.iter().any(|id| !roster_ids.contains(id)) {
        problems.push(LineupProblem::UnknownPlayer);
    }
    problems
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationDraft {
    pub status: crate::RegistrationStatus,
    pub homegrown_club: Option<bool>,
    pub homegrown_nation: Option<bool>,
    pub age_exempt: Option<bool>,
}
pub fn unsaved_registration_draft(
    player: &PlayerRow,
    profile: Option<&PlayerSimulationStateRow>,
) -> RegistrationDraft {
    let profile = profile.filter(|profile| {
        profile.campaign_id == player.campaign_id && profile.player_id == player.id
    });
    match profile {
        None => RegistrationDraft {
            status: crate::RegistrationStatus::Unknown,
            homegrown_club: None,
            homegrown_nation: None,
            age_exempt: None,
        },
        Some(profile) => RegistrationDraft {
            status: crate::RegistrationStatus::Unknown,
            homegrown_club: Some(profile.homegrown_club),
            homegrown_nation: Some(profile.homegrown_nation),
            age_exempt: player.reported_age.map(|age| age.get() < 21),
        },
    }
}
