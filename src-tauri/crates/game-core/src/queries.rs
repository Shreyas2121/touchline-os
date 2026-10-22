//! Transport models for bounded native reads. SQL and file access belong outside core.
use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
pub enum Screen {
    CommandCenter,
    Squad,
    Tactics,
    Transfers,
    Finance,
    Registration,
    Scouting,
    Matches,
    Seasons,
    Constitution,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScreenQuery {
    pub campaign_id: EntityId,
    pub screen: Screen,
    pub page: SafeInt,
    pub search: String,
    // Only transfer search can use the whole campaign player pool.
    pub all_players: bool,
}
impl ScreenQuery {
    pub fn validate(&self) -> CoreResult<()> {
        if !(0..=10_000).contains(&self.page.get()) || self.search.encode_utf16().count() > 120 {
            return Err(CoreError::Invalid("Invalid page or search."));
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CampaignPage {
    pub campaigns: Vec<CampaignRow>,
    pub page: SafeInt,
    pub total: SafeInt,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlayerFact {
    pub player_id: EntityId,
    pub age: String,
    pub availability: String,
    pub homegrown_club: Option<bool>,
    pub homegrown_nation: Option<bool>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlayerPlanning {
    pub player: PlayerRow,
    pub revision: SafeInt,
    pub note: Option<DevelopmentPlanRow>,
    pub shortlist: Option<ShortlistItemRow>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeFinance {
    pub capacity: String,
    pub wages: String,
    pub tiers: BTreeMap<String, String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeVerdict {
    pub code: String,
    pub message: String,
    pub remedy: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeReport {
    pub label: String,
    pub allowed: bool,
    pub verdicts: Vec<NativeVerdict>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScreenModel {
    pub revision: SafeInt,
    // Only the requested screen's bounded rows, never a whole-world response.
    pub rows: SnapshotTables,
    pub totals: BTreeMap<String, SafeInt>,
    pub page: SafeInt,
    pub player_facts: Vec<PlayerFact>,
    pub finance: Option<NativeFinance>,
    pub active_constitution: Option<ConstitutionRow>,
    pub reports: Vec<NativeReport>,
    pub labels: BTreeMap<String, String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MigrationSummary {
    pub campaign: CampaignRow,
    pub source_storage: SourceStorage,
    pub source_schema_version: SafeInt,
    pub counts: BTreeMap<String, SafeInt>,
    pub token: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MigrationResult {
    pub campaign_id: String,
    pub revision: SafeInt,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreviewQuery {
    pub campaign_id: EntityId,
    pub expected_revision: SafeInt,
    pub effective_date: String,
    pub action: crate::policy::PolicyAction,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativePreview {
    pub revision: SafeInt,
    pub report: NativeReport,
    pub before_capacity: String,
    pub after_capacity: String,
    pub before_wages: String,
    pub after_wages: String,
}
