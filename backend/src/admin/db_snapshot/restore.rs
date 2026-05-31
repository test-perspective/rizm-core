use std::path::Path;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use axum::{extract::State, Extension, Json};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::admin::support::ensure_admin;
use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::db::Db;
use crate::ApiError;

use super::snapshots::resolve_snapshot_path;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RestoreSnapshotRequest {
    file_name: String,
    /// Must be exactly `RESTORE`.
    confirm: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RestoreSnapshotResponse {
    ok: bool,
}

/// Other tasks may still hold cloned [`Db`] handles (e.g. search indexer) with open SQLite
/// connections. On Windows the main DB file can stay locked briefly; retry instead of hanging forever.
const RESTORE_COPY_INITIAL_WAIT: Duration = Duration::from_millis(800);
const RESTORE_COPY_MAX_ATTEMPTS: u32 = 40;
const RESTORE_COPY_RETRY_SLEEP: Duration = Duration::from_millis(350);

fn copy_snapshot_over_db_file(snapshot: &Path, db_path: &str) -> anyhow::Result<()> {
    thread::sleep(RESTORE_COPY_INITIAL_WAIT);
    let mut last_err = None;
    for attempt in 0..RESTORE_COPY_MAX_ATTEMPTS {
        remove_wal_shm(db_path);
        match std::fs::copy(snapshot, db_path).map(|_| ()) {
            Ok(()) => {
                if attempt > 0 {
                    tracing::info!(attempt, "db restore: copy succeeded after retries");
                }
                return Ok(());
            }
            Err(e) => {
                tracing::debug!(error = %e, attempt, "db restore: copy blocked, retrying");
                last_err = Some(e);
                if attempt + 1 < RESTORE_COPY_MAX_ATTEMPTS {
                    thread::sleep(RESTORE_COPY_RETRY_SLEEP);
                }
            }
        }
    }
    Err(anyhow::anyhow!(
        "failed to copy snapshot over database file after {} attempts: {}",
        RESTORE_COPY_MAX_ATTEMPTS,
        last_err
            .map(|e| e.to_string())
            .unwrap_or_else(|| "unknown".into())
    ))
}

fn remove_wal_shm(db_path: &str) {
    let _ = std::fs::remove_file(format!("{}-wal", db_path));
    let _ = std::fs::remove_file(format!("{}-shm", db_path));
}

/// Replace live DB: close pool, copy snapshot over main file, reopen pool.
fn restore_db_files(
    db_lock: Arc<RwLock<Db>>,
    db_path: &str,
    snapshot: &Path,
) -> anyhow::Result<()> {
    let temp_db_path = format!("{}.restore-staging-{}.sqlite3", db_path, std::process::id());
    let _ = std::fs::remove_file(&temp_db_path);

    // Staging empty DB so we can swap out the live pool safely.
    let staging = Db::new(&temp_db_path)?;

    let mut w = db_lock.blocking_write();
    let old = std::mem::replace(&mut *w, staging);
    drop(old);

    // No open handles on `db_path` from this `RwLock` slot; other tasks may still hold cloned `Db`
    // pools briefly — `copy_snapshot_over_db_file` waits/retries so we do not hang forever on Windows.
    copy_snapshot_over_db_file(snapshot, db_path)?;
    remove_wal_shm(db_path);

    let new_db = Db::new(db_path)?;
    *w = new_db;
    let _ = std::fs::remove_file(&temp_db_path);
    Ok(())
}

pub(super) async fn restore_snapshot(
    State(state): State<AppState>,
    Extension(actor): Extension<AuthedUser>,
    Json(req): Json<RestoreSnapshotRequest>,
) -> Result<Json<RestoreSnapshotResponse>, ApiError> {
    ensure_admin(&actor)?;
    if req.confirm.trim() != "RESTORE" {
        return Err(ApiError::bad_request("confirm must be RESTORE"));
    }
    let snap = resolve_snapshot_path(&state.db_path, &req.file_name)?;
    if !snap.is_file() {
        return Err(ApiError::not_found("snapshot not found"));
    }

    // Exclusive: wait until no HTTP readers, indexer, or scheduled backup holds the gate.
    let _restore_gate = state.service_gate.write().await;

    let db_path = state.db_path.clone();
    let db_lock: Arc<RwLock<Db>> = state.db.clone();

    tokio::task::spawn_blocking(move || restore_db_files(db_lock, &db_path, &snap))
        .await
        .map_err(|_| ApiError::internal())?
        .map_err(|e| {
            tracing::error!(error = %e, "db restore failed");
            ApiError::internal()
        })?;

    Ok(Json(RestoreSnapshotResponse { ok: true }))
}
