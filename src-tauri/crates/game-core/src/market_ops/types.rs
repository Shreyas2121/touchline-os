//! Market requests, command variants, and public read DTOs.
use crate::{EntityId, MoneyCents, NegotiationStatus, SafeInt, SquadTier, TransferKind};
use serde::Deserialize;
use serde::Serialize;
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
pub enum MarketAction {
    Run,
    Close,
    None,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MarketPreview {
    pub campaign_id: EntityId,
    pub revision: SafeInt,
    pub from_date: String,
    pub source_boundary_key: Option<String>,
    pub action: MarketAction,
    pub allowed: bool,
    pub reason: Option<String>,
    pub negotiation_count: SafeInt,
    pub offer_count: SafeInt,
    pub transfer_count: SafeInt,
    pub contract_count: SafeInt,
    pub ledger_count: SafeInt,
    pub registration_count: SafeInt,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunMarketRequest {
    pub campaign_id: EntityId,
    pub expected_revision: SafeInt,
    pub source_date: String,
    pub source_boundary_key: Option<String>,
    pub negotiation_ids: Vec<EntityId>,
    pub offer_ids: Vec<EntityId>,
    pub transfer_ids: Vec<EntityId>,
    pub contract_ids: Vec<EntityId>,
    pub ledger_ids: Vec<EntityId>,
    pub registration_ids: Vec<EntityId>,
    pub receipt_id: EntityId,
    pub audit_id: EntityId,
    pub action_id: EntityId,
    pub now: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CloseWindowRequest {
    pub campaign_id: EntityId,
    pub expected_revision: SafeInt,
    pub source_date: String,
    pub source_boundary_key: Option<String>,
    pub receipt_id: EntityId,
    pub audit_id: EntityId,
    pub action_id: EntityId,
    pub now: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProposeTransferRequest {
    pub campaign_id: EntityId,
    pub expected_revision: SafeInt,
    pub source_date: String,
    pub source_boundary_key: Option<String>,
    pub player_id: EntityId,
    pub fee_cents: MoneyCents,
    pub wage_cents: MoneyCents,
    pub squad_tier: SquadTier,
    pub negotiation_id: EntityId,
    pub receipt_id: EntityId,
    pub audit_id: EntityId,
    pub action_id: EntityId,
    pub now: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub enum NegotiationDecision {
    Accept,
    Withdraw,
    Counter {
        fee_cents: MoneyCents,
        wage_cents: MoneyCents,
        squad_tier: SquadTier,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RespondNegotiationRequest {
    pub campaign_id: EntityId,
    pub expected_revision: SafeInt,
    pub source_date: String,
    pub source_boundary_key: Option<String>,
    pub negotiation_id: EntityId,
    pub decision: NegotiationDecision,
    pub receipt_id: EntityId,
    pub audit_id: EntityId,
    pub action_id: EntityId,
    pub now: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
pub enum OfferDecision {
    Accept,
    Reject,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RespondOfferRequest {
    pub campaign_id: EntityId,
    pub expected_revision: SafeInt,
    pub source_date: String,
    pub source_boundary_key: Option<String>,
    pub offer_id: EntityId,
    pub decision: OfferDecision,
    pub transfer_id: EntityId,
    pub contract_id: EntityId,
    pub ledger_ids: Vec<EntityId>,
    pub registration_id: Option<EntityId>,
    pub receipt_id: EntityId,
    pub audit_id: EntityId,
    pub action_id: EntityId,
    pub now: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IncomingOfferView {
    pub offer_id: EntityId,
    pub negotiation_id: EntityId,
    pub player_name: String,
    pub bidder_name: String,
    pub fee_cents: MoneyCents,
    pub wage_cents: MoneyCents,
    pub squad_tier: SquadTier,
    pub term: String,
    pub deadline: String,
    pub compulsory: String,
    pub reject_allowed: bool,
    pub ledger_count: SafeInt,
    pub needs_registration: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OutgoingNegotiationView {
    pub negotiation_id: EntityId,
    pub player_name: String,
    pub seller_name: String,
    pub fee_cents: MoneyCents,
    pub wage_cents: MoneyCents,
    pub squad_tier: SquadTier,
    pub status: NegotiationStatus,
    pub deadline: String,
    pub can_withdraw: bool,
    pub can_settle: bool,
    pub ledger_count: SafeInt,
    pub needs_registration: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompletedTransferView {
    pub transfer_id: EntityId,
    pub player_name: String,
    pub other_club: String,
    pub fee_cents: MoneyCents,
    pub kind: TransferKind,
    pub effective_on: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TransferBoard {
    pub incoming: Vec<IncomingOfferView>,
    pub outgoing: Vec<OutgoingNegotiationView>,
    pub completed: Vec<CompletedTransferView>,
}

#[derive(Debug, Clone)]
pub enum MarketCommand {
    Run(RunMarketRequest),
    Close(CloseWindowRequest),
    Propose(ProposeTransferRequest),
    RespondNegotiation(RespondNegotiationRequest),
    RejectOffer(RespondOfferRequest),
}
