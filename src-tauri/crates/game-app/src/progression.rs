use crate::{store_error, CommandError, NativeStore};
use game_core::{
    progression::{
        critical_material, evaluate, preview_saved, AdvanceOutcome, AdvanceRequest, TimePreview,
    },
    EntityId,
};
use game_store::advance_fingerprint;

const PREVIEW_STAMP: &str = "2026-01-01T00:00:00.000Z";

fn tables(
    store: &NativeStore,
    campaign_id: &EntityId,
) -> Result<game_core::SnapshotTables, CommandError> {
    Ok(store
        .export_snapshot(campaign_id.as_str(), "clock-preview", PREVIEW_STAMP)
        .map_err(store_error)?
        .tables)
}

pub fn preview_time(
    store: &NativeStore,
    campaign_id: EntityId,
) -> Result<TimePreview, CommandError> {
    preview_saved(&tables(store, &campaign_id)?, &campaign_id)
}

pub fn advance_time(
    store: &NativeStore,
    request: AdvanceRequest,
) -> Result<AdvanceOutcome, CommandError> {
    let saved = tables(store, &request.campaign_id)?;
    let fingerprint = advance_fingerprint(&critical_material(&saved, &request)?);
    // Plan against the current read, then let the write transaction recheck.
    evaluate(&saved, &request, &fingerprint)?;
    store.advance(request).map_err(store_error)
}
