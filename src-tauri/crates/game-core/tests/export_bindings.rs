use game_core::{CampaignSnapshot, CommandError, HealthReport};
use ts_rs::{Config, TS};

#[test]
fn export_bindings() {
    let Ok(directory) = std::env::var("TOUCHLINE_EXPORT_BINDINGS") else {
        return;
    };
    let path = std::path::PathBuf::from(directory);
    std::fs::create_dir_all(&path).expect("binding directory");
    let config = Config::new().with_out_dir(&path).with_large_int("number");
    CampaignSnapshot::export_all(&config).expect("snapshot bindings");
    HealthReport::export_all(&config).expect("health bindings");
    CommandError::export_all(&config).expect("error bindings");
    game_core::lifecycle_ops::LifecyclePreview::export_all(&config)
        .expect("lifecycle preview bindings");
    game_core::lifecycle_ops::LifecycleRequest::export_all(&config)
        .expect("lifecycle request bindings");
    game_core::matchday::MatchdayPreview::export_all(&config).expect("matchday preview bindings");
    game_core::matchday::SimMatchdayRequest::export_all(&config)
        .expect("matchday request bindings");
    game_core::matchday::MatchdayView::export_all(&config).expect("matchday view bindings");
    game_core::management::CreationRequest::export_all(&config).expect("creation bindings");
    game_core::management::ClubChoices::export_all(&config).expect("club choice bindings");
    game_core::management::ManagementCommand::export_all(&config).expect("management bindings");
    game_core::management::ManagementOutcome::export_all(&config)
        .expect("management result bindings");
    game_core::queries::ScreenQuery::export_all(&config).expect("query bindings");
    game_core::queries::PlayerPlanning::export_all(&config).expect("player planning bindings");
    game_core::queries::ScreenModel::export_all(&config).expect("screen bindings");
    game_core::queries::CampaignPage::export_all(&config).expect("campaign page bindings");
    game_core::queries::MigrationSummary::export_all(&config).expect("migration bindings");
    game_core::queries::MigrationResult::export_all(&config).expect("import outcome bindings");
    game_core::queries::PreviewQuery::export_all(&config).expect("preview input bindings");
    game_core::queries::NativePreview::export_all(&config).expect("preview bindings");
    game_core::progression::TimePreview::export_all(&config).expect("time preview bindings");
    game_core::progression::AdvanceRequest::export_all(&config).expect("advance bindings");
    game_core::progression::AdvanceOutcome::export_all(&config).expect("advance result bindings");
    game_core::settlement::SettleTransferRequest::export_all(&config).expect("settlement bindings");
    game_core::market_ops::MarketPreview::export_all(&config).expect("market preview bindings");
    game_core::market_ops::RunMarketRequest::export_all(&config).expect("run market bindings");
    game_core::market_ops::CloseWindowRequest::export_all(&config).expect("close window bindings");
    game_core::market_ops::ProposeTransferRequest::export_all(&config).expect("proposal bindings");
    game_core::market_ops::RespondNegotiationRequest::export_all(&config)
        .expect("negotiation response bindings");
    game_core::market_ops::RespondOfferRequest::export_all(&config)
        .expect("offer response bindings");
    game_core::market_ops::TransferBoard::export_all(&config).expect("transfer board bindings");
}
