use crate::enums::{
    AuditAction, CalendarPhase, CampaignKind, CampaignMode, CampaignStatus, Confidence,
    ContractStatus, Formation, ImportSourceType, LedgerKind, OfferStatus, OpenClosed, PlayerLife,
    Position, PositionGroup, RecordSource, RegistrationStatus, RulesMode, SeasonStatus, SquadTier,
    TransferKind,
};
use crate::ids::{EntityId, Euro, VersionOne};
use crate::nulls::nullable;
use crate::numbers::{MoneyCents, SafeInt};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CampaignRow {
    pub id: EntityId,
    pub name: String,
    pub kind: CampaignKind,
    pub mode: CampaignMode,
    pub rules_mode: RulesMode,
    #[serde(deserialize_with = "nullable")]
    pub seed: Option<String>,
    #[serde(deserialize_with = "nullable")]
    pub generator_version: Option<String>,
    pub managed_club_id: EntityId,
    pub active_season_id: EntityId,
    pub currency: Euro,
    pub created_at: String,
    pub updated_at: String,
    pub revision: SafeInt,
    pub status: CampaignStatus,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SeasonRow {
    pub id: EntityId,
    pub campaign_id: EntityId,
    pub label: String,
    pub ordinal: SafeInt,
    pub status: SeasonStatus,
    #[serde(deserialize_with = "nullable")]
    pub start_date: Option<String>,
    #[serde(deserialize_with = "nullable")]
    pub end_date: Option<String>,
    pub opened_at: String,
    #[serde(deserialize_with = "nullable")]
    pub closed_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LeagueRow {
    pub id: EntityId,
    pub campaign_id: EntityId,
    pub name: String,
    #[serde(deserialize_with = "nullable")]
    pub country_code: Option<String>,
    #[serde(deserialize_with = "nullable")]
    pub tier: Option<SafeInt>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct ClubColors {
    pub primary: String,
    pub secondary: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClubRow {
    pub id: EntityId,
    pub campaign_id: EntityId,
    #[serde(deserialize_with = "nullable")]
    pub league_id: Option<EntityId>,
    pub name: String,
    pub short_name: String,
    pub colors: ClubColors,
    pub prestige: SafeInt,
    pub academy_tier: SafeInt,
    #[serde(deserialize_with = "nullable")]
    pub scouting_region: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlayerAttributes {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub pace: Option<SafeInt>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub finishing: Option<SafeInt>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub passing: Option<SafeInt>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub dribbling: Option<SafeInt>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub defending: Option<SafeInt>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub physical: Option<SafeInt>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlayerRow {
    pub id: EntityId,
    pub campaign_id: EntityId,
    #[serde(deserialize_with = "nullable")]
    pub club_id: Option<EntityId>,
    pub name: String,
    pub position_group: PositionGroup,
    pub positions: Vec<Position>,
    #[serde(deserialize_with = "nullable")]
    pub nationality_code: Option<String>,
    #[serde(deserialize_with = "nullable")]
    pub birth_date: Option<String>,
    #[serde(deserialize_with = "nullable")]
    pub reported_age: Option<SafeInt>,
    #[serde(deserialize_with = "nullable")]
    pub age_reference_season_ordinal: Option<SafeInt>,
    #[serde(deserialize_with = "nullable")]
    pub market_value_cents: Option<MoneyCents>,
    pub attributes: PlayerAttributes,
    #[serde(deserialize_with = "nullable")]
    pub potential: Option<SafeInt>,
    pub source: RecordSource,
    #[serde(deserialize_with = "nullable")]
    pub external_source_id: Option<String>,
    pub is_newgen: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContractRow {
    pub id: EntityId,
    pub campaign_id: EntityId,
    pub player_id: EntityId,
    pub club_id: EntityId,
    #[serde(deserialize_with = "nullable")]
    pub weekly_wage_cents: Option<MoneyCents>,
    #[serde(deserialize_with = "nullable")]
    pub squad_tier: Option<SquadTier>,
    #[serde(deserialize_with = "nullable")]
    pub starts_on: Option<String>,
    #[serde(deserialize_with = "nullable")]
    pub expires_on: Option<String>,
    pub status: ContractStatus,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "id", rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum ConstitutionRule {
    #[serde(rename = "SELL_TO_BUY")]
    SellToBuy {
        enabled: bool,
        sales_reinvestment_pct: SafeInt,
        prize_reinvestment_pct: SafeInt,
        carryover_pct: SafeInt,
        initial_allocation_cents: MoneyCents,
    },
    #[serde(rename = "MAX_SIGNING_AGE")]
    MaxSigningAge {
        enabled: bool,
        max_age: SafeInt,
        free_transfers_exempt: bool,
    },
    #[serde(rename = "WAGE_TIER_CAP")]
    WageTierCap {
        enabled: bool,
        key_weekly_cap_cents: MoneyCents,
        rotation_weekly_cap_cents: MoneyCents,
        youth_weekly_cap_cents: MoneyCents,
    },
    #[serde(rename = "PRESTIGE_BID_SALE")]
    PrestigeBidSale {
        enabled: bool,
        required_fee_numerator: SafeInt,
        required_fee_denominator: SafeInt,
        require_higher_prestige: bool,
    },
    #[serde(rename = "REGISTRATION_QUOTA")]
    RegistrationQuota {
        enabled: bool,
        roster_limit: SafeInt,
        minimum_homegrown: SafeInt,
        #[serde(deserialize_with = "nullable")]
        age_exemption_under: Option<SafeInt>,
        competition_key: String,
    },
}

impl ConstitutionRule {
    pub fn id_name(&self) -> &'static str {
        match self {
            Self::SellToBuy { .. } => "SELL_TO_BUY",
            Self::MaxSigningAge { .. } => "MAX_SIGNING_AGE",
            Self::WageTierCap { .. } => "WAGE_TIER_CAP",
            Self::PrestigeBidSale { .. } => "PRESTIGE_BID_SALE",
            Self::RegistrationQuota { .. } => "REGISTRATION_QUOTA",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConstitutionRow {
    pub id: EntityId,
    pub campaign_id: EntityId,
    pub version: SafeInt,
    pub rules: Vec<ConstitutionRule>,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LedgerEntryRow {
    pub id: EntityId,
    pub campaign_id: EntityId,
    pub season_id: EntityId,
    pub club_id: EntityId,
    pub kind: LedgerKind,
    pub amount_cents: MoneyCents,
    pub effective_on: String,
    pub source_action_id: EntityId,
    #[serde(deserialize_with = "nullable")]
    pub reverses_entry_id: Option<EntityId>,
    #[serde(deserialize_with = "nullable")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TransferRow {
    pub id: EntityId,
    pub campaign_id: EntityId,
    pub season_id: EntityId,
    pub player_id: EntityId,
    #[serde(deserialize_with = "nullable")]
    pub from_club_id: Option<EntityId>,
    #[serde(deserialize_with = "nullable")]
    pub to_club_id: Option<EntityId>,
    pub fee_cents: MoneyCents,
    pub kind: TransferKind,
    pub effective_on: String,
    pub source_action_id: EntityId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OfferRow {
    pub id: EntityId,
    pub campaign_id: EntityId,
    pub season_id: EntityId,
    pub player_id: EntityId,
    pub bidder_club_id: EntityId,
    pub fee_cents: MoneyCents,
    pub status: OfferStatus,
    pub received_on: String,
    #[serde(deserialize_with = "nullable")]
    pub resolved_on: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LineupStarter {
    pub player_id: EntityId,
    pub slot: String,
    #[serde(deserialize_with = "nullable")]
    pub role: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LineupRow {
    pub id: EntityId,
    pub campaign_id: EntityId,
    pub season_id: EntityId,
    pub name: String,
    pub formation: Formation,
    pub starters: Vec<LineupStarter>,
    pub bench_player_ids: Vec<EntityId>,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RegistrationRow {
    pub id: EntityId,
    pub campaign_id: EntityId,
    pub season_id: EntityId,
    pub player_id: EntityId,
    pub competition_key: String,
    pub status: RegistrationStatus,
    #[serde(deserialize_with = "nullable")]
    pub homegrown_club: Option<bool>,
    #[serde(deserialize_with = "nullable")]
    pub homegrown_nation: Option<bool>,
    #[serde(deserialize_with = "nullable")]
    pub age_exempt: Option<bool>,
    pub provenance: RecordSource,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShortlistItemRow {
    pub id: EntityId,
    pub campaign_id: EntityId,
    pub player_id: EntityId,
    pub priority: SafeInt,
    pub status: OpenClosed,
    #[serde(deserialize_with = "nullable")]
    pub notes: Option<String>,
    pub added_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoutingReportRow {
    pub id: EntityId,
    pub campaign_id: EntityId,
    pub player_id: EntityId,
    pub season_id: EntityId,
    pub archetype: String,
    pub observations: String,
    pub confidence: Confidence,
    pub source: RecordSource,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DevelopmentPlanRow {
    pub id: EntityId,
    pub campaign_id: EntityId,
    pub player_id: EntityId,
    pub season_id: EntityId,
    #[serde(deserialize_with = "nullable")]
    pub target_role: Option<String>,
    pub notes: String,
    pub status: OpenClosed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(transparent)]
#[ts(type = "{ [key: string]: unknown }")]
pub struct AuditPayload(pub Map<String, Value>);

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AuditEventRow {
    pub id: EntityId,
    pub campaign_id: EntityId,
    #[serde(deserialize_with = "nullable")]
    pub season_id: Option<EntityId>,
    pub action_id: EntityId,
    pub action_type: AuditAction,
    pub created_at: String,
    pub summary: String,
    pub payload: AuditPayload,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportReceiptRow {
    pub id: EntityId,
    #[serde(deserialize_with = "nullable")]
    pub campaign_id: Option<EntityId>,
    pub source_name: String,
    pub source_type: ImportSourceType,
    pub imported_at: String,
    pub row_counts: BTreeMap<String, SafeInt>,
    pub mapping_version: String,
    pub warnings: Vec<String>,
    pub provenance: RecordSource,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SimulationStateRow {
    pub id: EntityId,
    pub campaign_id: EntityId,
    pub active_season_id: EntityId,
    pub root_seed: String,
    pub simulation_version: VersionOne,
    pub calendar_version: VersionOne,
    pub current_date: String,
    pub phase: CalendarPhase,
    #[serde(deserialize_with = "nullable")]
    pub last_boundary_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClubSimulationStateRow {
    pub id: EntityId,
    pub campaign_id: EntityId,
    pub club_id: EntityId,
    pub simulation_key: String,
    pub transfer_balance_cents: MoneyCents,
    pub wage_budget_weekly_cents: MoneyCents,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlayerSimulationStateRow {
    pub id: EntityId,
    pub campaign_id: EntityId,
    pub player_id: EntityId,
    pub simulation_key: String,
    pub fitness: SafeInt,
    pub sharpness: SafeInt,
    #[serde(deserialize_with = "nullable")]
    pub goalkeeping: Option<SafeInt>,
    #[serde(deserialize_with = "nullable")]
    pub injury_until_date: Option<String>,
    pub suspension_matches: SafeInt,
    pub status: PlayerLife,
    pub homegrown_club: bool,
    pub homegrown_nation: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum OutcomeRef {
    #[serde(rename = "fixture")]
    Fixture { id: EntityId },
    #[serde(rename = "match")]
    Match { id: EntityId },
    #[serde(rename = "campaign")]
    Campaign { id: EntityId },
    #[serde(rename = "season")]
    Season { id: EntityId },
    #[serde(rename = "club")]
    Club { id: EntityId },
    #[serde(rename = "player")]
    Player { id: EntityId },
    #[serde(rename = "boundary")]
    Boundary { key: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SimulationReceiptRow {
    pub id: EntityId,
    pub campaign_id: EntityId,
    pub operation_key: String,
    pub input_revision: SafeInt,
    pub input_fingerprint: String,
    pub event_seed: SafeInt,
    pub simulation_version: VersionOne,
    pub outcome_refs: Vec<OutcomeRef>,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FixtureRow {
    pub id: EntityId,
    pub campaign_id: EntityId,
    pub season_id: EntityId,
    pub league_id: EntityId,
    pub round: SafeInt,
    pub match_date: String,
    pub home_club_id: EntityId,
    pub away_club_id: EntityId,
    pub fixture_key: String,
    pub status: crate::enums::FixtureStatus,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SimulatedMatchRow {
    pub id: EntityId,
    pub campaign_id: EntityId,
    pub fixture_id: EntityId,
    pub home_goals: SafeInt,
    pub away_goals: SafeInt,
    pub home_xg_milli: SafeInt,
    pub away_xg_milli: SafeInt,
    #[ts(type = "unknown")]
    pub timeline: Value,
    #[ts(type = "unknown")]
    pub input_snapshot: Value,
    pub event_seed: SafeInt,
    pub engine_version: VersionOne,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SimulatedAppearanceRow {
    pub id: EntityId,
    pub campaign_id: EntityId,
    pub fixture_id: EntityId,
    pub player_id: EntityId,
    pub club_id: EntityId,
    pub started: bool,
    pub minutes: SafeInt,
    pub goals: SafeInt,
    pub assists: SafeInt,
    pub rating: SafeInt,
    pub yellow_cards: SafeInt,
    pub red_cards: SafeInt,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SnapshotTables {
    #[serde(default)]
    pub fixtures: Vec<FixtureRow>,
    #[serde(default)]
    pub simulated_matches: Vec<SimulatedMatchRow>,
    #[serde(default)]
    pub simulated_appearances: Vec<SimulatedAppearanceRow>,

    pub campaigns: Vec<CampaignRow>,
    pub seasons: Vec<SeasonRow>,
    pub leagues: Vec<LeagueRow>,
    pub clubs: Vec<ClubRow>,
    pub players: Vec<PlayerRow>,
    pub contracts: Vec<ContractRow>,
    pub constitutions: Vec<ConstitutionRow>,
    pub ledger_entries: Vec<LedgerEntryRow>,
    pub transfers: Vec<TransferRow>,
    pub offers: Vec<OfferRow>,
    pub lineups: Vec<LineupRow>,
    pub registrations: Vec<RegistrationRow>,
    pub shortlist_items: Vec<ShortlistItemRow>,
    pub scouting_reports: Vec<ScoutingReportRow>,
    pub development_plans: Vec<DevelopmentPlanRow>,
    pub audit_events: Vec<AuditEventRow>,
    pub import_receipts: Vec<ImportReceiptRow>,
    pub simulation_states: Vec<SimulationStateRow>,
    pub club_simulation_states: Vec<ClubSimulationStateRow>,
    pub player_simulation_states: Vec<PlayerSimulationStateRow>,
    pub simulation_receipts: Vec<SimulationReceiptRow>,
}
