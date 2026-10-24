//! Window ticks, approaches, and the transfer board. Settlement of an agreed
//! AI deal uses the G04 movement in the same transaction as the tick.

mod commands;
mod context;
mod fingerprints;
mod planning;
mod projections;
mod types;
mod window;

pub use commands::{accept_settlement_request, commit};
pub use fingerprints::material;
pub use projections::{preview, transfer_board};
pub use types::{
    CloseWindowRequest, CompletedTransferView, IncomingOfferView, MarketAction, MarketCommand,
    MarketPreview, NegotiationDecision, OfferDecision, OutgoingNegotiationView,
    ProposeTransferRequest, RespondNegotiationRequest, RespondOfferRequest, RunMarketRequest,
    TransferBoard,
};
pub use window::{expire_noncompulsory, window_is_blocked};
