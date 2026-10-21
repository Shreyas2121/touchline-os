use crate::{CampaignMode, CampaignRow, CoreResult, PlayerRow, RulesMode, SafeInt, SeasonRow};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "code", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum GuardError {
    Scope { message: String },
    Validation { message: String },
    Conflict { message: String },
}
impl std::fmt::Display for GuardError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Scope { message } | Self::Conflict { message } | Self::Validation { message } => {
                f.write_str(message)
            }
        }
    }
}
impl std::error::Error for GuardError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StandaloneWrite {
    Match,
    Negotiation,
    Player,
    Contract,
    Ledger,
    Club,
}
pub fn reject_standalone_write(
    campaign: &CampaignRow,
    action: StandaloneWrite,
) -> Result<(), GuardError> {
    if campaign.mode != CampaignMode::Standalone {
        return Ok(());
    }
    let message = match action {
        StandaloneWrite::Match => crate::calendar::MATCH_SIMULATION_UNAVAILABLE,
        StandaloneWrite::Negotiation => "Negotiation arrives in a later phase.",
        StandaloneWrite::Player => "Standalone careers cannot change players directly.",
        StandaloneWrite::Contract => "Negotiated contracts arrive later.",
        StandaloneWrite::Ledger => "Standalone careers cannot post manual money effects.",
        StandaloneWrite::Club => "The managed club is fixed after a standalone career is created.",
    };
    Err(GuardError::Scope {
        message: message.into(),
    })
}
pub fn reject_challenge_constitution(campaign: &CampaignRow) -> Result<(), GuardError> {
    if campaign.rules_mode == RulesMode::Challenge {
        return Err(GuardError::Scope {
            message: "Challenge rules are locked.".into(),
        });
    }
    Ok(())
}
pub fn require_scope(
    expected: &crate::EntityId,
    actual: &crate::EntityId,
) -> Result<(), GuardError> {
    if expected != actual {
        return Err(GuardError::Scope {
            message: "Row campaign does not match the scope.".into(),
        });
    }
    Ok(())
}
pub fn require_active_season(campaign: &CampaignRow, season: &SeasonRow) -> Result<(), GuardError> {
    if season.campaign_id != campaign.id
        || season.id != campaign.active_season_id
        || season.status != crate::SeasonStatus::Active
        || season.closed_at.is_some()
    {
        return Err(GuardError::Scope {
            message: "Season is not the active season.".into(),
        });
    }
    Ok(())
}
pub fn require_managed_player(
    campaign: &CampaignRow,
    player: &PlayerRow,
) -> Result<(), GuardError> {
    require_scope(&campaign.id, &player.campaign_id)?;
    if player.club_id.as_ref() != Some(&campaign.managed_club_id) {
        return Err(GuardError::Scope {
            message: "That player is not at the managed club.".into(),
        });
    }
    Ok(())
}
pub fn require_revision(current: SafeInt, expected: SafeInt) -> Result<(), GuardError> {
    if current.get() < 0 || expected.get() < 0 {
        return Err(GuardError::Validation {
            message: "Invalid campaign revision.".into(),
        });
    }
    if current != expected {
        return Err(GuardError::Conflict {
            message: "Campaign revision is stale.".into(),
        });
    }
    Ok(())
}
pub fn next_revision(current: SafeInt) -> CoreResult<SafeInt> {
    if current.get() < 0 {
        return Err(crate::CoreError::Invalid("Invalid revision."));
    }
    SafeInt::new(
        current
            .get()
            .checked_add(1)
            .ok_or(crate::CoreError::Arithmetic)?,
    )
}
