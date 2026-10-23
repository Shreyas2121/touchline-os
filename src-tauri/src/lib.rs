use std::path::{Path, PathBuf};

use game_app::{health as app_health, CommandError, HealthReport, Profile};
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

type Store = Arc<game_app::NativeStore>;
type Imports = Arc<game_app::MigrationSession>;
#[tauri::command]
async fn preview_matchday(
    store: tauri::State<'_, Store>,
    campaign_id: game_app::EntityId,
) -> Result<game_app::MatchdayPreview, CommandError> {
    let store = store.inner().clone();
    blocking(move || game_app::preview_matchday(&store, campaign_id)).await
}
#[tauri::command]
async fn settle_transfer(
    store: tauri::State<'_, Store>,
    request: game_app::SettleTransferRequest,
) -> Result<game_app::AdvanceOutcome, CommandError> {
    let store = store.inner().clone();
    blocking(move || game_app::settle_transfer(&store, request)).await
}
#[tauri::command]
async fn sim_matchday(
    store: tauri::State<'_, Store>,
    request: game_app::SimMatchdayRequest,
) -> Result<game_app::AdvanceOutcome, CommandError> {
    let store = store.inner().clone();
    blocking(move || game_app::sim_matchday(&store, request)).await
}
#[tauri::command]
async fn matchday_view(
    store: tauri::State<'_, Store>,
    campaign_id: game_app::EntityId,
    round: Option<game_app::SafeInt>,
) -> Result<game_app::MatchdayView, CommandError> {
    let store = store.inner().clone();
    blocking(move || game_app::matchday_view(&store, campaign_id, round)).await
}
#[tauri::command]
async fn player_planning(
    store: tauri::State<'_, Store>,
    campaign_id: game_app::EntityId,
    player_id: game_app::EntityId,
) -> Result<game_app::PlayerPlanning, CommandError> {
    let store = store.inner().clone();
    blocking(move || {
        store
            .planning(campaign_id, player_id)
            .map_err(game_app::store_error)
    })
    .await
}
#[tauri::command]
async fn preview_creation(
    request: game_app::CreationRequest,
) -> Result<game_app::ClubChoices, CommandError> {
    blocking(move || game_app::preview_creation(request)).await
}
#[tauri::command]
async fn preview_time(
    store: tauri::State<'_, Store>,
    campaign_id: game_app::EntityId,
) -> Result<game_app::TimePreview, CommandError> {
    let store = store.inner().clone();
    blocking(move || game_app::preview_time(&store, campaign_id)).await
}
#[tauri::command]
async fn advance_time(
    store: tauri::State<'_, Store>,
    request: game_app::AdvanceRequest,
) -> Result<game_app::AdvanceOutcome, CommandError> {
    let store = store.inner().clone();
    blocking(move || game_app::advance_time(&store, request)).await
}
#[tauri::command]
async fn manage_campaign(
    store: tauri::State<'_, Store>,
    command: game_app::ManagementCommand,
) -> Result<game_app::ManagementOutcome, CommandError> {
    let store = store.inner().clone();
    blocking(move || game_app::manage(&store, command)).await
}
#[tauri::command]
async fn create_career(
    store: tauri::State<'_, Store>,
    request: game_app::CreationRequest,
) -> Result<game_app::ManagementOutcome, CommandError> {
    let store = store.inner().clone();
    blocking(move || game_app::create_career(&store, request)).await
}
async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, CommandError> + Send + 'static,
) -> Result<T, CommandError> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|_| CommandError::Internal {
            message: "The native operation could not finish.".into(),
        })?
}

