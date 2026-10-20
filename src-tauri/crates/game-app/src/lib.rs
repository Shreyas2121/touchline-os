//! Use cases for the shell. Reads, writes, import, and the clock stay unavailable until later guides.

#![forbid(unsafe_code)]

use game_core::{reject_client_operation, StorageAvailability, APP_IDENTIFIER, PRODUCT_NAME};
pub use game_core::{CommandError, HealthReport};
pub use game_store::{database_path, Store as NativeStore};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Profile {
    Dev,
    Test,
    Production,
}

impl Profile {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Dev => "dev",
            Self::Test => "test",
            Self::Production => "production",
        }
    }

    pub fn resolve(debug: bool, override_value: Option<&str>) -> Result<Self, CommandError> {
        match override_value {
            Some("dev") => Ok(Self::Dev),
            Some("test") => Ok(Self::Test),
            Some("production") => Ok(Self::Production),
            Some(_) => Err(CommandError::Validation {
                message: "Unknown profile.".into(),
            }),
            None if debug => Ok(Self::Dev),
            None => Ok(Self::Production),
        }
    }
}

pub fn health(profile: Profile) -> Result<HealthReport, CommandError> {
    let storage = match game_store::storage_availability() {
        StorageAvailability::Unavailable => "unavailable",
    };
    Ok(HealthReport {
        product: PRODUCT_NAME.into(),
        identifier: APP_IDENTIFIER.into(),
        profile: profile.as_str().into(),
        storage: storage.into(),
        features: "unavailable".into(),
        dexie_fallback: false,
    })
}

pub fn client_operation(name: &str) -> Result<(), CommandError> {
    reject_client_operation(name)
}

#[cfg(test)]
mod tests {
    use super::{client_operation, health, Profile};
    use game_core::CommandError;

    #[test]
    fn health_reports_storage_unavailable() {
        let report = health(Profile::Test).expect("health");
        assert_eq!(report.storage, "unavailable");
        assert_eq!(report.features, "unavailable");
        assert!(!report.dexie_fallback);
        assert_eq!(report.profile, "test");
        assert_eq!(report.identifier, "com.touchline.os");
    }

    #[test]
    fn profiles_stay_isolated() {
        assert_ne!(Profile::Dev.as_str(), Profile::Test.as_str());
        assert_eq!(Profile::resolve(true, None).expect("dev").as_str(), "dev");
        assert_eq!(
            Profile::resolve(false, None).expect("production").as_str(),
            "production"
        );
        assert!(Profile::resolve(true, Some("other")).is_err());
    }

    #[test]
    fn known_operations_are_unavailable() {
        let error = client_operation("clock-advance").expect_err("unavailable");
        assert!(matches!(error, CommandError::Unavailable { .. }));
        let unknown = client_operation("../touchline.sqlite3").expect_err("rejected");
        assert!(matches!(unknown, CommandError::Validation { .. }));
    }
}
