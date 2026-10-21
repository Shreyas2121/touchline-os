//! File paths originate from a native dialog, never from invoke arguments.
use crate::{
    store_error, validation, CommandError, MigrationResult, MigrationSummary, NativeStore, SafeInt,
};
use std::{
    fs::{File, OpenOptions},
    io::{Read, Write},
    path::Path,
    sync::Mutex,
};

const MAX_FILE_BYTES: u64 = 32 * 1024 * 1024;
#[derive(Default)]
pub struct MigrationSession(Mutex<Option<(String, Vec<u8>)>>);
impl MigrationSession {
    pub fn clear(&self) -> Result<(), CommandError> {
        *self
            .0
            .lock()
            .map_err(|_| validation("The import session is unavailable."))? = None;
        Ok(())
    }
    pub fn select(&self, path: Option<&Path>) -> Result<Option<MigrationSummary>, CommandError> {
        self.clear()?;
        let Some(path) = path else {
            return Ok(None);
        };
        let file =
            File::open(path).map_err(|_| validation("The selected file could not be read."))?;
        let mut bytes = Vec::new();
        file.take(MAX_FILE_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| validation("The selected file could not be read."))?;
        if bytes.len() as u64 > MAX_FILE_BYTES {
            return Err(validation("The snapshot exceeds the 32 MiB limit."));
        }
        let summary = game_store::inspect_snapshot(&bytes).map_err(store_error)?;
        *self
            .0
            .lock()
            .map_err(|_| validation("The import session is unavailable."))? =
            Some((summary.token.clone(), bytes));
        Ok(Some(summary))
    }
    pub fn confirm(
        &self,
        store: &NativeStore,
        token: &str,
    ) -> Result<MigrationResult, CommandError> {
        let pending = self
            .0
            .lock()
            .map_err(|_| validation("The import session is unavailable."))?;
        let (expected, bytes) = pending
            .as_ref()
            .filter(|(expected, _)| expected == token)
            .ok_or_else(|| validation("Select and review this file before importing."))?;
        let _ = expected;
        // Validate again at commit; the retained bytes cannot be changed by replacing the file.
        let result = store.import_snapshot(bytes).map_err(store_error)?;
        Ok(MigrationResult {
            campaign_id: result.campaign_id,
            revision: SafeInt::new(result.imported_revision)
                .map_err(|_| validation("Invalid imported revision."))?,
        })
    }
}
pub fn export_file(
    store: &NativeStore,
    campaign_id: &str,
    target: Option<&Path>,
    export_id: &str,
    exported_at: &str,
) -> Result<bool, CommandError> {
    let Some(target) = target else {
        return Ok(false);
    };
    let snapshot = store
        .export_snapshot(campaign_id, export_id, exported_at)
        .map_err(store_error)?;
    let bytes = serde_json::to_vec_pretty(&snapshot)
        .map_err(|_| validation("The snapshot could not be encoded."))?;
    // A new destination protects both a prior export and the live database.
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .map_err(|_| validation("Choose a new file name. Existing files are preserved."))?;
    if file
        .write_all(&bytes)
        .and_then(|()| file.sync_all())
        .is_err()
    {
        drop(file);
        let _ = std::fs::remove_file(target);
        return Err(validation("The export could not be written."));
    }
    Ok(true)
}
pub fn backup_file(store: &NativeStore, target: Option<&Path>) -> Result<bool, CommandError> {
    let Some(target) = target else {
        return Ok(false);
    };
    store.backup(target).map_err(store_error)?;
    Ok(true)
}
