use crate::{store_error, validation, CommandError, NativeStore};
use game_core::{career::*, generation::*, management::*, *};
pub fn preview_creation(request: CreationRequest) -> Result<ClubChoices, CommandError> {
    signature(&request)?;
    if matches!(
        request.kind,
        CreationKind::Legacy | CreationKind::LegacyDemo
    ) {
        let mut world = generate_legacy_world(&LegacyWorldInput {
            campaign_id: request.career.campaign_id,
            seed: request.career.seed,
            generator_version: LEGACY_GENERATOR_VERSION.into(),
        })
        .map_err(|e| validation(&e.to_string()))?;
        if let Some(club) = &request.club {
            customize_club(
                &mut world.clubs[request.career.club_key[5..]
                    .parse::<usize>()
                    .expect("validated key")
                    - 1],
                club,
            )
            .map_err(|e| validation(&e.to_string()))?;
        }
        Ok(ClubChoices {
            clubs: world.clubs,
            leagues: world.leagues,
        })
    } else {
        let world = generate_playable_world(&PlayableWorldInput {
            campaign_id: request.career.campaign_id,
            seed: request.career.seed,
            generator_version: PLAYABLE_GENERATOR_VERSION.into(),
            start_year: request.career.start_year,
        })
        .map_err(|e| validation(&e.to_string()))?;
        Ok(ClubChoices {
            clubs: world.clubs,
            leagues: world.leagues,
        })
    }
}

fn signature(request: &CreationRequest) -> Result<String, CommandError> {
    if request
        .reset_revision
        .is_some_and(|revision| revision.get() < 0)
    {
        return Err(validation("Reset revision must be non-negative."));
    }
    if let Some(input) = &request.club {
        if request.kind != CreationKind::Legacy {
            return Err(validation(
                "Only a new legacy campaign can customize its club.",
            ));
        }
        let mut club = ClubRow {
            id: EntityId::new("custom-club").expect("constant id"),
            campaign_id: request.career.campaign_id.clone(),
            league_id: None,
            name: input.name.clone(),
            short_name: input.short_name.clone(),
            colors: input.colors.clone(),
            prestige: input.prestige,
            academy_tier: input.academy_tier,
            scouting_region: input.scouting_region.clone(),
        };
        customize_club(&mut club, input).map_err(|e| validation(&e.to_string()))?;
    }
    let input =
        input_fingerprint(&preparation_input(request)).map_err(|e| validation(&e.to_string()))?;
    let canonical =
        serde_json::to_string(&(request.kind, input, &request.club, request.career.preset))
            .map_err(|_| validation("Creation input could not be encoded."))?;
    let signature = game_store::creation_fingerprint(&canonical);
    let id = request.career.campaign_id.as_str();
    match request.kind {
        CreationKind::Career | CreationKind::Legacy
            if id == LEGACY_DEMO_ID
                || id == STANDALONE_DEMO_ID
                || request.reset_revision.is_some() =>
        {
            return Err(validation(
                "Demo identities and reset are reserved for the matching demo.",
            ))
        }
        CreationKind::StandaloneDemo
            if id != STANDALONE_DEMO_ID || request.career.seed != "native-standalone-demo-v2" =>
        {
            return Err(validation("Standalone demo settings do not match."))
        }
        CreationKind::LegacyDemo
            if id != LEGACY_DEMO_ID || request.career.seed != "native-legacy-demo-v1" =>
        {
            return Err(validation("Legacy demo settings do not match."))
        }
        _ => {}
    }
    if matches!(
        request.kind,
        CreationKind::Legacy | CreationKind::LegacyDemo
    ) && request.career.rules_mode != RulesMode::Sandbox
    {
        return Err(validation("Legacy campaigns use Sandbox rules."));
    }
    Ok(signature)
}
fn preparation_input(request: &CreationRequest) -> CareerInput {
    let mut input = request.career.clone();
    if matches!(
        request.kind,
        CreationKind::Legacy | CreationKind::LegacyDemo
    ) && input.preset == game_core::policy::Preset::Custom
    {
        input.preset = game_core::policy::Preset::Balanced;
    }
    input
}
pub fn create_career(
    store: &NativeStore,
    request: CreationRequest,
) -> Result<ManagementOutcome, CommandError> {
    let fingerprint = signature(&request)?;
    // Saved initialization receipts are checked before any world generation.
    if let Some(result) = store
        .creation_probe(request.clone(), fingerprint.clone())
        .map_err(store_error)?
    {
        return Ok(result);
    }
    let prepared = prepare_standalone_career(&preparation_input(&request))
        .map_err(|e| validation(&e.to_string()))?;
    let mut tables = prepared.into_tables();
    if matches!(
        request.kind,
        CreationKind::Legacy | CreationKind::LegacyDemo
    ) {
        let world = generate_legacy_world(&LegacyWorldInput {
            campaign_id: request.career.campaign_id.clone(),
            seed: request.career.seed.clone(),
            generator_version: LEGACY_GENERATOR_VERSION.into(),
        })
        .map_err(|e| validation(&e.to_string()))?;
        tables.leagues = world.leagues;
        tables.clubs = world.clubs;
        if let Some(club) = &request.club {
            let row = tables
                .clubs
                .iter_mut()
                .find(|c| c.id == tables.campaigns[0].managed_club_id)
                .expect("selected club");
            customize_club(row, club).map_err(|e| validation(&e.to_string()))?;
        }
        tables.players = world.players.into_iter().map(|p| p.player).collect();
        tables.contracts.clear();
        if request.career.preset == game_core::policy::Preset::Custom {
            tables.constitutions[0].rules =
                game_core::policy::constitution_preset(game_core::policy::Preset::Custom);
            tables.ledger_entries.clear();
        }
        tables.simulation_states.clear();
        tables.club_simulation_states.clear();
        tables.player_simulation_states.clear();
        tables.campaigns[0].mode = CampaignMode::Legacy;
        tables.campaigns[0].generator_version = Some(LEGACY_GENERATOR_VERSION.into());
        tables.audit_events[0].action_type = AuditAction::CampaignCreate;
        tables.audit_events[0].summary = "Created native legacy campaign.".into();
        tables.audit_events[0].payload = AuditPayload(serde_json::Map::new());
        tables.simulation_receipts[0].event_seed = SafeInt::new(i64::from(
            game_core::random::derive_event_seed(
                &request.career.seed,
                "1",
                game_core::random::EventKind::World,
                &["native-legacy-initialize", &fingerprint],
            )
            .map_err(|e| validation(&e.to_string()))?,
        ))
        .map_err(|e| validation(&e.to_string()))?;
    }
    tables.simulation_receipts[0].input_fingerprint = fingerprint.clone();
    store
        .create(request, tables, fingerprint)
        .map_err(store_error)
}
pub fn manage(
    store: &NativeStore,
    command: ManagementCommand,
) -> Result<ManagementOutcome, CommandError> {
    game_core::management::fingerprint(&command)?;
    store.manage(command).map_err(store_error)
}
