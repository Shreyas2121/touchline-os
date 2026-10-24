use crate::{
    calendar::{preview_time_advance, season_dates},
    dates::validate_timestamp,
    generation::{
        generate_playable_world, validate_identity_seed, validate_playable_world, PlayableWorld,
        PlayableWorldInput, PLAYABLE_GENERATOR_VERSION,
    },
    policy::{constitution_preset, Preset},
    random::{career_fingerprint, derive_event_seed, EventKind},
    *,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeSet;

pub const CAREER_OPERATION_KEY: &str = "career:initialize";
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CareerInput {
    pub campaign_id: EntityId,
    pub name: String,
    pub seed: String,
    pub start_year: SafeInt,
    pub club_key: String,
    pub rules_mode: RulesMode,
    pub preset: Preset,
    pub now: String,
    pub season_id: EntityId,
    pub clock_id: EntityId,
    pub constitution_id: EntityId,
    pub allocation_id: EntityId,
    pub receipt_id: EntityId,
    pub audit_event_id: EntityId,
    pub action_id: EntityId,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreparedCareer {
    pub fingerprint: String,
    pub campaign: CampaignRow,
    pub season: SeasonRow,
    pub world: PlayableWorld,
    pub clock: SimulationStateRow,
    pub constitution: ConstitutionRow,
    pub allocation: LedgerEntryRow,
    pub receipt: SimulationReceiptRow,
    pub audit: AuditEventRow,
}
impl PreparedCareer {
    /// Pure row mapping for the later atomic creation service. No storage is invoked.
    pub fn into_tables(self) -> SnapshotTables {
        SnapshotTables {
            campaigns: vec![self.campaign],
            seasons: vec![self.season],
            leagues: self.world.leagues,
            clubs: self.world.clubs,
            players: self.world.players,
            contracts: self.world.contracts,
            constitutions: vec![self.constitution],
            ledger_entries: vec![self.allocation],
            audit_events: vec![self.audit],
            simulation_states: vec![self.clock],
            club_simulation_states: self.world.club_simulation_states,
            player_simulation_states: self.world.player_simulation_states,
            simulation_receipts: vec![self.receipt],
            ..SnapshotTables::default()
        }
    }
}
fn invalid() -> CoreError {
    CoreError::Invalid("Career initialization is incomplete or inconsistent.")
}
pub fn input_fingerprint(input: &CareerInput) -> CoreResult<String> {
    validate_identity_seed(&input.seed, &input.campaign_id)?;
    validate_timestamp(&input.now)?;
    season_dates(input.start_year.get())?;
    if input.name.is_empty()
        || crate::js_trim(&input.name) != input.name
        || input.name.encode_utf16().count() > 120
        || input.name.chars().any(char::is_control)
        || input.preset == Preset::Custom
    {
        return Err(CoreError::Invalid(
            "Choose a valid name and a Balanced or Strict preset.",
        ));
    }
    let number = input
        .club_key
        .strip_prefix("club:")
        .and_then(|number| number.parse::<usize>().ok())
        .ok_or(CoreError::Invalid("Choose a club from this world."))?;
    if crate::generation::club_key(number)? != input.club_key {
        return Err(CoreError::Invalid("Choose a club from this world."));
    }
    let ids = [
        &input.campaign_id,
        &input.season_id,
        &input.clock_id,
        &input.constitution_id,
        &input.allocation_id,
        &input.receipt_id,
        &input.audit_event_id,
        &input.action_id,
    ];
    if ids
        .iter()
        .map(|id| id.as_str())
        .collect::<BTreeSet<_>>()
        .len()
        != ids.len()
    {
        return Err(CoreError::Invalid(
            "Career initialization IDs must be distinct.",
        ));
    }
    let fingerprint = career_fingerprint(
        &input.name,
        &input.seed,
        input.start_year.get(),
        &input.club_key,
        input.rules_mode,
        input.preset,
    )?;
    if fingerprint.encode_utf16().count() > 512 {
        return Err(CoreError::Invalid("Career settings do not fit a receipt."));
    }
    Ok(fingerprint)
}
fn world_input(input: &CareerInput) -> PlayableWorldInput {
    PlayableWorldInput {
        seed: input.seed.clone(),
        generator_version: PLAYABLE_GENERATOR_VERSION.into(),
        campaign_id: input.campaign_id.clone(),
        start_year: input.start_year,
    }
}
fn initial_headers(
    input: &CareerInput,
    world: PlayableWorld,
    fingerprint: String,
) -> CoreResult<PreparedCareer> {
    let club_state = world
        .club_simulation_states
        .iter()
        .find(|state| state.simulation_key == input.club_key)
        .ok_or(CoreError::Invalid("Choose a club from this world."))?;
    let club = world
        .clubs
        .iter()
        .find(|club| club.id == club_state.club_id)
        .ok_or_else(invalid)?;
    let dates = season_dates(input.start_year.get())?;
    let zero = SafeInt::new(0)?;
    let one = SafeInt::new(1)?;
    let campaign = CampaignRow {
        id: input.campaign_id.clone(),
        name: input.name.clone(),
        kind: CampaignKind::Fictional,
        mode: CampaignMode::Standalone,
        rules_mode: input.rules_mode,
        seed: Some(input.seed.clone()),
        generator_version: Some(PLAYABLE_GENERATOR_VERSION.into()),
        managed_club_id: club.id.clone(),
        active_season_id: input.season_id.clone(),
        currency: Euro,
        created_at: input.now.clone(),
        updated_at: input.now.clone(),
        revision: zero,
        status: CampaignStatus::Active,
    };
    let season = SeasonRow {
        id: input.season_id.clone(),
        campaign_id: input.campaign_id.clone(),
        label: format!(
            "{}/{:02}",
            input.start_year.get(),
            (input.start_year.get() + 1) % 100
        ),
        ordinal: one,
        status: SeasonStatus::Active,
        start_date: Some(dates.start_date.as_str().into()),
        end_date: Some(dates.end_date.as_str().into()),
        opened_at: input.now.clone(),
        closed_at: None,
    };
    let clock = SimulationStateRow {
        id: input.clock_id.clone(),
        campaign_id: input.campaign_id.clone(),
        active_season_id: input.season_id.clone(),
        root_seed: input.seed.clone(),
        simulation_version: VersionOne,
        calendar_version: VersionOne,
        current_date: dates.start_date.as_str().into(),
        phase: CalendarPhase::Preseason,
        last_boundary_key: None,
    };
    let constitution = ConstitutionRow {
        id: input.constitution_id.clone(),
        campaign_id: input.campaign_id.clone(),
        version: one,
        rules: constitution_preset(input.preset),
        updated_at: input.now.clone(),
    };
    let amount = constitution
        .rules
        .iter()
        .find_map(|rule| match rule {
            ConstitutionRule::SellToBuy {
                enabled: true,
                initial_allocation_cents,
                ..
            } => Some(*initial_allocation_cents),
            _ => None,
        })
        .ok_or_else(invalid)?;
    let allocation = LedgerEntryRow {
        earning_season_id: None,
        settlement_id: None,
        award_kind: None,
        id: input.allocation_id.clone(),
        campaign_id: input.campaign_id.clone(),
        season_id: input.season_id.clone(),
        club_id: club.id.clone(),
        kind: LedgerKind::InitialAllocation,
        amount_cents: amount,
        effective_on: dates.start_date.as_str().into(),
        source_action_id: input.action_id.clone(),
        reverses_entry_id: None,
        note: None,
    };
    let receipt = SimulationReceiptRow {
        id: input.receipt_id.clone(),
        campaign_id: input.campaign_id.clone(),
        operation_key: CAREER_OPERATION_KEY.into(),
        input_revision: zero,
        input_fingerprint: fingerprint.clone(),
        event_seed: SafeInt::new(i64::from(derive_event_seed(
            &input.seed,
            "1",
            EventKind::World,
            &[
                CAREER_OPERATION_KEY,
                &input.club_key,
                &input.start_year.get().to_string(),
                match input.rules_mode {
                    RulesMode::Challenge => "challenge",
                    RulesMode::Sandbox => "sandbox",
                },
                match input.preset {
                    Preset::Balanced => "balanced",
                    Preset::Strict => "strict",
                    Preset::Custom => return Err(invalid()),
                },
            ],
        )?))?,
        simulation_version: VersionOne,
        outcome_refs: vec![
            OutcomeRef::Campaign {
                id: input.campaign_id.clone(),
            },
            OutcomeRef::Season {
                id: input.season_id.clone(),
            },
            OutcomeRef::Club {
                id: club.id.clone(),
            },
        ],
        created_at: input.now.clone(),
    };
    let payload = json!({"mode":"standalone","rulesMode":input.rules_mode,"preset":input.preset,"seed":input.seed,"startYear":input.start_year,"clubKey":input.club_key,"generatorVersion":PLAYABLE_GENERATOR_VERSION,"leagues":world.leagues.len(),"clubs":world.clubs.len(),"players":world.players.len(),"contracts":world.contracts.len()});
    let audit = AuditEventRow {
        id: input.audit_event_id.clone(),
        campaign_id: input.campaign_id.clone(),
        season_id: Some(input.season_id.clone()),
        action_id: input.action_id.clone(),
        action_type: AuditAction::SimulationInitialize,
        created_at: input.now.clone(),
        summary: format!(
            "Started {} at {} on {}.",
            input.name,
            club.name,
            dates.start_date.as_str()
        ),
        payload: AuditPayload(payload.as_object().ok_or_else(invalid)?.clone()),
    };
    Ok(PreparedCareer {
        fingerprint,
        campaign,
        season,
        world,
        clock,
        constitution,
        allocation,
        receipt,
        audit,
    })
}
pub fn prepare_standalone_career(input: &CareerInput) -> CoreResult<PreparedCareer> {
    let fingerprint = input_fingerprint(input)?;
    let world = generate_playable_world(&world_input(input))?;
    let career = initial_headers(input, world, fingerprint)?;
    validate_prepared_career(&career, input)?;
    Ok(career)
}
/// A later app service can recheck a prepared bundle before its creation transaction.
pub fn validate_prepared_career(career: &PreparedCareer, input: &CareerInput) -> CoreResult<()> {
    let fingerprint = input_fingerprint(input)?;
    validate_playable_world(&career.world, &world_input(input))?;
    let world_ids = career
        .world
        .leagues
        .iter()
        .map(|r| &r.id)
        .chain(career.world.clubs.iter().map(|r| &r.id))
        .chain(career.world.players.iter().map(|r| &r.id))
        .chain(career.world.contracts.iter().map(|r| &r.id))
        .chain(career.world.club_simulation_states.iter().map(|r| &r.id))
        .chain(career.world.player_simulation_states.iter().map(|r| &r.id))
        .map(EntityId::as_str)
        .collect::<BTreeSet<_>>();
    if [
        &input.campaign_id,
        &input.season_id,
        &input.clock_id,
        &input.constitution_id,
        &input.allocation_id,
        &input.receipt_id,
        &input.audit_event_id,
        &input.action_id,
    ]
    .iter()
    .any(|id| world_ids.contains(id.as_str()))
    {
        return Err(CoreError::Invalid(
            "A supplied initialization ID collides with a generated row.",
        ));
    }
    let expected = initial_headers(input, career.world.clone(), fingerprint)?;
    if career.campaign != expected.campaign
        || career.season != expected.season
        || career.clock != expected.clock
        || career.constitution != expected.constitution
        || career.allocation != expected.allocation
        || career.receipt != expected.receipt
        || career.audit != expected.audit
        || career.fingerprint != expected.fingerprint
    {
        return Err(invalid());
    }
    preview_time_advance(&career.clock, &career.season)?;
    let snapshot = CampaignSnapshot {
        format: SnapshotFormat::TouchlineCampaign,
        format_version: FormatVersion,
        source_storage: SourceStorage::Sqlite,
        source_schema_version: SafeInt::new(5)?,
        export_id: input.receipt_id.clone(),
        exported_at: input.now.clone(),
        campaign_revision: career.campaign.revision,
        tables: career.clone().into_tables(),
    };
    // Validate complete saved-row contracts without invoking a database or import service.
    let bytes = serde_json::to_vec(&snapshot).map_err(|_| invalid())?;
    parse_snapshot(&bytes).map_err(|_| invalid())?;
    Ok(())
}
