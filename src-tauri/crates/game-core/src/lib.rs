//! Models and snapshot validation. Persistence, Tauri, and the filesystem stay outside this crate.

#![forbid(unsafe_code)]

pub mod ability;
mod boundary;
pub mod calendar;
pub mod career;
pub mod dates;
mod enums;
mod fictional_names;
pub mod finance;
pub mod generation;
mod generation_settings;
pub mod guards;
mod ids;
pub mod lifecycle;
pub mod management;
pub mod market;
pub mod market_ops;
pub mod match_engine;
pub mod match_selection;
pub mod matchday;
pub mod money;
mod nulls;
mod numbers;
pub mod policy;
pub mod progression;
pub mod queries;
pub mod random;
mod rows;
pub mod schedule;
pub mod selection;
pub mod settlement;
mod snapshot;
mod validate;
mod world_validation;

pub use boundary::{CommandError, HealthReport, StorageAvailability, APP_IDENTIFIER, PRODUCT_NAME};
pub use enums::*;
pub use ids::{EntityId, Euro, FormatVersion, VersionOne};
pub use market::{resolve_terms, Agreement, TermProposal};
pub use numbers::{MoneyCents, SafeInt, JS_MAX_SAFE_INTEGER};
pub use rows::*;
pub use snapshot::{
    decode_campaign_tables, decode_snapshot, parse_snapshot, validate_campaign_json,
    validate_campaign_tables, CampaignSnapshot, SnapshotError, MAX_UTF8_BYTES,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CoreError {
    Invalid(&'static str),
    Arithmetic,
}
impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Invalid(message) => f.write_str(message),
            Self::Arithmetic => f.write_str("Arithmetic is outside the safe integer range."),
        }
    }
}
impl std::error::Error for CoreError {}
pub type CoreResult<T> = Result<T, CoreError>;

/// ECMAScript TrimString whitespace, including BOM and excluding U+0085.
pub(crate) fn js_trim(text: &str) -> &str {
    text.trim_matches(|c: char| matches!(c, '\u{0009}'..='\u{000d}' | ' ' | '\u{00a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'))
}
