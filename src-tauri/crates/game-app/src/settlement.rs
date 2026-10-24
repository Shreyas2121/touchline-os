use crate::{CommandError, NativeStore};
use game_core::{progression::AdvanceOutcome, settlement, SnapshotTables};

fn tables(
    store: &NativeStore,
    request: &settlement::SettleTransferRequest,
) -> Result<SnapshotTables, CommandError> {
    store
        .read_campaign(request.campaign_id.as_str())
        .map_err(|error| crate::reads::store_error_at("settlement.tables", error))
}
pub fn settle_transfer(
    store: &NativeStore,
    request: settlement::SettleTransferRequest,
) -> Result<AdvanceOutcome, CommandError> {
    let prepared = settlement::prepare(&tables(store, &request)?, &request)?;
    store
        .settle(request, prepared)
        .map_err(|error| crate::reads::store_error_at("settle_transfer", error))
}
