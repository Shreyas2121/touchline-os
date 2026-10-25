use crate::{AdvanceOutcome, CommandError, EntityId, NativeStore};
use game_core::lifecycle_ops::{self, LifecyclePreview, LifecycleRequest};

fn preview(
    store: &NativeStore,
    campaign: EntityId,
    end: bool,
) -> Result<LifecyclePreview, CommandError> {
    let tables = store
        .read_campaign(campaign.as_str())
        .map_err(|e| crate::reads::store_error_at("lifecycle.preview", e))?;
    let mut preview = lifecycle_ops::preview(&tables, &campaign, end)?;
    preview.input_fingerprint = game_store::lifecycle_fingerprint(
        &lifecycle_ops::preview_material(&tables, &preview, end)?,
    );
    Ok(preview)
}
fn apply(
    store: &NativeStore,
    request: LifecycleRequest,
    end: bool,
) -> Result<AdvanceOutcome, CommandError> {
    let tables = store
        .read_campaign(request.campaign_id.as_str())
        .map_err(|e| crate::reads::store_error_at("lifecycle.tables", e))?;
    let prepared = lifecycle_ops::prepare(&tables, &request, end)?;
    store
        .lifecycle(request, end, prepared)
        .map_err(|e| crate::reads::store_error_at("lifecycle.apply", e))
}
pub fn preview_development(
    store: &NativeStore,
    campaign: EntityId,
) -> Result<LifecyclePreview, CommandError> {
    preview(store, campaign, false)
}
pub fn apply_development(
    store: &NativeStore,
    request: LifecycleRequest,
) -> Result<AdvanceOutcome, CommandError> {
    apply(store, request, false)
}
pub fn preview_season(
    store: &NativeStore,
    campaign: EntityId,
) -> Result<LifecyclePreview, CommandError> {
    preview(store, campaign, true)
}
pub fn settle_season(
    store: &NativeStore,
    request: LifecycleRequest,
) -> Result<AdvanceOutcome, CommandError> {
    apply(store, request, true)
}
