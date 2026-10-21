use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const PRODUCT_NAME: &str = "Touchline OS";
pub const APP_IDENTIFIER: &str = "com.touchline.os";

pub const CLIENT_OPERATIONS: &[&str] = &[
    "read-campaign",
    "read-seasons",
    "read-leagues",
    "read-clubs",
    "read-players",
    "read-player",
    "read-contracts",
    "read-constitution",
    "read-ledger",
    "read-transfers",
    "read-offers",
    "read-lineups",
    "read-registrations",
    "read-matches",
    "read-appearances",
    "read-shortlist",
    "read-scouting",
    "read-development",
    "read-audit",
    "read-import-receipts",
    "read-simulation",
    "preview-contract",
    "preview-constitution",
    "preview-ledger",
    "preview-transfer",
    "preview-offer",
    "preview-lineup",
    "preview-registration",
    "preview-match",
    "write-start-standalone-campaign",
    "write-create-campaign",
    "write-rename-campaign",
    "write-set-campaign-archived",
    "write-delete-campaign",
    "write-select-managed-club",
    "write-seed-demo",
    "write-reset-demo",
    "write-reset-standalone-demo",
    "write-add-player",
    "write-update-player",
    "write-save-contract",
    "write-save-constitution",
    "write-post-ledger-entry",
    "write-reverse-ledger-entry",
    "write-record-transfer",
    "write-record-offer",
    "write-accept-offer",
    "write-reject-offer",
    "write-record-match",
    "write-save-lineup",
    "write-delete-lineup",
    "write-save-registration",
    "write-save-shortlist-item",
    "write-close-shortlist-item",
    "write-save-development-note",
    "migrate-export-source",
    "migrate-validate-snapshot",
    "migrate-import-snapshot",
    "clock-read",
    "clock-advance",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StorageAvailability {
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HealthReport {
    pub product: String,
    pub identifier: String,
    pub profile: String,
    pub storage: String,
    pub features: String,
    pub dexie_fallback: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "code", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CommandError {
    Conflict { message: String },
    Scope { message: String },
    Unavailable { message: String },
    Validation { message: String },
    Internal { message: String },
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Conflict { message }
            | Self::Scope { message }
            | Self::Unavailable { message }
            | Self::Validation { message }
            | Self::Internal { message } => formatter.write_str(message),
        }
    }
}

impl std::error::Error for CommandError {}

pub fn reject_client_operation(name: &str) -> Result<(), CommandError> {
    if name.len() > 80 || !CLIENT_OPERATIONS.contains(&name) {
        return Err(CommandError::Validation {
            message: "Unknown operation.".into(),
        });
    }
    Err(CommandError::Unavailable {
        message: format!("{name} is not available until a later migration guide."),
    })
}
