use std::path::{Path, PathBuf};

use game_app::{
    client_operation as reject_operation, health as app_health, CommandError, HealthReport, Profile,
};
use tauri::Manager;

pub fn isolated_data_dir(app_data_dir: &Path, profile: &str) -> PathBuf {
    app_data_dir.join(profile)
}

fn prepare_profile_dir(app: &tauri::AppHandle) -> Result<Profile, CommandError> {
    let override_profile = std::env::var("TOUCHLINE_PROFILE").ok();
    let profile = Profile::resolve(cfg!(debug_assertions), override_profile.as_deref())?;
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| CommandError::Internal {
            message: "The app data directory is unavailable.".into(),
        })?;
    let directory = isolated_data_dir(&root, profile.as_str());
    std::fs::create_dir_all(&directory).map_err(|_| CommandError::Internal {
        message: "The app data directory could not be prepared.".into(),
    })?;
    Ok(profile)
}

#[tauri::command]
fn health(app: tauri::AppHandle) -> Result<HealthReport, CommandError> {
    app_health(prepare_profile_dir(&app)?)
}

#[tauri::command]
fn client_operation(operation: String) -> Result<(), CommandError> {
    reject_operation(&operation)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![health, client_operation])
        .run(tauri::generate_context!())
        .expect("Touchline OS failed to start");
}

#[cfg(test)]
mod tests {
    use super::isolated_data_dir;
    use std::path::Path;

    #[test]
    fn dev_and_test_data_directories_differ() {
        let root = Path::new("app-data");
        let dev = isolated_data_dir(root, "dev");
        let test = isolated_data_dir(root, "test");
        assert_ne!(dev, test);
        assert!(dev.ends_with("dev"));
        assert!(test.ends_with("test"));
        assert!(!dev.ends_with("test"));
    }
}
