use std::path::{Path, PathBuf};
use std::time::Duration;

use axum::{extract::State, Extension, Json};
use rusqlite::backup::Backup;
use serde::Deserialize;

use crate::admin::support::ensure_admin;
use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::db::Db;
use crate::ApiError;

use super::DbSnapshotInfoDto;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateSnapshotRequest {
    #[serde(default)]
    kind: Option<String>,
}

pub(super) fn snapshots_dir(db_path: &str) -> PathBuf {
    let p = Path::new(db_path);
    let parent = p.parent().unwrap_or_else(|| Path::new("."));
    parent.join("db_snapshots")
}

fn kind_prefix(kind: &str) -> &'static str {
    match kind {
        "manual" => "manual",
        _ => "auto",
    }
}

/// Create a consistent SQLite backup using the online backup API (WAL-safe).
pub(super) fn run_sqlite_backup(db: &Db, dest_path: &Path) -> anyhow::Result<()> {
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

pub(super) fn create_snapshot_file(
    db_path: &str,
    db: &Db,
    kind: &str,
) -> anyhow::Result<DbSnapshotInfoDto> {
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
        let modified = meta
            .modified()?
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
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

pub(super) fn prune_snapshots(db_path: &str, retention_days: u32) -> anyhow::Result<()> {
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

pub(super) fn resolve_snapshot_path(db_path: &str, file_name: &str) -> Result<PathBuf, ApiError> {
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
    let canon_file = full
        .canonicalize()
        .map_err(|_| ApiError::not_found("snapshot not found"))?;
    if !canon_file.starts_with(&canon_dir) {
        return Err(ApiError::bad_request("invalid fileName"));
    }
    Ok(canon_file)
}

pub(super) async fn list_snapshots(
    State(state): State<AppState>,
    Extension(actor): Extension<AuthedUser>,
) -> Result<Json<Vec<DbSnapshotInfoDto>>, ApiError> {
    ensure_admin(&actor)?;
    let rows = list_snapshot_files(&state.db_path).map_err(|_| ApiError::internal())?;
    Ok(Json(rows))
}

pub(super) async fn create_snapshot(
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
