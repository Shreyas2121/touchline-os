//! Models and snapshot validation. Persistence, Tauri, and the filesystem stay outside this crate.

#![forbid(unsafe_code)]

mod boundary;
mod enums;
mod ids;
mod nulls;
mod numbers;
mod rows;
mod snapshot;
mod validate;

pub use boundary::{
    reject_client_operation, CommandError, HealthReport, StorageAvailability, APP_IDENTIFIER,
    CLIENT_OPERATIONS, PRODUCT_NAME,
};
pub use snapshot::{parse_snapshot, CampaignSnapshot, SnapshotError};
