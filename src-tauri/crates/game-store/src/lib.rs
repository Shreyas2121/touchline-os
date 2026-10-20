//! Storage boundary. NM-G03 replaces this placeholder with SQLite. There is no database in this guide.

#![forbid(unsafe_code)]

use game_core::StorageAvailability;

pub fn storage_availability() -> StorageAvailability {
    StorageAvailability::Unavailable
}
