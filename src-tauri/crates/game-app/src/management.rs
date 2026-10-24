use crate::{validation, CommandError, NativeStore};
use game_core::{career::*, generation::*, management::*};

pub fn preview_creation(request: CreationRequest) -> Result<ClubChoices, CommandError> {
    signature(&request)?;
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
fn signature(request: &CreationRequest) -> Result<String, CommandError> {
    // Validate creation and scoped demo reset before receipt lookup.
    require_supported_creation(request)?;
    if request
        .reset_revision
        .is_some_and(|revision| revision.get() < 0)
    {
        return Err(validation("Reset revision must be non-negative."));
    }
    let input = input_fingerprint(&request.career).map_err(|e| validation(&e.to_string()))?;
    // Gameplay identity excludes generated transport IDs and audit time.
    let canonical = serde_json::to_string(&(request.kind, input, &request.career.preset))
        .map_err(|_| validation("Creation input could not be encoded."))?;
    Ok(game_store::creation_fingerprint(&canonical))
}
pub fn create_career(
    store: &NativeStore,
    request: CreationRequest,
) -> Result<ManagementOutcome, CommandError> {
    let fingerprint = signature(&request)?;
    if let Some(result) = store
        .creation_probe(request.clone(), fingerprint.clone())
        .map_err(|error| crate::reads::store_error_at("create_career", error))?
    {
        return Ok(result);
    }
    let prepared =
        prepare_standalone_career(&request.career).map_err(|e| validation(&e.to_string()))?;
    store
        .create(request, prepared.into_tables(), fingerprint)
        .map_err(|error| crate::reads::store_error_at("create_career", error))
}
pub fn manage(
    store: &NativeStore,
    command: ManagementCommand,
) -> Result<ManagementOutcome, CommandError> {
    game_core::management::fingerprint(&command)?;
    store
        .manage(command)
        .map_err(|error| crate::reads::store_error_at("manage", error))
}
