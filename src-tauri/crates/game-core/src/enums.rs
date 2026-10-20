use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
pub enum SnapshotFormat {
    #[serde(rename = "touchline-campaign")]
    TouchlineCampaign,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum SourceStorage {
    Indexeddb,
    Sqlite,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum CampaignKind {
    Fictional,
    Imported,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum CampaignMode {
    Legacy,
    Standalone,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum RulesMode {
    Challenge,
    Sandbox,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum CampaignStatus {
    Active,
    Archived,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum SeasonStatus {
    Active,
    Closed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
pub enum RecordSource {
    #[serde(rename = "fictional")]
    Fictional,
    #[serde(rename = "imported")]
    Imported,
    #[serde(rename = "user-entered")]
    UserEntered,
    #[serde(rename = "estimated")]
    Estimated,
    #[serde(rename = "generated")]
    Generated,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
pub enum PositionGroup {
    #[serde(rename = "GK")]
    Gk,
    #[serde(rename = "DEF")]
    Def,
    #[serde(rename = "MID")]
    Mid,
    #[serde(rename = "FWD")]
    Fwd,
    #[serde(rename = "UNKNOWN")]
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
pub enum Position {
    #[serde(rename = "GK")]
    Gk,
    #[serde(rename = "CB")]
    Cb,
    #[serde(rename = "LB")]
    Lb,
    #[serde(rename = "RB")]
    Rb,
    #[serde(rename = "LWB")]
    Lwb,
    #[serde(rename = "RWB")]
    Rwb,
    #[serde(rename = "CDM")]
    Cdm,
    #[serde(rename = "CM")]
    Cm,
    #[serde(rename = "CAM")]
    Cam,
    #[serde(rename = "LM")]
    Lm,
    #[serde(rename = "RM")]
    Rm,
    #[serde(rename = "LW")]
    Lw,
    #[serde(rename = "RW")]
    Rw,
    #[serde(rename = "ST")]
    St,
    #[serde(rename = "CF")]
    Cf,
    #[serde(rename = "UNKNOWN")]
    Unknown,
}

pub fn position_group_for(position: Position) -> PositionGroup {
    match position {
        Position::Gk => PositionGroup::Gk,
        Position::Cb | Position::Lb | Position::Rb | Position::Lwb | Position::Rwb => {
            PositionGroup::Def
        }
        Position::Cdm | Position::Cm | Position::Cam | Position::Lm | Position::Rm => {
            PositionGroup::Mid
        }
        Position::Lw | Position::Rw | Position::St | Position::Cf => PositionGroup::Fwd,
        Position::Unknown => PositionGroup::Unknown,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum SquadTier {
    Key,
    Rotation,
    Youth,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum ContractStatus {
    Active,
    Ended,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum LedgerKind {
    InitialAllocation,
    PlayerSale,
    PrizeIncome,
    ApprovedCarryover,
    IncomingFee,
    Reversal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum TransferKind {
    Sale,
    Purchase,
    Free,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum OfferStatus {
    Open,
    Accepted,
    Rejected,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
pub enum Formation {
    #[serde(rename = "4-3-3")]
    F433,
    #[serde(rename = "4-2-3-1")]
    F4231,
    #[serde(rename = "4-4-2")]
    F442,
    #[serde(rename = "3-5-2")]
    F352,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum RegistrationStatus {
    Registered,
    Ineligible,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum HomeAway {
    Home,
    Away,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum OpenClosed {
    Open,
    Closed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum Confidence {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum ImportSourceType {
    Csv,
    Json,
    Backup,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum CalendarPhase {
    Preseason,
    League,
    Review,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum PlayerLife {
    Active,
    Retired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
pub enum AuditAction {
    #[serde(rename = "campaign.create")]
    CampaignCreate,
    #[serde(rename = "campaign.rename")]
    CampaignRename,
    #[serde(rename = "player.add")]
    PlayerAdd,
    #[serde(rename = "player.update")]
    PlayerUpdate,
    #[serde(rename = "player.note")]
    PlayerNote,
    #[serde(rename = "lineup.save")]
    LineupSave,
    #[serde(rename = "lineup.delete")]
    LineupDelete,
    #[serde(rename = "ledger.post")]
    LedgerPost,
    #[serde(rename = "ledger.reverse")]
    LedgerReverse,
    #[serde(rename = "constitution.save")]
    ConstitutionSave,
    #[serde(rename = "campaign.seed")]
    CampaignSeed,
    #[serde(rename = "campaign.archive")]
    CampaignArchive,
    #[serde(rename = "campaign.restore")]
    CampaignRestore,
    #[serde(rename = "campaign.delete")]
    CampaignDelete,
    #[serde(rename = "campaign.select-club")]
    CampaignSelectClub,
    #[serde(rename = "shortlist.save")]
    ShortlistSave,
    #[serde(rename = "shortlist.close")]
    ShortlistClose,
    #[serde(rename = "transfer.record")]
    TransferRecord,
    #[serde(rename = "offer.record")]
    OfferRecord,
    #[serde(rename = "offer.accept")]
    OfferAccept,
    #[serde(rename = "offer.reject")]
    OfferReject,
    #[serde(rename = "contract.save")]
    ContractSave,
    #[serde(rename = "registration.save")]
    RegistrationSave,
    #[serde(rename = "match.record")]
    MatchRecord,
    #[serde(rename = "simulation.initialize")]
    SimulationInitialize,
    #[serde(rename = "simulation.advance")]
    SimulationAdvance,
}
