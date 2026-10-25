//! Native queries, migration and guarded career management use cases.

#![forbid(unsafe_code)]
pub mod diagnostics;
mod lifecycle;
mod management;
mod market;
mod matchday;
mod migration;
mod progression;
mod reads;
mod settlement;
pub use game_core::lifecycle_ops::{LifecyclePreview, LifecycleRequest};
pub use game_core::management::ClubChoices;
pub use game_core::management::{CreationRequest, ManagementCommand, ManagementOutcome};
pub use game_core::market_ops::{
    CloseWindowRequest, MarketPreview, ProposeTransferRequest, RespondNegotiationRequest,
    RespondOfferRequest, RunMarketRequest, TransferBoard,
};
pub use game_core::matchday::{MatchdayPreview, MatchdayView, SimMatchdayRequest};
pub use game_core::progression::{AdvanceOutcome, AdvanceRequest, TimePreview};
pub use game_core::settlement::SettleTransferRequest;
pub use game_core::{queries::*, EntityId, PlayerRow, SafeInt};
pub use lifecycle::{apply_development, preview_development, preview_season, settle_season};
pub use management::{create_career, manage, preview_creation};
pub use market::{
    close_window, preview_market, propose_transfer, respond_negotiation, respond_offer, run_market,
    transfer_board,
};
pub use matchday::{matchday_view, preview_matchday, sim_matchday};
pub use migration::{backup_file, export_file, MigrationSession};
pub use progression::{advance_time, preview_time};
pub use reads::{preview, read_screen, store_error, store_error_at, validation};
pub use settlement::settle_transfer;

pub use game_core::{CommandError, HealthReport};
use game_core::{APP_IDENTIFIER, PRODUCT_NAME};
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
    Ok(HealthReport {
        product: PRODUCT_NAME.into(),
        identifier: APP_IDENTIFIER.into(),
        profile: profile.as_str().into(),
        storage: "sqlite".into(),
        features: "management".into(),
        dexie_fallback: false,
    })
}

#[cfg(test)]
mod tests {
    use super::{health, Profile};

    #[test]
    fn health_reports_read_migration_capabilities() {
        let report = health(Profile::Test).expect("health");
        assert_eq!(report.storage, "sqlite");
        assert_eq!(report.features, "management");
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
}
