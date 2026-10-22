use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const PRODUCT_NAME: &str = "Touchline OS";
pub const APP_IDENTIFIER: &str = "com.touchline.os";

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
