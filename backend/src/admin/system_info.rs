use axum::{extract::State, Extension, Json};
use serde::Serialize;
use std::path::Path as FsPath;

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::ApiError;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SystemInfoAttachmentsPerProject {
    pub(super) project_id: String,
    pub(super) project_name: String,
    pub(super) attachment_count: i64,
    pub(super) total_size_bytes: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SystemInfoAttachments {
    pub(super) total_size_bytes: i64,
    pub(super) per_project: Vec<SystemInfoAttachmentsPerProject>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SystemInfoFastembedCache {
    pub(super) path: String,
    pub(super) size_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SystemInfoResponse {
    pub(super) sqlite_db_path: String,
    pub(super) sqlite_db_file_size_bytes: u64,
    pub(super) attachments: SystemInfoAttachments,
    pub(super) fastembed_cache: SystemInfoFastembedCache,
}

fn fastembed_cache_dir_size_bytes(path: &FsPath) -> u64 {
    let mut total: u64 = 0;
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };
    for entry in entries.flatten() {
        let entry_path = entry.path();
        if entry_path.is_dir() {
            total += fastembed_cache_dir_size_bytes(&entry_path);
        } else if let Ok(meta) = entry.metadata() {
            total += meta.len();
        }
    }
    total
}

pub(super) async fn get_system_info(
    State(state): State<AppState>,
    Extension(actor): Extension<AuthedUser>,
) -> Result<Json<SystemInfoResponse>, ApiError> {
    super::support::ensure_admin(&actor)?;

    let metadata = tokio::fs::metadata(&state.db_path).await.map_err(|e| {
        tracing::error!(error = %e, path = %state.db_path, "failed to read database file metadata");
        ApiError::internal()
    })?;
    let sqlite_db_file_size_bytes = metadata.len();

    let db = state.db.read().await;
    let attachment_per = db.get_attachment_usage_per_project().map_err(|_| ApiError::internal())?;
    let attachment_total = db.get_attachment_usage_total().map_err(|_| ApiError::internal())?;
    let attachments = SystemInfoAttachments {
        total_size_bytes: attachment_total,
        per_project: attachment_per
            .into_iter()
            .map(|(project_id, name_opt, attachment_count, total_size_bytes)| {
                let project_name = name_opt.unwrap_or_else(|| project_id.clone());
                SystemInfoAttachmentsPerProject {
                    project_id,
                    project_name,
                    attachment_count,
                    total_size_bytes,
                }
            })
            .collect(),
    };

    let fastembed_cache_path = FsPath::new(&state.db_path)
        .parent()
        .and_then(FsPath::parent)
        .unwrap_or_else(|| FsPath::new("."))
        .join(".fastembed_cache");
    let fastembed_cache_path_str = fastembed_cache_path.to_string_lossy().to_string();
    let size_bytes = if fastembed_cache_path.is_dir() {
        let path_clone = fastembed_cache_path.clone();
        tokio::task::spawn_blocking(move || fastembed_cache_dir_size_bytes(&path_clone))
            .await
            .unwrap_or(0)
    } else {
        0
    };
    let fastembed_cache = SystemInfoFastembedCache {
        path: fastembed_cache_path_str,
        size_bytes,
    };

    Ok(Json(SystemInfoResponse {
        sqlite_db_path: state.db_path.clone(),
        sqlite_db_file_size_bytes,
        attachments,
        fastembed_cache,
    }))
}
