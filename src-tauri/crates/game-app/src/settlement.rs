use crate::{store_error, CommandError, NativeStore};
use game_core::{progression::AdvanceOutcome, settlement, SnapshotTables};

fn tables(
    store: &NativeStore,
    request: &settlement::SettleTransferRequest,
) -> Result<SnapshotTables, CommandError> {
    Ok(store
        .export_snapshot(
            request.campaign_id.as_str(),
            "settlement-read",
            &request.now,
        )
        .map_err(store_error)?
        .tables)
}
pub fn settle_transfer(
    store: &NativeStore,
    request: settlement::SettleTransferRequest,
) -> Result<AdvanceOutcome, CommandError> {
    let prepared = settlement::prepare(&tables(store, &request)?, &request)?;
    store.settle(request, prepared).map_err(store_error)
}
