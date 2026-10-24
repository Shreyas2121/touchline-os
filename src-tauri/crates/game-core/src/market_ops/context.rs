//! Validated campaign context, identity lookups, and shared market guards.
use crate::calendar;
use crate::dates::add_days;
use crate::dates::validate_timestamp;
use crate::dates::DateOnly;
use crate::policy::QualificationRule;
use crate::{
    CampaignMode, CampaignRow, CampaignStatus, ClubSimulationStateRow, CommandError,
    ConstitutionRow, ConstitutionRule, CoreError, EntityId, MoneyCents, NegotiationStatus,
    PlayerSimulationStateRow, SafeInt, SeasonRow, SimulationStateRow, SnapshotTables, SquadTier,
};

pub(super) fn invalid(message: impl ToString) -> CommandError {
    CommandError::Validation {
        message: message.to_string(),
    }
}

pub(super) fn conflict(message: &str) -> CommandError {
    CommandError::Conflict {
        message: message.into(),
    }
}

pub(super) fn core(error: CoreError) -> CommandError {
    invalid(error.to_string())
}

pub(super) fn money(value: i64) -> Result<MoneyCents, CommandError> {
    MoneyCents::new(value).map_err(core)
}

pub(super) fn number(value: i64) -> Result<SafeInt, CommandError> {
    SafeInt::new(value).map_err(core)
}

pub(super) fn zero() -> MoneyCents {
    MoneyCents::new(0).expect("zero")
}

pub(super) fn loaded<'a>(
    tables: &'a SnapshotTables,
    id: &EntityId,
) -> Result<(&'a CampaignRow, &'a SeasonRow, &'a SimulationStateRow), CommandError> {
    let campaign = tables
        .campaigns
        .iter()
        .find(|row| &row.id == id)
        .ok_or_else(|| invalid("Campaign not found."))?;
    if campaign.mode != CampaignMode::Standalone {
        return Err(invalid(
            "Only standalone careers can use the transfer market.",
        ));
    }
    if campaign.status == CampaignStatus::Archived {
        return Err(invalid("Restore this archived campaign before editing."));
    }
    let season = tables
        .seasons
        .iter()
        .find(|row| row.id == campaign.active_season_id && row.campaign_id == campaign.id)
        .ok_or_else(|| invalid("Active season not found."))?;
    let clock = tables
        .simulation_states
        .iter()
        .find(|row| row.campaign_id == campaign.id && row.active_season_id == season.id)
        .ok_or_else(|| invalid("Saved game clock is missing."))?;
    Ok((campaign, season, clock))
}

pub(super) fn constitution<'a>(
    tables: &'a SnapshotTables,
    campaign: &EntityId,
) -> Result<&'a ConstitutionRow, CommandError> {
    tables
        .constitutions
        .iter()
        .filter(|row| &row.campaign_id == campaign)
        .max_by_key(|row| row.version.get())
        .ok_or_else(|| invalid("Constitution is missing."))
}

pub(super) fn rule_of(constitution: &ConstitutionRow) -> Option<QualificationRule> {
    constitution.rules.iter().find_map(|rule| match rule {
        ConstitutionRule::PrestigeBidSale {
            enabled: true,
            required_fee_numerator,
            required_fee_denominator,
            require_higher_prestige,
        } => Some(QualificationRule {
            required_fee_numerator: *required_fee_numerator,
            required_fee_denominator: *required_fee_denominator,
            require_higher_prestige: *require_higher_prestige,
        }),
        _ => None,
    })
}

pub(super) fn open_status(status: NegotiationStatus) -> bool {
    matches!(
        status,
        NegotiationStatus::Proposed | NegotiationStatus::Countered | NegotiationStatus::Agreed
    )
}

pub(super) fn tier_name(tier: SquadTier) -> &'static str {
    match tier {
        SquadTier::Key => "key",
        SquadTier::Rotation => "rotation",
        SquadTier::Youth => "youth",
    }
}

pub(super) fn club_by_key<'a>(
    tables: &'a SnapshotTables,
    campaign: &EntityId,
    key: &str,
) -> Result<&'a ClubSimulationStateRow, CommandError> {
    tables
        .club_simulation_states
        .iter()
        .find(|row| &row.campaign_id == campaign && row.simulation_key == key)
        .ok_or_else(|| invalid("Club simulation key is missing."))
}

pub(super) fn player_by_key<'a>(
    tables: &'a SnapshotTables,
    campaign: &EntityId,
    key: &str,
) -> Result<&'a PlayerSimulationStateRow, CommandError> {
    tables
        .player_simulation_states
        .iter()
        .find(|row| &row.campaign_id == campaign && row.simulation_key == key)
        .ok_or_else(|| invalid("Player simulation key is missing."))
}

pub(super) fn window_end(date: &DateOnly) -> Result<DateOnly, CommandError> {
    let year = date.year();
    let end = if calendar::transfer_window_on(date) == Some(calendar::TransferWindow::Winter) {
        format!("{year}-01-31")
    } else {
        format!("{year}-08-31")
    };
    DateOnly::parse(&end).map_err(invalid)
}

pub(super) fn deadline_on(date: &DateOnly) -> Result<String, CommandError> {
    let plus = add_days(date, 14).map_err(core)?;
    let end = window_end(date)?;
    Ok(if plus < end { plus } else { end }.as_str().to_owned())
}

pub(super) fn validate_clock(
    request_date: &str,
    request_boundary: &Option<String>,
    now: &str,
    revision: SafeInt,
) -> Result<(), CommandError> {
    DateOnly::parse(request_date).map_err(invalid)?;
    validate_timestamp(now).map_err(invalid)?;
    if revision.get() < 0 {
        return Err(invalid("Expected revision must be non-negative."));
    }
    if let Some(cursor) = request_boundary {
        if cursor.trim() != cursor || cursor.is_empty() || cursor.chars().count() > 200 {
            return Err(invalid("Source cursor is not supported."));
        }
    }
    Ok(())
}

pub(super) fn cursor_matches(
    clock: &SimulationStateRow,
    campaign: &CampaignRow,
    revision: SafeInt,
    date: &str,
    boundary: &Option<String>,
) -> Result<(), CommandError> {
    if campaign.revision != revision {
        return Err(conflict("Campaign revision is stale."));
    }
    if clock.current_date != date || &clock.last_boundary_key != boundary {
        return Err(conflict(
            "Source date or cursor does not match the saved game.",
        ));
    }
    Ok(())
}

pub(super) fn player_key<'a>(
    tables: &'a SnapshotTables,
    campaign: &EntityId,
    player: &EntityId,
) -> Result<&'a str, CommandError> {
    tables
        .player_simulation_states
        .iter()
        .find(|row| &row.campaign_id == campaign && &row.player_id == player)
        .map(|row| row.simulation_key.as_str())
        .ok_or_else(|| invalid("Player simulation key is missing."))
}

pub(super) fn club_key<'a>(
    tables: &'a SnapshotTables,
    campaign: &EntityId,
    club: &EntityId,
) -> Result<&'a str, CommandError> {
    tables
        .club_simulation_states
        .iter()
        .find(|row| &row.campaign_id == campaign && &row.club_id == club)
        .map(|row| row.simulation_key.as_str())
        .ok_or_else(|| invalid("Club simulation key is missing."))
}
