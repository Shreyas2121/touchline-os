use crate::enums::SourceStorage;
use crate::ids::{EntityId, FormatVersion};
use crate::numbers::SafeInt;
use crate::rows::SnapshotTables;
use crate::validate::{reject_null_attributes, validate_snapshot, walk_json};
use serde::{Deserialize, Serialize};
use std::fmt;
use ts_rs::TS;

pub const MAX_UTF8_BYTES: usize = 32 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SnapshotError {
    UnsupportedVersion(String),
    InvalidEnum(String),
    UnsafeMoney(String),
    MalformedId(String),
    Invalid(String),
}

impl fmt::Display for SnapshotError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedVersion(message) => {
                write!(formatter, "unsupported version: {message}")
            }
            Self::InvalidEnum(message) => write!(formatter, "invalid enum: {message}"),
            Self::UnsafeMoney(message) => write!(formatter, "unsafe money: {message}"),
            Self::MalformedId(message) => write!(formatter, "malformed id: {message}"),
            Self::Invalid(message) => write!(formatter, "invalid snapshot: {message}"),
        }
    }
}

impl std::error::Error for SnapshotError {}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CampaignSnapshot {
    pub format: crate::enums::SnapshotFormat,
    pub format_version: FormatVersion,
    pub source_storage: SourceStorage,
    pub source_schema_version: SafeInt,
    pub export_id: EntityId,
    pub exported_at: String,
    pub campaign_revision: SafeInt,
    pub tables: SnapshotTables,
}

pub fn parse_snapshot(bytes: &[u8]) -> Result<CampaignSnapshot, SnapshotError> {
    if bytes.len() > MAX_UTF8_BYTES {
        return Err(SnapshotError::Invalid("snapshot is too large".into()));
    }
    let mut value: serde_json::Value = serde_json::from_slice(bytes).map_err(classify)?;
    walk_json(&value, 0)?;
    // Only source v1 may omit the metadata introduced by the browser v2 upgrade.
    if value
        .get("sourceStorage")
        .and_then(|source| serde_json::from_value::<SourceStorage>(source.clone()).ok())
        == Some(SourceStorage::Indexeddb)
        && value
            .get("sourceSchemaVersion")
            .and_then(serde_json::Value::as_i64)
            == Some(1)
    {
        if let Some(tables) = value
            .get_mut("tables")
            .and_then(serde_json::Value::as_object_mut)
        {
            if let Some(campaigns) = tables
                .get_mut("campaigns")
                .and_then(serde_json::Value::as_array_mut)
            {
                for campaign in campaigns {
                    if let Some(row) = campaign.as_object_mut() {
                        row.entry("mode")
                            .or_insert_with(|| serde_json::json!("legacy"));
                        row.entry("rulesMode")
                            .or_insert_with(|| serde_json::json!("sandbox"));
                    }
                }
            }
            for name in [
                "simulationStates",
                "clubSimulationStates",
                "playerSimulationStates",
                "simulationReceipts",
            ] {
                tables.entry(name).or_insert_with(|| serde_json::json!([]));
            }
        }
    }
    reject_null_attributes(&value)?;
    let snapshot: CampaignSnapshot = serde_json::from_value(value).map_err(classify)?;
    validate_snapshot(&snapshot)?;
    Ok(snapshot)
}

fn classify(error: serde_json::Error) -> SnapshotError {
    let message = error.to_string();
    if message.contains("malformed id") {
        SnapshotError::MalformedId(message)
    } else if message.contains("unsafe money") {
        SnapshotError::UnsafeMoney(message)
    } else if message.contains("unsupported version") {
        SnapshotError::UnsupportedVersion(message)
    } else if message.contains("unknown variant") || message.contains("invalid enum") {
        SnapshotError::InvalidEnum(message)
    } else {
        SnapshotError::Invalid(message)
    }
}
