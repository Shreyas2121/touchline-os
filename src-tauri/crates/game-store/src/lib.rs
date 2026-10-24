//! SQLite connection ownership and bounded storage operations. No SQL crosses IPC.
#![forbid(unsafe_code)]

mod codec;
mod mapping;
mod mutations;
mod queries;
mod snapshots;
pub use queries::ScreenRead;
pub fn creation_fingerprint(canonical: &str) -> String {
    hashed_fingerprint("native-create:1:", canonical)
}
pub fn advance_fingerprint(canonical: &str) -> String {
    hashed_fingerprint("native-advance:1:", canonical)
}
pub fn matchday_fingerprint(canonical: &str) -> String {
    hashed_fingerprint("native-matchday:1:", canonical)
}
pub fn settlement_fingerprint(canonical: &str) -> String {
    hashed_fingerprint("native-settlement:1:", canonical)
}
pub fn market_fingerprint(canonical: &str) -> String {
    hashed_fingerprint("native-market:1:", canonical)
}
fn hashed_fingerprint(prefix: &str, canonical: &str) -> String {
    use sha2::{Digest, Sha256};
    format!(
        "{prefix}{}",
        Sha256::digest(canonical.as_bytes())
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>()
    )
}
pub fn inspect_snapshot(bytes: &[u8]) -> Result<game_core::queries::MigrationSummary> {
    let prepared = snapshots::prepare(bytes)?;
    let snapshot = game_core::parse_snapshot(bytes)?;
    let counts = serde_json::to_value(&snapshot.tables)?
        .as_object()
        .ok_or_else(|| invalid("tables"))?
        .iter()
        .map(|(key, rows)| {
            Ok((
                key.clone(),
                game_core::SafeInt::new(
                    rows.as_array().ok_or_else(|| invalid("rows"))?.len() as i64
                )
                .map_err(|e| invalid(e.to_string()))?,
            ))
        })
        .collect::<Result<_>>()?;
    Ok(game_core::queries::MigrationSummary {
        campaign: snapshot.tables.campaigns[0].clone(),
        source_storage: snapshot.source_storage,
        source_schema_version: snapshot.source_schema_version,
        counts,
        token: prepared.digest().to_owned(),
    })
}

use game_core::{CampaignSnapshot, StorageAvailability};
use rusqlite::{Connection, OptionalExtension};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, SyncSender};
use std::thread::{self, JoinHandle};
use std::time::Duration;

pub const SCHEMA_VERSION: i64 = 5;
pub const INITIAL_MIGRATION: &str = include_str!("../../../migrations/0002_standalone.sql");
pub const MATCHDAY_MIGRATION: &str = include_str!("../../../migrations/0003_matchday.sql");
pub const MARKET_MIGRATION: &str = include_str!("../../../migrations/0004_market.sql");
pub const LIFECYCLE_MIGRATION: &str = include_str!("../../../migrations/0005_lifecycle.sql");
pub type Result<T> = std::result::Result<T, StoreError>;

#[derive(Debug)]
pub enum StoreError {
    Command(game_core::CommandError),
    Sqlite(rusqlite::Error),
    Io(std::io::Error),
    Invalid(String),
    UnsupportedSchema(i64),
    Collision(String),
    NotFound,
    WorkerStopped,
}
impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{self:?}")
    }
}
impl std::error::Error for StoreError {}
impl From<rusqlite::Error> for StoreError {
    fn from(value: rusqlite::Error) -> Self {
        Self::Sqlite(value)
    }
}
impl From<std::io::Error> for StoreError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}
impl From<serde_json::Error> for StoreError {
    fn from(value: serde_json::Error) -> Self {
        Self::Invalid(value.to_string())
    }
}
impl From<game_core::SnapshotError> for StoreError {
    fn from(value: game_core::SnapshotError) -> Self {
        Self::Invalid(value.to_string())
    }
}

// The shell has not exposed storage services yet (NM-G06).
pub fn storage_availability() -> StorageAvailability {
    StorageAvailability::Unavailable
}

