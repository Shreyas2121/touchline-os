use crate::{settlement::settle_transfer, store_error, CommandError, NativeStore};
use game_core::{
    market_ops::{
        self, CloseWindowRequest, MarketCommand, MarketPreview, OfferDecision,
        ProposeTransferRequest, RespondNegotiationRequest, RespondOfferRequest, RunMarketRequest,
        TransferBoard,
    },
    progression::AdvanceOutcome,
    EntityId, SnapshotTables,
};

fn tables(store: &NativeStore, campaign_id: &str) -> Result<SnapshotTables, CommandError> {
    store.read_campaign(campaign_id).map_err(store_error)
}

pub fn preview_market(
    store: &NativeStore,
    campaign_id: EntityId,
) -> Result<MarketPreview, CommandError> {
    market_ops::preview(&tables(store, campaign_id.as_str())?, &campaign_id)
}

pub fn transfer_board(
    store: &NativeStore,
    campaign_id: EntityId,
) -> Result<TransferBoard, CommandError> {
    market_ops::transfer_board(&tables(store, campaign_id.as_str())?, &campaign_id)
}

pub fn run_market(
    store: &NativeStore,
    request: RunMarketRequest,
) -> Result<AdvanceOutcome, CommandError> {
    store
        .market(MarketCommand::Run(request))
        .map_err(store_error)
}

pub fn close_window(
    store: &NativeStore,
    request: CloseWindowRequest,
) -> Result<AdvanceOutcome, CommandError> {
    store
        .market(MarketCommand::Close(request))
        .map_err(store_error)
}

pub fn propose_transfer(
    store: &NativeStore,
    request: ProposeTransferRequest,
) -> Result<AdvanceOutcome, CommandError> {
    store
        .market(MarketCommand::Propose(request))
        .map_err(store_error)
}

pub fn respond_negotiation(
    store: &NativeStore,
    request: RespondNegotiationRequest,
) -> Result<AdvanceOutcome, CommandError> {
    store
        .market(MarketCommand::RespondNegotiation(request))
        .map_err(store_error)
}

pub fn respond_offer(
    store: &NativeStore,
    request: RespondOfferRequest,
) -> Result<AdvanceOutcome, CommandError> {
    if request.decision == OfferDecision::Accept {
        let settlement = market_ops::accept_settlement_request(
            &tables(store, request.campaign_id.as_str())?,
            &request,
        )?;
        return settle_transfer(store, settlement);
    }
    store
        .market(MarketCommand::RejectOffer(request))
        .map_err(store_error)
}
