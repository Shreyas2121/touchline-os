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
}
