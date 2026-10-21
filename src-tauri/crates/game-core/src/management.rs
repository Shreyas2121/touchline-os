//! Pure management commands. The store rechecks them against its transaction snapshot.
use crate::{
    dates::{display_age, AgeDisplay, DateOnly},
    guards::*,
    policy::*,
    selection::{lineup_problems, LineupDraft},
    *,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeSet;
use ts_rs::TS;

pub const LEGACY_DEMO_ID: &str = "native-legacy-demo";
pub const STANDALONE_DEMO_ID: &str = "native-standalone-demo";
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClubChoices {
    pub clubs: Vec<ClubRow>,
    pub leagues: Vec<LeagueRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ManagementAction {
    Rename {
        name: String,
    },
    Archive {
        archived: bool,
    },
    Delete,
    SelectClub {
        club_id: EntityId,
    },
    AddPlayer {
        player: PlayerRow,
    },
    UpdatePlayer {
        player: PlayerRow,
    },
    SaveLineup {
        lineup: LineupRow,
    },
    DeleteLineup {
        lineup_id: EntityId,
    },
    SaveRegistration {
        competition_key: String,
        players: Vec<RegistrationRow>,
    },
    SaveConstitution {
        constitution: ConstitutionRow,
        allocation_id: EntityId,
    },
    SaveShortlist {
        item: ShortlistItemRow,
    },
    CloseShortlist {
        item_id: EntityId,
    },
    SaveNote {
        plan: DevelopmentPlanRow,
    },
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManagementCommand {
    pub campaign_id: EntityId,
    pub expected_revision: SafeInt,
    pub action_id: EntityId,
    pub audit_id: EntityId,
    pub now: String,
    pub action: ManagementAction,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManagementOutcome {
    pub campaign_id: EntityId,
    pub revision: Option<SafeInt>,
    pub replayed: bool,
    pub deleted: bool,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
pub enum CreationKind {
    Career,
    Legacy,
    StandaloneDemo,
    LegacyDemo,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreationRequest {
    pub career: career::CareerInput,
    pub kind: CreationKind,
    pub reset_revision: Option<SafeInt>,
    pub club: Option<ClubCreation>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClubCreation {
    pub name: String,
    pub short_name: String,
    pub colors: ClubColors,
    pub prestige: SafeInt,
    pub academy_tier: SafeInt,
    pub scouting_region: Option<String>,
}
pub fn customize_club(club: &mut ClubRow, input: &ClubCreation) -> CoreResult<()> {
    club.name = input.name.clone();
    club.short_name = input.short_name.clone();
    club.colors = input.colors.clone();
    club.prestige = input.prestige;
    club.academy_tier = input.academy_tier;
    club.scouting_region = input.scouting_region.clone();
    crate::validate::validate_club(club)
        .map_err(|_| CoreError::Invalid("Custom club settings are invalid."))
}
fn invalid(message: impl Into<String>) -> CommandError {
    CommandError::Validation {
        message: message.into(),
    }
}
fn guard(error: GuardError) -> CommandError {
    match error {
        GuardError::Scope { message } => CommandError::Scope { message },
        GuardError::Conflict { message } => CommandError::Conflict { message },
        GuardError::Validation { message } => invalid(message),
    }
}
pub fn fingerprint(command: &ManagementCommand) -> Result<String, CommandError> {
    if command.expected_revision.get() < 0 {
        return Err(invalid("Expected revision must be non-negative."));
    }
    dates::validate_timestamp(&command.now).map_err(|e| invalid(e.to_string()))?;
    serde_json::to_string(&json!([
        command.campaign_id,
        command.expected_revision,
        command.action
    ]))
    .map_err(|_| invalid("Command could not be encoded."))
}
pub fn outcome(tables: &SnapshotTables, replayed: bool) -> ManagementOutcome {
    let campaign = &tables.campaigns[0];
    ManagementOutcome {
        campaign_id: campaign.id.clone(),
        revision: Some(campaign.revision),
        replayed,
        deleted: false,
    }
}
fn managed(tables: &SnapshotTables, id: &EntityId) -> Result<(), CommandError> {
    let player = tables
        .players
        .iter()
        .find(|p| p.id == *id)
        .ok_or_else(|| invalid("Player not found in this campaign."))?;
    require_managed_player(&tables.campaigns[0], player).map_err(guard)
}
pub fn apply(
    tables: &mut SnapshotTables,
    command: &ManagementCommand,
    signature: &str,
) -> Result<ManagementOutcome, CommandError> {
    fingerprint(command)?;
    let campaign = tables
        .campaigns
        .first()
        .ok_or_else(|| invalid("Campaign not found."))?
        .clone();
    if campaign.id != command.campaign_id {
        return Err(invalid("Campaign scope does not match."));
    }
    if let Some(audit) = tables
        .audit_events
        .iter()
        .find(|a| a.action_id == command.action_id)
    {
        if audit
            .payload
            .0
            .get("managementFingerprint")
            .and_then(serde_json::Value::as_str)
            == Some(signature)
        {
            return Ok(outcome(tables, true));
        }
        return Err(CommandError::Conflict {
            message: "Action identity was already used for different input.".into(),
        });
    }
    require_revision(campaign.revision, command.expected_revision).map_err(guard)?;
    if matches!(command.action, ManagementAction::Delete) {
        return Ok(ManagementOutcome {
            campaign_id: campaign.id,
            revision: None,
            replayed: false,
            deleted: true,
        });
    }
    let revision = next_revision(campaign.revision).map_err(|e| invalid(e.to_string()))?;
    let season = tables
        .seasons
        .iter()
        .find(|s| s.id == campaign.active_season_id)
        .ok_or_else(|| invalid("Active season not found."))?
        .clone();
    if !matches!(
        command.action,
        ManagementAction::Rename { .. } | ManagementAction::Archive { .. }
    ) {
        require_active_season(&campaign, &season).map_err(guard)?;
    }
    if campaign.status == CampaignStatus::Archived
        && !matches!(
            command.action,
            ManagementAction::Archive { .. }
                | ManagementAction::Rename { .. }
                | ManagementAction::Delete
        )
    {
        return Err(invalid("Restore this archived campaign before editing."));
    }
    let action_type = match &command.action {
        ManagementAction::Rename { name } => {
            tables.campaigns[0].name = name.trim().into();
            AuditAction::CampaignRename
        }
        ManagementAction::Archive { archived } => {
            tables.campaigns[0].status = if *archived {
                CampaignStatus::Archived
            } else {
                CampaignStatus::Active
            };
            if *archived {
                AuditAction::CampaignArchive
            } else {
                AuditAction::CampaignRestore
            }
        }
        ManagementAction::Delete => {
            return Ok(ManagementOutcome {
                campaign_id: campaign.id,
                revision: None,
                replayed: false,
                deleted: true,
            })
        }
        ManagementAction::SelectClub { club_id } => {
            reject_standalone_write(&campaign, StandaloneWrite::Club).map_err(guard)?;
            if !tables.clubs.iter().any(|c| c.id == *club_id) {
                return Err(invalid("Club is not in this campaign."));
            }
            if campaign.managed_club_id != *club_id {
                tables.lineups.retain(|row| row.season_id != season.id);
                tables
                    .registrations
                    .retain(|row| row.season_id != season.id);
            }
            tables.campaigns[0].managed_club_id = club_id.clone();
            AuditAction::CampaignSelectClub
        }
        ManagementAction::AddPlayer { player } | ManagementAction::UpdatePlayer { player } => {
            reject_standalone_write(&campaign, StandaloneWrite::Player).map_err(guard)?;
            require_scope(&campaign.id, &player.campaign_id).map_err(guard)?;
            if player.club_id.as_ref() != Some(&campaign.managed_club_id) {
                return Err(invalid("Players must remain at the managed club."));
            }
            let mut player = player.clone();
            player.position_group = crate::enums::position_group_for(
                player
                    .positions
                    .first()
                    .copied()
                    .ok_or_else(|| invalid("Choose at least one position."))?,
            );
            player.age_reference_season_ordinal = player.reported_age.map(|_| season.ordinal);
            let existing = tables.players.iter().position(|p| p.id == player.id);
            match (&command.action, existing) {
                (ManagementAction::AddPlayer { .. }, None) => {
                    tables.players.push(player);
                    AuditAction::PlayerAdd
                }
                (ManagementAction::UpdatePlayer { .. }, Some(i)) => {
                    managed(tables, &player.id)?;
                    let old = &tables.players[i];
                    if player.club_id != old.club_id
                        || player.external_source_id != old.external_source_id
                        || player.is_newgen != old.is_newgen
                        || player.source != old.source
                    {
                        return Err(invalid(
                            "Player provenance and ownership cannot be changed here.",
                        ));
                    }
                    tables.players[i] = player;
                    AuditAction::PlayerUpdate
                }
                _ => return Err(invalid("Player identity does not match this operation.")),
            }
        }
        ManagementAction::SaveLineup { lineup } => {
            require_scope(&campaign.id, &lineup.campaign_id).map_err(guard)?;
            if lineup.season_id != season.id {
                return Err(invalid("Lineup must use the active season."));
            }
            if tables.lineups.iter().any(|l| {
                l.id != lineup.id && l.season_id == season.id && l.name.trim() == lineup.name.trim()
            }) {
                return Err(invalid("A lineup with this name already exists."));
            }
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
            let roster = tables
                .players
                .iter()
                .filter(|p| p.club_id.as_ref() == Some(&campaign.managed_club_id))
                .map(|p| p.id.as_str())
                .collect::<Vec<_>>();
            if !lineup_problems(&draft, &roster).is_empty() {
                return Err(invalid(
                    "Lineup contains duplicate, unknown or out-of-scope selections.",
                ));
            }
            if tables
                .lineups
                .iter()
                .any(|l| l.id == lineup.id && l.season_id != season.id)
            {
                return Err(invalid("Lineup belongs to another season."));
            }
            let mut row = lineup.clone();
            row.updated_at = command.now.clone();
            tables.lineups.retain(|l| l.id != row.id);
            tables.lineups.push(row);
            AuditAction::LineupSave
        }
        ManagementAction::DeleteLineup { lineup_id } => {
            if !tables
                .lineups
                .iter()
                .any(|l| l.id == *lineup_id && l.season_id == season.id)
            {
                return Err(invalid("Lineup not found in the active season."));
            }
            tables.lineups.retain(|l| l.id != *lineup_id);
            AuditAction::LineupDelete
        }
        ManagementAction::SaveNote { plan } => {
            require_scope(&campaign.id, &plan.campaign_id).map_err(guard)?;
            if plan.season_id != season.id || !tables.players.iter().any(|p| p.id == plan.player_id)
            {
                return Err(invalid("Note player or season is outside this campaign."));
            }
            if tables.development_plans.iter().any(|p| {
                (p.id == plan.id
                    && (p.player_id != plan.player_id || p.season_id != plan.season_id))
                    || (p.player_id == plan.player_id
                        && p.season_id == plan.season_id
                        && p.id != plan.id)
            }) {
                return Err(invalid(
                    "Use the saved note identity for this player and season.",
                ));
            }
            tables.development_plans.retain(|p| p.id != plan.id);
            tables.development_plans.push(plan.clone());
            AuditAction::PlayerNote
        }
        ManagementAction::SaveShortlist { item } => {
            require_scope(&campaign.id, &item.campaign_id).map_err(guard)?;
            if !tables.players.iter().any(|p| p.id == item.player_id) {
                return Err(invalid("Shortlist player is outside this campaign."));
            }
            if tables.shortlist_items.iter().any(|i| {
                (i.id == item.id && i.player_id != item.player_id)
                    || (i.player_id == item.player_id && i.id != item.id)
            }) {
                return Err(invalid("Use the saved shortlist identity for this player."));
            }
            let mut row = item.clone();
            if let Some(old) = tables.shortlist_items.iter().find(|i| i.id == row.id) {
                row.added_at = old.added_at.clone();
            } else {
                row.added_at = command.now.clone();
            }
            tables.shortlist_items.retain(|i| i.id != row.id);
            tables.shortlist_items.push(row);
            AuditAction::ShortlistSave
        }
        ManagementAction::CloseShortlist { item_id } => {
            let row = tables
                .shortlist_items
                .iter_mut()
                .find(|i| i.id == *item_id)
                .ok_or_else(|| invalid("Shortlist item not found."))?;
            row.status = OpenClosed::Closed;
            AuditAction::ShortlistClose
        }
        ManagementAction::SaveConstitution {
            constitution,
            allocation_id,
        } => {
            reject_challenge_constitution(&campaign).map_err(guard)?;
            require_scope(&campaign.id, &constitution.campaign_id).map_err(guard)?;
            if tables.constitutions.iter().any(|c| c.id == constitution.id) {
                return Err(invalid(
                    "A constitution edit requires a new version identity.",
                ));
            }
            let mut row = constitution.clone();
            row.version = next_revision(
                tables
                    .constitutions
                    .iter()
                    .map(|c| c.version)
                    .max_by_key(|v| v.get())
                    .unwrap_or(SafeInt::new(0).expect("zero")),
            )
            .map_err(|e| invalid(e.to_string()))?;
            row.updated_at = command.now.clone();
            if !tables.ledger_entries.iter().any(|e| {
                e.season_id == season.id
                    && e.club_id == campaign.managed_club_id
                    && e.kind == LedgerKind::InitialAllocation
            }) {
                if let Some(amount) = row.rules.iter().find_map(|r| match r {
                    ConstitutionRule::SellToBuy {
                        enabled: true,
                        initial_allocation_cents,
                        ..
                    } => Some(*initial_allocation_cents),
                    _ => None,
                }) {
                    if campaign.mode == CampaignMode::Standalone {
                        return Err(invalid(
                            "Standalone initialization must already have an opening allocation.",
                        ));
                    }
                    tables.ledger_entries.push(LedgerEntryRow {
                        id: allocation_id.clone(),
                        campaign_id: campaign.id.clone(),
                        season_id: season.id.clone(),
                        club_id: campaign.managed_club_id.clone(),
                        kind: LedgerKind::InitialAllocation,
                        amount_cents: amount,
                        effective_on: season.start_date.clone().ok_or_else(|| {
                            invalid("An opening allocation requires a known season start.")
                        })?,
                        source_action_id: command.action_id.clone(),
                        reverses_entry_id: None,
                        note: None,
                    });
                }
            }
            tables.constitutions.push(row);
            AuditAction::ConstitutionSave
        }
        ManagementAction::SaveRegistration {
            competition_key,
            players,
        } => {
            if players.len() > 100
                || players
                    .iter()
                    .map(|r| r.id.as_str())
                    .collect::<BTreeSet<_>>()
                    .len()
                    != players.len()
                || players
                    .iter()
                    .map(|r| r.player_id.as_str())
                    .collect::<BTreeSet<_>>()
                    .len()
                    != players.len()
            {
                return Err(invalid("Registration players must be unique and bounded."));
            }
            let constitution = tables
                .constitutions
                .iter()
                .max_by_key(|c| c.version.get())
                .ok_or_else(|| invalid("Save a constitution before registration."))?;
            if constitution.rules.iter().any(|r| matches!(r, ConstitutionRule::RegistrationQuota { competition_key: key, .. } if key != competition_key)) { return Err(invalid("Use the saved constitution competition.")); }
            let mut evaluated = Vec::new();
            let mut rows = Vec::new();
            for draft in players {
                managed(tables, &draft.player_id)?;
                if draft.campaign_id != campaign.id
                    || draft.season_id != season.id
                    || draft.competition_key != *competition_key
                {
                    return Err(invalid("Registration scope does not match."));
                }
                if tables.registrations.iter().any(|r| {
                    (r.id == draft.id
                        && (r.player_id != draft.player_id
                            || r.season_id != season.id
                            || r.competition_key != *competition_key))
                        || (r.player_id == draft.player_id
                            && r.season_id == season.id
                            && r.competition_key == *competition_key
                            && r.id != draft.id)
                }) {
                    return Err(invalid("Use the saved registration identity."));
                }
                let player = tables
                    .players
                    .iter()
                    .find(|p| p.id == draft.player_id)
                    .expect("managed");
                let profile = tables
                    .player_simulation_states
                    .iter()
                    .find(|p| p.player_id == draft.player_id);
                let age = match display_age(player, &season) {
                    AgeDisplay::Exact { years } | AgeDisplay::Estimated { years } => {
                        SafeInt::new(years).ok()
                    }
                    _ => None,
                };
                let mut row = draft.clone();
                row.provenance = RecordSource::UserEntered;
                if campaign.mode == CampaignMode::Standalone {
                    let profile = profile
                        .ok_or_else(|| invalid("Standalone eligibility profile is missing."))?;
                    row.homegrown_club = Some(profile.homegrown_club);
                    row.homegrown_nation = Some(profile.homegrown_nation);
                    row.age_exempt = None;
                }
                evaluated.push(RegistrationPlayer {
                    player_id: row.player_id.clone(),
                    status: row.status,
                    homegrown_club: row.homegrown_club,
                    homegrown_nation: row.homegrown_nation,
                    age_exempt: row.age_exempt,
                    age,
                });
                rows.push(row);
            }
            let report = evaluate_action(
                &PolicyAction::Registration {
                    competition_key: competition_key.clone(),
                    players: evaluated,
                },
                &PolicySnapshot {
                    revision: campaign.revision,
                    remaining_capacity_cents: None,
                },
                constitution,
                &DateOnly::parse(season.start_date.as_deref().unwrap_or(&command.now[..10]))
                    .map_err(|e| invalid(e.to_string()))?,
            )
            .map_err(|e| invalid(e.to_string()))?;
            if !report.allowed {
                return Err(CommandError::Scope {
                    message: report
                        .verdicts
                        .first()
                        .map(|v| v.message.clone())
                        .unwrap_or_else(|| "Registration is not legal.".into()),
                });
            }
            let selected = rows
                .iter()
                .map(|r| r.player_id.as_str().to_owned())
                .collect::<BTreeSet<_>>();
            let managed_ids = tables
                .players
                .iter()
                .filter(|p| p.club_id.as_ref() == Some(&campaign.managed_club_id))
                .map(|p| p.id.as_str().to_owned())
                .collect::<BTreeSet<_>>();
            for old in &mut tables.registrations {
                if old.season_id == season.id
                    && managed_ids.contains(old.player_id.as_str())
                    && old.competition_key == *competition_key
                    && !selected.contains(old.player_id.as_str())
                {
                    old.status = RegistrationStatus::Ineligible;
                }
            }
            for row in rows {
                tables.registrations.retain(|r| r.id != row.id);
                tables.registrations.push(row);
            }
            AuditAction::RegistrationSave
        }
    };
    tables.campaigns[0].revision = revision;
    tables.campaigns[0].updated_at = command.now.clone();
    tables.audit_events.push(AuditEventRow {
        id: command.audit_id.clone(),
        campaign_id: campaign.id,
        season_id: Some(season.id),
        action_id: command.action_id.clone(),
        action_type,
        created_at: command.now.clone(),
        summary: match &command.action {
            ManagementAction::Rename { name } => format!("Renamed campaign to {}.", name.trim()),
            ManagementAction::Archive { archived } => if *archived {
                "Archived campaign."
            } else {
                "Restored campaign."
            }
            .into(),
            ManagementAction::SelectClub { .. } => {
                "Selected the managed club and cleared former squad selections.".into()
            }
            ManagementAction::AddPlayer { player } => format!("Added {}.", player.name),
            ManagementAction::UpdatePlayer { player } => format!("Corrected {}.", player.name),
            ManagementAction::SaveLineup { lineup } => format!("Saved lineup {}.", lineup.name),
            ManagementAction::DeleteLineup { .. } => "Deleted a saved lineup.".into(),
            ManagementAction::SaveNote { .. } => "Saved a development planning note.".into(),
            ManagementAction::SaveShortlist { .. } => "Saved a shortlist item.".into(),
            ManagementAction::CloseShortlist { .. } => "Closed a shortlist item.".into(),
            ManagementAction::SaveConstitution { .. } => "Saved a new constitution version.".into(),
            ManagementAction::SaveRegistration {
                competition_key, ..
            } => format!("Saved the {competition_key} registration."),
            ManagementAction::Delete => unreachable!("delete returns before audit"),
        },
        payload: AuditPayload(
            json!({"managementFingerprint": signature})
                .as_object()
                .expect("object")
                .clone(),
        ),
    });
    Ok(outcome(tables, false))
}