#[tauri::command]
async fn list_campaigns(
    store: tauri::State<'_, Store>,
    page: game_app::SafeInt,
) -> Result<game_app::CampaignPage, CommandError> {
    let store = store.inner().clone();
    blocking(move || store.campaigns(page.get()).map_err(game_app::store_error)).await
}
#[tauri::command]
async fn read_screen(
    store: tauri::State<'_, Store>,
    query: game_app::ScreenQuery,
) -> Result<game_app::ScreenModel, CommandError> {
    let store = store.inner().clone();
    blocking(move || game_app::read_screen(&store, query)).await
}
#[tauri::command]
async fn read_player(
    store: tauri::State<'_, Store>,
    campaign_id: game_app::EntityId,
    player_id: game_app::EntityId,
) -> Result<game_app::PlayerRow, CommandError> {
    let store = store.inner().clone();
    blocking(move || {
        store
            .player(campaign_id, player_id)
            .map_err(game_app::store_error)
    })
    .await
}
#[tauri::command]
async fn preview_policy(
    store: tauri::State<'_, Store>,
    query: game_app::PreviewQuery,
) -> Result<game_app::NativePreview, CommandError> {
    let store = store.inner().clone();
    blocking(move || game_app::preview(&store, query)).await
}
#[tauri::command]
async fn select_import(
    app: tauri::AppHandle,
    session: tauri::State<'_, Imports>,
) -> Result<Option<game_app::MigrationSummary>, CommandError> {
    let session = session.inner().clone();
    blocking(move || {
        session.clear()?;
        let selected = app
            .dialog()
            .file()
            .add_filter("Touchline snapshot", &["json"])
            .blocking_pick_file();
        let path = selected
            .map(|p| {
                p.into_path()
                    .map_err(|_| game_app::validation("Choose a local snapshot file."))
            })
            .transpose()?;
        session.select(path.as_deref())
    })
    .await
}
#[tauri::command]
async fn confirm_import(
    store: tauri::State<'_, Store>,
    session: tauri::State<'_, Imports>,
    token: String,
) -> Result<game_app::MigrationResult, CommandError> {
    let store = store.inner().clone();
    let session = session.inner().clone();
    blocking(move || session.confirm(&store, &token)).await
}
#[tauri::command]
fn cancel_import(session: tauri::State<'_, Imports>) -> Result<(), CommandError> {
    session.clear()
}
#[tauri::command]
async fn export_campaign(
    app: tauri::AppHandle,
    store: tauri::State<'_, Store>,
    campaign_id: game_app::EntityId,
    export_id: game_app::EntityId,
    exported_at: String,
) -> Result<bool, CommandError> {
    let store = store.inner().clone();
    blocking(move || {
        let selected = app
            .dialog()
            .file()
            .add_filter("Touchline snapshot", &["json"])
            .set_file_name("touchline-export.json")
            .blocking_save_file();
        let path = selected
            .map(|p| {
                p.into_path()
                    .map_err(|_| game_app::validation("Choose a local destination."))
            })
            .transpose()?;
        game_app::export_file(
            &store,
            campaign_id.as_str(),
            path.as_deref(),
            export_id.as_str(),
            &exported_at,
        )
    })
    .await
}
#[tauri::command]
async fn backup_database(
    app: tauri::AppHandle,
    store: tauri::State<'_, Store>,
) -> Result<bool, CommandError> {
    let store = store.inner().clone();
    blocking(move || {
        let selected = app
            .dialog()
            .file()
            .add_filter("SQLite backup", &["sqlite3"])
            .set_file_name("touchline-backup.sqlite3")
            .blocking_save_file();
        let path = selected
            .map(|p| {
                p.into_path()
                    .map_err(|_| game_app::validation("Choose a local destination."))
            })
            .transpose()?;
        game_app::backup_file(&store, path.as_deref())
    })
    .await
}

pub fn isolated_data_dir(app_data_dir: &Path, profile: &str) -> PathBuf {
    app_data_dir.join(profile)
}

fn prepare_profile_dir(app: &tauri::AppHandle) -> Result<Profile, CommandError> {
    let override_profile = std::env::var("TOUCHLINE_PROFILE").ok();
    let profile = Profile::resolve(cfg!(debug_assertions), override_profile.as_deref())?;
    let root = app
        .path()
        .app_local_data_dir()
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let profile = prepare_profile_dir(app.handle())?;
            let root = app.path().app_local_data_dir()?;
            let path = game_app::database_path(&root, profile.as_str())?;
            app.manage(Arc::new(game_app::NativeStore::open(path)?));
            app.manage(Arc::new(game_app::MigrationSession::default()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            health,
            list_campaigns,
            read_screen,
            read_player,
            player_planning,
            preview_policy,
            manage_campaign,
            preview_creation,
            preview_time,
            preview_matchday,
            sim_matchday,
            settle_transfer,
            matchday_view,
            advance_time,
            create_career,
            select_import,
            confirm_import,
            cancel_import,
            export_campaign,
            backup_database
        ])
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
