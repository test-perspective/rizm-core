//! SQLite DB snapshots: scheduled backup, listing, restore (REQ-238).

use std::path::{Path, PathBuf};

use axum::{
    extract::State,
    routing::{get, post},
    Extension, Json, Router,
};
use chrono::{Local, NaiveTime, Timelike};
use rusqlite::backup::Backup;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tokio::sync::RwLock;

use crate::admin::support::ensure_admin;
use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::db::Db;
use crate::ApiError;

const SETTINGS_VERSION: i32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbBackupSettingsDto {
    pub enabled: bool,
    /// Local time `HH:MM` (24h).
    pub scheduled_time: String,
    pub retention_days: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_run_day: Option<String>,
}

impl Default for DbBackupSettingsDto {
    fn default() -> Self {
        Self {
            enabled: false,
            scheduled_time: "02:30".to_string(),
            retention_days: 7,
            last_run_day: None,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DbBackupSettingsEnvelope {
    #[serde(rename = "settings")]
    settings: DbBackupSettingsDto,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PutDbBackupSettingsRequest {
    settings: DbBackupSettingsDto,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbSnapshotInfoDto {
    pub file_name: String,
    pub created_at_ms: i64,
    pub size_bytes: u64,
    pub kind: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateSnapshotRequest {
    #[serde(default)]
    kind: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RestoreSnapshotRequest {
    file_name: String,
    /// Must be exactly `RESTORE`.
    confirm: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RestoreSnapshotResponse {
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
        last_err.map(|e| e.to_string()).unwrap_or_else(|| "unknown".into())
    ))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/admin/db-backup/settings", get(get_settings).put(put_settings))
        .route("/api/admin/db-backup/snapshots", get(list_snapshots).post(create_snapshot))
        .route("/api/admin/db-backup/restore", post(restore_snapshot))
}

fn snapshots_dir(db_path: &str) -> PathBuf {
    let p = Path::new(db_path);
    let parent = p.parent().unwrap_or_else(|| Path::new("."));
    parent.join("db_snapshots")
}

fn parse_hh_mm(s: &str) -> Result<NaiveTime, ApiError> {
    let t = s.trim();
    let parts: Vec<&str> = t.split(':').collect();
    if parts.len() != 2 {
        return Err(ApiError::bad_request("scheduledTime must be HH:MM"));
    }
    let h: u32 = parts[0].parse().map_err(|_| ApiError::bad_request("scheduledTime must be HH:MM"))?;
    let m: u32 = parts[1].parse().map_err(|_| ApiError::bad_request("scheduledTime must be HH:MM"))?;
    NaiveTime::from_hms_opt(h, m, 0).ok_or_else(|| ApiError::bad_request("scheduledTime must be HH:MM"))
}

fn validate_settings(s: &DbBackupSettingsDto) -> Result<DbBackupSettingsDto, ApiError> {
    let scheduled_time = parse_hh_mm(&s.scheduled_time)?;
    if s.retention_days < 1 || s.retention_days > 3650 {
        return Err(ApiError::bad_request("retentionDays must be between 1 and 3650"));
    }
    Ok(DbBackupSettingsDto {
        enabled: s.enabled,
        scheduled_time: scheduled_time.format("%H:%M").to_string(),
        retention_days: s.retention_days,
        last_run_day: s.last_run_day.clone(),
    })
}

fn load_settings_db(db: &Db) -> anyhow::Result<DbBackupSettingsDto> {
    let raw = db.get_db_backup_settings_json()?;
    let Some(raw) = raw else {
        return Ok(DbBackupSettingsDto::default());
    };
    let mut v: serde_json::Value = serde_json::from_str(&raw)?;
    if let Some(inner) = v.get_mut("settings") {
        Ok(serde_json::from_value(inner.clone())?)
    } else {
        Ok(serde_json::from_value(v)?)
    }
}

fn load_settings(db: &Db) -> Result<DbBackupSettingsDto, ApiError> {
    load_settings_db(db).map_err(|_| ApiError::internal())
}

fn save_settings_db(db: &Db, s: &DbBackupSettingsDto) -> anyhow::Result<()> {
    let envelope = serde_json::json!({
        "version": SETTINGS_VERSION,
        "settings": s,
    });
    let json = serde_json::to_string(&envelope)?;
    db.set_db_backup_settings_json(&json)?;
    Ok(())
}

fn save_settings(db: &Db, s: &DbBackupSettingsDto) -> Result<(), ApiError> {
    save_settings_db(db, s).map_err(|_| ApiError::internal())
}

async fn get_settings(
    State(state): State<AppState>,
    Extension(actor): Extension<AuthedUser>,
) -> Result<Json<DbBackupSettingsEnvelope>, ApiError> {
    ensure_admin(&actor)?;
    let db = state.db.read().await;
    let settings = load_settings(&db)?;
    Ok(Json(DbBackupSettingsEnvelope { settings }))
}

async fn put_settings(
    State(state): State<AppState>,
    Extension(actor): Extension<AuthedUser>,
    Json(req): Json<PutDbBackupSettingsRequest>,
) -> Result<Json<DbBackupSettingsEnvelope>, ApiError> {
    ensure_admin(&actor)?;
    let normalized = validate_settings(&req.settings)?;
    let db = state.db.read().await;
    save_settings(&db, &normalized)?;
    Ok(Json(DbBackupSettingsEnvelope {
        settings: normalized,
    }))
}

fn kind_prefix(kind: &str) -> &'static str {
    match kind {
        "manual" => "manual",
        _ => "auto",
    }
}

/// Create a consistent SQLite backup using the online backup API (WAL-safe).
pub fn run_sqlite_backup(db: &Db, dest_path: &Path) -> anyhow::Result<()> {
    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let src = db.pool.get().map_err(|e| anyhow::anyhow!(e))?;
    let mut dst = rusqlite::Connection::open(dest_path).map_err(|e| anyhow::anyhow!(e))?;
    let backup = Backup::new(&*src, &mut dst).map_err(|e| anyhow::anyhow!(e))?;
    backup
        .run_to_completion(256, Duration::from_millis(50), None)
        .map_err(|e| anyhow::anyhow!(e))?;
    Ok(())
}

pub fn create_snapshot_file(db_path: &str, db: &Db, kind: &str) -> anyhow::Result<DbSnapshotInfoDto> {
    let dir = snapshots_dir(db_path);
    std::fs::create_dir_all(&dir)?;
    let ts = crate::time::now_ms();
    let fname = format!("{}-{}.sqlite3", kind_prefix(kind), ts);
    let path = dir.join(&fname);
    run_sqlite_backup(db, &path)?;
    let meta = std::fs::metadata(&path)?;
    Ok(DbSnapshotInfoDto {
        file_name: fname,
        created_at_ms: ts,
        size_bytes: meta.len(),
        kind: kind_prefix(kind).to_string(),
    })
}

fn list_snapshot_files(db_path: &str) -> anyhow::Result<Vec<DbSnapshotInfoDto>> {
    let dir = snapshots_dir(db_path);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    for ent in std::fs::read_dir(&dir)? {
        let ent = ent?;
        let path = ent.path();
        if !path.is_file() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        if !name.ends_with(".sqlite3") {
            continue;
        }
        let meta = std::fs::metadata(&path)?;
        let modified = meta.modified()?.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as i64;
        let kind = if name.starts_with("manual-") {
            "manual"
        } else {
            "auto"
        }
        .to_string();
        out.push(DbSnapshotInfoDto {
            file_name: name,
            created_at_ms: modified,
            size_bytes: meta.len(),
            kind,
        });
    }
    out.sort_by(|a, b| b.created_at_ms.cmp(&a.created_at_ms));
    Ok(out)
}

fn prune_snapshots(db_path: &str, retention_days: u32) -> anyhow::Result<()> {
    if retention_days == 0 {
        return Ok(());
    }
    let cutoff_ms = crate::time::now_ms() - (retention_days as i64) * 24 * 60 * 60 * 1000;
    let dir = snapshots_dir(db_path);
    if !dir.exists() {
        return Ok(());
    }
    for ent in std::fs::read_dir(&dir)? {
        let ent = ent?;
        let path = ent.path();
        if !path.is_file() {
            continue;
        }
        let meta = std::fs::metadata(&path)?;
        let modified = meta
            .modified()?
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        if modified < cutoff_ms {
            let _ = std::fs::remove_file(path);
        }
    }
    Ok(())
}

fn resolve_snapshot_path(db_path: &str, file_name: &str) -> Result<PathBuf, ApiError> {
    let dir = snapshots_dir(db_path);
    let base = Path::new(file_name)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| ApiError::bad_request("invalid fileName"))?;
    if base != file_name || base.contains("..") || base.contains('/') || base.contains('\\') {
        return Err(ApiError::bad_request("invalid fileName"));
    }
    if !base.ends_with(".sqlite3") {
        return Err(ApiError::bad_request("invalid fileName"));
    }
    let full = dir.join(base);
    let canon_dir = dir.canonicalize().map_err(|_| ApiError::internal())?;
    let canon_file = full.canonicalize().map_err(|_| ApiError::not_found("snapshot not found"))?;
    if !canon_file.starts_with(&canon_dir) {
        return Err(ApiError::bad_request("invalid fileName"));
    }
    Ok(canon_file)
}

async fn list_snapshots(
    State(state): State<AppState>,
    Extension(actor): Extension<AuthedUser>,
) -> Result<Json<Vec<DbSnapshotInfoDto>>, ApiError> {
    ensure_admin(&actor)?;
    let rows = list_snapshot_files(&state.db_path).map_err(|_| ApiError::internal())?;
    Ok(Json(rows))
}

async fn create_snapshot(
    State(state): State<AppState>,
    Extension(actor): Extension<AuthedUser>,
    Json(req): Json<CreateSnapshotRequest>,
) -> Result<Json<DbSnapshotInfoDto>, ApiError> {
    ensure_admin(&actor)?;
    let kind = req.kind.as_deref().unwrap_or("manual");
    let db = state.db.read().await;
    let info = create_snapshot_file(&state.db_path, &db, kind).map_err(|_| ApiError::internal())?;
    Ok(Json(info))
}

async fn restore_snapshot(
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

fn remove_wal_shm(db_path: &str) {
    let _ = std::fs::remove_file(format!("{}-wal", db_path));
    let _ = std::fs::remove_file(format!("{}-shm", db_path));
}

/// Replace live DB: close pool, copy snapshot over main file, reopen pool.
fn restore_db_files(db_lock: Arc<RwLock<Db>>, db_path: &str, snapshot: &Path) -> anyhow::Result<()> {
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

pub async fn maybe_run_scheduled_backup(state: &AppState) {
    let _gate = state.service_gate.read().await;
    let settings = {
        let db = state.db.read().await;
        match load_settings_db(&db) {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!(error = %e, "db backup: load settings failed");
                return;
            }
        }
    };
    if !settings.enabled {
        return;
    }
    let Ok(target_t) = parse_hh_mm(&settings.scheduled_time) else {
        return;
    };
    let now = Local::now();
    let today = now.date_naive();
    let day_key = today.format("%Y-%m-%d").to_string();
    if settings.last_run_day.as_deref() == Some(day_key.as_str()) {
        return;
    }

    let cur = now.time();
    if cur.hour() != target_t.hour() || cur.minute() != target_t.minute() {
        return;
    }

    let snapshot_result = {
        let db = state.db.read().await;
        create_snapshot_file(&state.db_path, &db, "auto")
    };
    match snapshot_result {
        Ok(_) => {
            if let Err(e) = prune_snapshots(&state.db_path, settings.retention_days) {
                tracing::warn!(error = %e, "db backup: prune failed");
            }
            let mut next = settings;
            next.last_run_day = Some(day_key);
            let db = state.db.read().await;
            if let Err(e) = save_settings_db(&db, &next) {
                tracing::warn!(error = %e, "db backup: save lastRunDay failed");
            }
            tracing::info!("db backup: automatic snapshot completed");
        }
        Err(e) => {
            tracing::warn!(error = %e, "db backup: automatic snapshot failed");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_rejects_path_traversal() {
        let e = resolve_snapshot_path("/tmp/x/data.sqlite3", "../etc/passwd");
        assert!(e.is_err());
    }

    #[test]
    fn snapshots_dir_is_next_to_database_file() {
        let dir = snapshots_dir("/var/lib/keel/data.sqlite3");
        assert!(dir.to_string_lossy().ends_with("db_snapshots"));
    }
}
