//! Models and snapshot validation. Persistence, Tauri, and the filesystem stay outside this crate.

#![forbid(unsafe_code)]

mod boundary;
pub mod calendar;
pub mod dates;
mod enums;
pub mod finance;
pub mod guards;
mod ids;
pub mod money;
mod nulls;
mod numbers;
pub mod policy;
pub mod random;
mod rows;
pub mod selection;
mod snapshot;
mod validate;

pub use boundary::{
    reject_client_operation, CommandError, HealthReport, StorageAvailability, APP_IDENTIFIER,
    CLIENT_OPERATIONS, PRODUCT_NAME,
};
pub use enums::*;
pub use ids::{EntityId, Euro, FormatVersion, VersionOne};
pub use numbers::{MoneyCents, SafeInt, JS_MAX_SAFE_INTEGER};
pub use rows::*;
pub use snapshot::{parse_snapshot, CampaignSnapshot, SnapshotError};

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