/// The caller supplies Tauri's app-local directory; mutable files never use resource_dir.
pub fn database_path(app_local_dir: &Path, profile: &str) -> Result<PathBuf> {
    match profile {
        "production" => Ok(app_local_dir.join("touchline.sqlite3")),
        "dev" | "test" => Ok(app_local_dir.join(profile).join("touchline.sqlite3")),
        _ => Err(StoreError::Invalid("unknown storage profile".into())),
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportOutcome {
    pub source_sha256: String,
    pub campaign_id: String,
    pub imported_revision: i64,
}

type Reply<T> = mpsc::Sender<Result<T>>;
enum Request {
    Market(
        game_core::market_ops::MarketCommand,
        Reply<game_core::progression::AdvanceOutcome>,
    ),
    Settle(
        game_core::settlement::SettleTransferRequest,
        game_core::settlement::PreparedSettlement,
        Reply<game_core::progression::AdvanceOutcome>,
    ),
    Matchday(
        game_core::matchday::SimMatchdayRequest,
        game_core::matchday::PreparedMatchday,
        Reply<game_core::progression::AdvanceOutcome>,
    ),
    Planning(
        game_core::EntityId,
        game_core::EntityId,
        Reply<game_core::queries::PlayerPlanning>,
    ),
    Manage(
        game_core::management::ManagementCommand,
        Reply<game_core::management::ManagementOutcome>,
    ),
    Advance(
        game_core::progression::AdvanceRequest,
        Reply<game_core::progression::AdvanceOutcome>,
    ),
    Create(
        game_core::management::CreationRequest,
        Value,
        String,
        Reply<game_core::management::ManagementOutcome>,
    ),
    CreationProbe(
        game_core::management::CreationRequest,
        String,
        Reply<Option<game_core::management::ManagementOutcome>>,
    ),
    Campaigns(i64, Reply<game_core::queries::CampaignPage>),
    Screen(game_core::queries::ScreenQuery, Reply<ScreenRead>),
    Player(
        game_core::EntityId,
        game_core::EntityId,
        Reply<game_core::PlayerRow>,
    ),
    Import(snapshots::PreparedImport, Reply<ImportOutcome>),
    Read(String, Reply<Value>),
    Backup(PathBuf, Reply<()>),
    Stop,
}

/// One worker owns the connection for its entire lifetime. The bounded queue prevents
/// unbounded pending writes. Call blocking methods off the UI thread in the adapter.
pub struct Store {
    sender: SyncSender<Request>,
    worker: Option<JoinHandle<()>>,
}
impl Store {
    pub fn market(
        &self,
        command: game_core::market_ops::MarketCommand,
    ) -> Result<game_core::progression::AdvanceOutcome> {
        self.call(|reply| Request::Market(command, reply))
    }
    pub fn settle(
        &self,
        request: game_core::settlement::SettleTransferRequest,
        prepared: game_core::settlement::PreparedSettlement,
    ) -> Result<game_core::progression::AdvanceOutcome> {
        self.call(|reply| Request::Settle(request, prepared, reply))
    }
    pub fn matchday(
        &self,
        request: game_core::matchday::SimMatchdayRequest,
        prepared: game_core::matchday::PreparedMatchday,
    ) -> Result<game_core::progression::AdvanceOutcome> {
        self.call(|reply| Request::Matchday(request, prepared, reply))
    }
    pub fn planning(
        &self,
        campaign: game_core::EntityId,
        player: game_core::EntityId,
    ) -> Result<game_core::queries::PlayerPlanning> {
        self.call(|reply| Request::Planning(campaign, player, reply))
    }
    pub fn manage(
        &self,
        command: game_core::management::ManagementCommand,
    ) -> Result<game_core::management::ManagementOutcome> {
        self.call(|reply| Request::Manage(command, reply))
    }
    pub fn advance(
        &self,
        request: game_core::progression::AdvanceRequest,
    ) -> Result<game_core::progression::AdvanceOutcome> {
        self.call(|reply| Request::Advance(request, reply))
    }
    pub fn creation_probe(
        &self,
        request: game_core::management::CreationRequest,
        fingerprint: String,
    ) -> Result<Option<game_core::management::ManagementOutcome>> {
        self.call(|reply| Request::CreationProbe(request, fingerprint, reply))
    }
    pub fn create(
        &self,
        request: game_core::management::CreationRequest,
        tables: game_core::SnapshotTables,
        fingerprint: String,
    ) -> Result<game_core::management::ManagementOutcome> {
        game_core::management::require_supported_creation(&request).map_err(StoreError::Command)?;
        if tables.campaigns.len() != 1
            || tables.audit_events.len() != 1
            || tables.simulation_receipts.len() != 1
            || tables.campaigns[0].id != request.career.campaign_id
            || tables.audit_events[0].action_id != request.career.action_id
            || tables.audit_events[0].id != request.career.audit_event_id
            || tables.campaigns[0].active_season_id != request.career.season_id
        {
            return Err(invalid(
                "Prepared career headers do not match the creation request.",
            ));
        }
        let tables = serde_json::to_value(tables)?;
        // Full schema and reference validation happens before queueing generation output.
        snapshots::envelope(tables.clone(), "native-create", &request.career.now)?;
        self.call(|reply| Request::Create(request, tables, fingerprint, reply))
    }
    pub fn campaigns(&self, page: i64) -> Result<game_core::queries::CampaignPage> {
        self.call(|reply| Request::Campaigns(page, reply))
    }
    pub fn screen(&self, query: game_core::queries::ScreenQuery) -> Result<ScreenRead> {
        self.call(|reply| Request::Screen(query, reply))
    }
    pub fn player(
        &self,
        campaign: game_core::EntityId,
        player: game_core::EntityId,
    ) -> Result<game_core::PlayerRow> {
        self.call(|reply| Request::Player(campaign, player, reply))
    }
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref().to_owned();
        let (sender, receiver) = mpsc::sync_channel(8);
        let (ready, started) = mpsc::channel();
        let worker = thread::Builder::new()
            .name("touchline-sqlite".into())
            .spawn(move || {
                let mut connection = match open_connection(&path) {
                    Ok(connection) => {
                        let _ = ready.send(Ok(()));
                        connection
                    }
                    Err(error) => {
                        let _ = ready.send(Err(error));
                        return;
                    }
                };
                while let Ok(request) = receiver.recv() {
                    match request {
                        Request::Market(command, reply) => {
                            let _ = reply.send(mutations::market(&mut connection, command));
                        }
                        Request::Settle(request, prepared, reply) => {
                            let _ =
                                reply.send(mutations::settle(&mut connection, request, prepared));
                        }
                        Request::Matchday(request, prepared, reply) => {
                            let _ =
                                reply.send(mutations::matchday(&mut connection, request, prepared));
                        }
                        Request::Planning(campaign, player, reply) => {
                            let _ =
                                reply.send(queries::planning(&mut connection, &campaign, &player));
                        }
                        Request::Manage(command, reply) => {
                            let _ = reply.send(mutations::manage(&mut connection, command));
                        }
                        Request::Advance(request, reply) => {
                            let _ = reply.send(mutations::advance(&mut connection, request));
                        }
                        Request::Create(request, tables, fingerprint, reply) => {
                            let _ = reply.send(mutations::create(
                                &mut connection,
                                request,
                                tables,
                                &fingerprint,
                            ));
                        }
                        Request::CreationProbe(request, fingerprint, reply) => {
                            let _ = reply.send(mutations::probe_snapshot(
                                &mut connection,
                                &request,
                                &fingerprint,
                            ));
                        }
                        Request::Campaigns(page, reply) => {
                            let _ = reply.send(queries::campaigns(&mut connection, page));
                        }
                        Request::Screen(query, reply) => {
                            let _ = reply.send(queries::screen(&mut connection, &query));
                        }
                        Request::Player(campaign, player, reply) => {
                            let _ =
                                reply.send(queries::player(&mut connection, &campaign, &player));
                        }
                        Request::Import(prepared, reply) => {
                            let _ = reply.send(snapshots::import(&mut connection, prepared));
                        }
                        Request::Read(id, reply) => {
                            let _ = reply.send(snapshots::read(&mut connection, &id));
                        }
                        Request::Backup(target, reply) => {
                            let _ = reply.send(snapshots::backup(&connection, &path, &target));
                        }
                        Request::Stop => break,
                    }
                }
            })?;
        match started.recv().map_err(|_| StoreError::WorkerStopped)? {
            Ok(()) => Ok(Self {
                sender,
                worker: Some(worker),
            }),
            Err(error) => {
                let _ = worker.join();
                Err(error)
            }
        }
    }

    pub fn import_snapshot(&self, bytes: &[u8]) -> Result<ImportOutcome> {
        // Parsing, hashing, scope checking and DTO/SQL conversion precede queueing.
        let prepared = snapshots::prepare(bytes)?;
        self.call(|reply| Request::Import(prepared, reply))
    }

    /// Campaign tables and the revision are read in one consistent transaction. IDs and
    /// audit time for the envelope are explicit caller inputs, never gameplay writes.
    pub fn export_snapshot(
        &self,
        campaign_id: &str,
        export_id: &str,
        exported_at: &str,
    ) -> Result<CampaignSnapshot> {
        let tables = self.call(|reply| Request::Read(campaign_id.to_owned(), reply))?;
        snapshots::envelope(tables, export_id, exported_at)
    }

    /// Validated domain tables from one read transaction, without snapshot transport.
    pub fn read_campaign(&self, campaign_id: &str) -> Result<game_core::SnapshotTables> {
        let tables = self.call(|reply| Request::Read(campaign_id.to_owned(), reply))?;
        snapshots::decode_tables(tables)
    }

    pub fn backup(&self, target: impl AsRef<Path>) -> Result<()> {
        self.call(|reply| Request::Backup(target.as_ref().to_owned(), reply))
    }

    fn call<T>(&self, request: impl FnOnce(Reply<T>) -> Request) -> Result<T> {
        let (sender, receiver) = mpsc::channel();
        self.sender
            .send(request(sender))
            .map_err(|_| StoreError::WorkerStopped)?;
        receiver.recv().map_err(|_| StoreError::WorkerStopped)?
    }
}
impl Drop for Store {
    fn drop(&mut self) {
        let _ = self.sender.send(Request::Stop);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn open_connection(path: &Path) -> Result<Connection> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut connection = Connection::open(path)?;
    connection.busy_timeout(Duration::from_secs(5))?;
    connection.pragma_update(None, "foreign_keys", true)?;
    migrate(&mut connection)?;
    connection.pragma_update(None, "journal_mode", "WAL")?;
    connection.pragma_update(None, "synchronous", "FULL")?;
    Ok(connection)
}

fn migrate(connection: &mut Connection) -> Result<()> {
    let version: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    match version {
        0 => {
            // Version zero is the empty native predecessor, not a Dexie version.
            let objects: i64 = connection.query_row(
                "SELECT count(*) FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
                [],
                |r| r.get(0),
            )?;
            if objects != 0 {
                return Err(StoreError::Invalid("unversioned nonempty database".into()));
            }
            let transaction = connection.transaction()?;
            transaction.execute_batch(INITIAL_MIGRATION)?;
            transaction.execute_batch(MATCHDAY_MIGRATION)?;
            transaction.execute_batch(MARKET_MIGRATION)?;
            transaction.execute_batch(LIFECYCLE_MIGRATION)?;
            check_database(&transaction)?;
            transaction.commit()?;
        }
        3 => {
            let transaction = connection.transaction()?;
            transaction.execute_batch(MARKET_MIGRATION)?;
            transaction.execute_batch(LIFECYCLE_MIGRATION)?;
            check_database(&transaction)?;
            transaction.commit()?;
        }
        4 => {
            let transaction = connection.transaction()?;
            transaction.execute_batch(LIFECYCLE_MIGRATION)?;
            check_database(&transaction)?;
            transaction.commit()?;
        }
        SCHEMA_VERSION => {}
        other => return Err(StoreError::UnsupportedSchema(other)),
    }
    check_database(connection)
}

fn check_database(connection: &Connection) -> Result<()> {
    let version: i64 = connection.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if version != SCHEMA_VERSION {
        return Err(StoreError::UnsupportedSchema(version));
    }
    for (version, name) in [
        (2, "0002_standalone"),
        (3, "0003_matchday"),
        (4, "0004_market"),
        (5, "0005_lifecycle"),
    ] {
        let migration: Option<String> = connection
            .query_row(
                "SELECT name FROM schemaMigrations WHERE version = ?1",
                [version],
                |r| r.get(0),
            )
            .optional()?;
        if migration.as_deref() != Some(name) {
            return Err(StoreError::Invalid("migration metadata".into()));
        }
    }
    for table in mapping::TABLES {
        let columns = table
            .columns
            .iter()
            .map(|column| column.name)
            .collect::<Vec<_>>()
            .join(",");
        connection.prepare(&format!("SELECT {columns} FROM {} LIMIT 0", table.name))?;
    }
    let integrity: String = connection.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
    if integrity != "ok" || connection.prepare("PRAGMA foreign_key_check")?.exists([])? {
        return Err(StoreError::Invalid("database integrity".into()));
    }
    Ok(())
}

#[derive(Clone, Copy)]
enum Kind {
    Text,
    Integer,
    Bool,
    Json,
}
struct Column {
    name: &'static str,
    kind: Kind,
}
struct Table {
    name: &'static str,
    columns: &'static [Column],
}

fn invalid(message: impl Into<String>) -> StoreError {
    StoreError::Invalid(message.into())
}
