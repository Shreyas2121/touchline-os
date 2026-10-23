use crate::{store_error, CommandError, EntityId, NativeStore, SafeInt};
use game_core::{matchday, progression::AdvanceOutcome, SnapshotTables};

fn tables(store: &NativeStore, campaign_id: &EntityId) -> Result<SnapshotTables, CommandError> {
    Ok(store
        .export_snapshot(
            campaign_id.as_str(),
            "matchday-read",
            "2026-01-01T00:00:00.000Z",
        )
        .map_err(store_error)?
        .tables)
}
pub fn preview_matchday(
    store: &NativeStore,
    campaign_id: EntityId,
) -> Result<matchday::MatchdayPreview, CommandError> {
    matchday::preview(&tables(store, &campaign_id)?, &campaign_id)
}
pub fn sim_matchday(
    store: &NativeStore,
    request: matchday::SimMatchdayRequest,
) -> Result<AdvanceOutcome, CommandError> {
    let prepared = matchday::prepare(&tables(store, &request.campaign_id)?, &request)?;
    store.matchday(request, prepared).map_err(store_error)
}
pub fn matchday_view(
    store: &NativeStore,
    campaign_id: EntityId,
    round: Option<SafeInt>,
) -> Result<matchday::MatchdayView, CommandError> {
    matchday::view(&tables(store, &campaign_id)?, &campaign_id, round)
}
