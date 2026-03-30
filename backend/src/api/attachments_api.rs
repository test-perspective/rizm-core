use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    extract::DefaultBodyLimit,
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Extension, Json, Router,
};
use anyhow::Context;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::path::{Path as FsPath, PathBuf};
use uuid::Uuid;
use tokio::io::AsyncWriteExt;

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::models::Entity;
use crate::permissions::{can_read, can_write};
use crate::ApiError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentMeta {
    pub id: String,
    pub file_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    pub size: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AttachmentListResponse {
    attachments: Vec<AttachmentMeta>,
}

fn etag_for_entity(e: &Entity) -> String {
    // Use updatedAt as the optimistic-lock token (same as entities_api).
    format!("\"{}\"", e.updated_at)
}

pub(crate) fn attachments_root_from_db_path(db_path: &str) -> PathBuf {
    let p = FsPath::new(db_path);
    let parent = p.parent().filter(|pp| !pp.as_os_str().is_empty());
    match parent {
        Some(dir) => dir.join("attachments"),
        None => FsPath::new(".").join("attachments"),
    }
}

pub(crate) fn shard_dir(attachment_id: &str) -> String {
    attachment_id.chars().take(2).collect::<String>().to_lowercase()
}

pub(crate) fn attachment_path(root: &FsPath, project_id: &str, attachment_id: &str) -> PathBuf {
    root.join(project_id).join(shard_dir(attachment_id)).join(attachment_id)
}

/// Remove all attachment files for a project from disk. Best-effort; returns Ok if dir does not exist.
pub fn delete_project_attachments_dir(db_path: &str, project_id: &str) -> anyhow::Result<()> {
    let root = attachments_root_from_db_path(db_path);
    let dir = root.join(project_id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).context("remove project attachments dir")?;
    }
    Ok(())
}

fn is_attachment_supported_entity(e: &Entity) -> bool {
    e.entity_id == "task" || e.entity_id == "item" || e.entity_id == "wikiPage"
}

pub(crate) fn read_attachments_from_entity(e: &Entity) -> Vec<AttachmentMeta> {
    let Some(v) = e.properties.get("attachments") else {
        return vec![];
    };
    let Ok(list) = serde_json::from_value::<Vec<AttachmentMeta>>(v.clone()) else {
        return vec![];
    };
    list
}

fn sanitize_filename(name: &str) -> String {
    // Minimal header-safety: remove quotes/newlines.
    name.replace('"', "_").replace('\r', "_").replace('\n', "_")
}

/// Same on-disk layout as multipart upload (`attachments/{projectId}/...`).
pub(crate) fn write_import_attachment_bytes(
    db_path: &str,
    project_id: &str,
    file_name: &str,
    mime_type: Option<String>,
    bytes: &[u8],
) -> Result<AttachmentMeta, std::io::Error> {
    let file_name = sanitize_filename(file_name);
    if bytes.is_empty() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "empty attachment",
        ));
    }
    let attachment_id = Uuid::new_v4().to_string();
    let root = attachments_root_from_db_path(db_path);
    let path = attachment_path(&root, project_id, &attachment_id);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, bytes)?;
    let size = bytes.len() as i64;
    Ok(AttachmentMeta {
        id: attachment_id,
        file_name,
        mime_type,
        size,
        created_at: crate::time::now_ms(),
    })
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/projects/:project_id/entities/:entity_pk/attachments",
            post(upload_attachments).get(list_attachments),
        )
        .route(
            "/api/projects/:project_id/entities/:entity_pk/attachments/:attachment_id",
            get(get_attachment).delete(delete_attachment),
        )
        // Allow larger uploads (videos, PDFs, etc). Stored streaming to disk.
        .layer(DefaultBodyLimit::max(512 * 1024 * 1024))
}

async fn list_attachments(
    State(state): State<AppState>,
    Path((project_id, entity_pk)): Path<(String, String)>,
    Extension(user): Extension<AuthedUser>,
) -> Result<Json<AttachmentListResponse>, ApiError> {
    let db = state.db.read().await;
    if !can_read(&db, &project_id, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }

    let e = db
        .get_entity_for_project(&project_id, &entity_pk)
        .map_err(|_| ApiError::internal())?
        .ok_or_else(|| ApiError::not_found("not found"))?;

    if !is_attachment_supported_entity(&e) {
        return Err(ApiError::bad_request(
            "attachments are supported for tasks and wiki pages only",
        ));
    }

    Ok(Json(AttachmentListResponse {
        attachments: read_attachments_from_entity(&e),
    }))
}

async fn upload_attachments(
    State(state): State<AppState>,
    Path((project_id, entity_pk)): Path<(String, String)>,
    Extension(user): Extension<AuthedUser>,
    mut multipart: Multipart,
) -> Result<(StatusCode, HeaderMap, Json<Entity>), ApiError> {
    let existing = {
        let db = state.db.read().await;
        if !can_write(&db, &project_id, Some(&user)).map_err(|_| ApiError::internal())? {
            return Err(ApiError::forbidden("insufficient permissions"));
        }

        let e = db
            .get_entity_for_project(&project_id, &entity_pk)
            .map_err(|_| ApiError::internal())?
            .ok_or_else(|| ApiError::not_found("not found"))?;

        if !is_attachment_supported_entity(&e) {
            return Err(ApiError::bad_request(
                "attachments are supported for tasks and wiki pages only",
            ));
        }
        e
    };

    let root = attachments_root_from_db_path(&state.db_path);
    let mut next_attachments = read_attachments_from_entity(&existing);
    let mut added = 0usize;
    let mut created_ids: Vec<String> = Vec::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::bad_request("invalid multipart"))?
    {
        let name = field.name().unwrap_or("").to_string();
        if name != "file" {
            continue;
        }

        let file_name = field.file_name().unwrap_or("file").to_string();
        let file_name = sanitize_filename(&file_name);
        let mime_type = field.content_type().map(|s| s.to_string()).filter(|s| !s.trim().is_empty());

        let attachment_id = Uuid::new_v4().to_string();
        let path = attachment_path(&root, &project_id, &attachment_id);
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|_| ApiError::internal())?;
        }
        let mut f = tokio::fs::File::create(&path)
            .await
            .map_err(|_| ApiError::internal())?;

        // Stream the upload to disk (avoid buffering large files in memory).
        let mut size: i64 = 0;
        let mut field = field;
        while let Some(chunk) = field
            .chunk()
            .await
            .map_err(|_| ApiError::bad_request("failed to read upload"))?
        {
            if chunk.is_empty() {
                continue;
            }
            size += chunk.len() as i64;
            f.write_all(&chunk).await.map_err(|_| ApiError::internal())?;
        }
        f.flush().await.map_err(|_| ApiError::internal())?;

        if size <= 0 {
            let _ = tokio::fs::remove_file(&path).await;
            continue;
        }

        next_attachments.push(AttachmentMeta {
            id: attachment_id,
            file_name,
            mime_type,
            size,
            created_at: crate::time::now_ms(),
        });
        created_ids.push(next_attachments.last().unwrap().id.clone());
        added += 1;
    }

    if added == 0 {
        return Err(ApiError::bad_request("no files uploaded"));
    }

    let mut patch = serde_json::Map::new();
    patch.insert(
        "attachments".to_string(),
        serde_json::to_value(&next_attachments).unwrap_or(Value::Array(vec![])),
    );

    let db = state.db.read().await;

    let cleanup_created_files = |state: &AppState| {
        // Best-effort cleanup of created files if DB update fails.
        let root = attachments_root_from_db_path(&state.db_path);
        for id in &created_ids {
            let path = attachment_path(&root, &project_id, id);
            let _ = std::fs::remove_file(path);
        }
    };

    let updated = match db
        .patch_entity_for_project(&project_id, &entity_pk, existing.updated_at, patch)
    {
        Ok(updated) => updated,
        Err(crate::db::EntityWriteError::NotFound) => {
            cleanup_created_files(&state);
            return Err(ApiError::not_found("not found"));
        }
        Err(crate::db::EntityWriteError::ServiceUnavailable) => {
            cleanup_created_files(&state);
            return Err(ApiError::service_unavailable("database temporarily unavailable"));
        }
        Err(crate::db::EntityWriteError::Conflict { .. }) => {
            // Re-fetch the latest entity and retry with merged attachments.
            let latest = match db
                .get_entity_for_project(&project_id, &entity_pk)
                .map_err(|_| ApiError::internal())?
            {
                Some(e) => e,
                None => {
                    cleanup_created_files(&state);
                    return Err(ApiError::not_found("not found"));
                }
            };

            if !is_attachment_supported_entity(&latest) {
                cleanup_created_files(&state);
                return Err(ApiError::bad_request(
                    "attachments are supported for tasks and wiki pages only",
                ));
            }

            let mut latest_attachments = read_attachments_from_entity(&latest);
            let mut latest_ids: HashSet<String> = latest_attachments
                .iter()
                .map(|a| a.id.clone())
                .collect();
            let created_id_set: HashSet<String> = created_ids.iter().cloned().collect();

            for meta in &next_attachments {
                if created_id_set.contains(&meta.id) && !latest_ids.contains(&meta.id) {
                    latest_ids.insert(meta.id.clone());
                    latest_attachments.push(meta.clone());
                }
            }

            let mut retry_patch = serde_json::Map::new();
            retry_patch.insert(
                "attachments".to_string(),
                serde_json::to_value(&latest_attachments).unwrap_or(Value::Array(vec![])),
            );

            match db
                .patch_entity_for_project(&project_id, &entity_pk, latest.updated_at, retry_patch)
            {
                Ok(updated) => updated,
                Err(crate::db::EntityWriteError::NotFound) => {
                    cleanup_created_files(&state);
                    return Err(ApiError::not_found("not found"));
                }
                Err(crate::db::EntityWriteError::ServiceUnavailable) => {
                    cleanup_created_files(&state);
                    return Err(ApiError::service_unavailable("database temporarily unavailable"));
                }
                Err(crate::db::EntityWriteError::Conflict { current_updated_at }) => {
                    cleanup_created_files(&state);
                    return Err(ApiError::precondition_failed(format!(
                        "conflict (current updatedAt = {current_updated_at})"
                    )));
                }
            }
        }
    };

    let mut headers = HeaderMap::new();
    headers.insert(header::ETAG, etag_for_entity(&updated).parse().unwrap());
    Ok((StatusCode::OK, headers, Json(updated)))
}

async fn get_attachment(
    State(state): State<AppState>,
    Path((project_id, entity_pk, attachment_id)): Path<(String, String, String)>,
    Extension(user): Extension<AuthedUser>,
) -> Result<impl IntoResponse, ApiError> {
    let db = state.db.read().await;
    if !can_read(&db, &project_id, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }

    let e = db
        .get_entity_for_project(&project_id, &entity_pk)
        .map_err(|_| ApiError::internal())?
        .ok_or_else(|| ApiError::not_found("not found"))?;

    if !is_attachment_supported_entity(&e) {
        return Err(ApiError::bad_request(
            "attachments are supported for tasks and wiki pages only",
        ));
    }

    let attachments = read_attachments_from_entity(&e);
    let meta = attachments
        .iter()
        .find(|a| a.id == attachment_id)
        .cloned()
        .ok_or_else(|| ApiError::not_found("not found"))?;

    let root = attachments_root_from_db_path(&state.db_path);
    let path = attachment_path(&root, &project_id, &meta.id);
    let bytes = tokio::fs::read(&path).await.map_err(|_| ApiError::not_found("not found"))?;

    let mut headers = HeaderMap::new();
    if let Some(mime) = meta.mime_type.as_deref() {
        if let Ok(v) = HeaderValue::from_str(mime) {
            headers.insert(header::CONTENT_TYPE, v);
        }
    }
    let cd = format!("inline; filename=\"{}\"", sanitize_filename(&meta.file_name));
    headers.insert(header::CONTENT_DISPOSITION, HeaderValue::from_str(&cd).unwrap());
    Ok((headers, Body::from(bytes)))
}

async fn delete_attachment(
    State(state): State<AppState>,
    Path((project_id, entity_pk, attachment_id)): Path<(String, String, String)>,
    Extension(user): Extension<AuthedUser>,
) -> Result<(HeaderMap, Json<Entity>), ApiError> {
    let db = state.db.read().await;
    if !can_write(&db, &project_id, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }

    let existing = db
        .get_entity_for_project(&project_id, &entity_pk)
        .map_err(|_| ApiError::internal())?
        .ok_or_else(|| ApiError::not_found("not found"))?;

    if !is_attachment_supported_entity(&existing) {
        return Err(ApiError::bad_request(
            "attachments are supported for tasks and wiki pages only",
        ));
    }

    let mut attachments = read_attachments_from_entity(&existing);
    let before = attachments.len();
    attachments.retain(|a| a.id != attachment_id);
    if attachments.len() == before {
        return Err(ApiError::not_found("not found"));
    }

    let root = attachments_root_from_db_path(&state.db_path);
    let path = attachment_path(&root, &project_id, &attachment_id);
    // Best-effort file deletion.
    let _ = tokio::fs::remove_file(&path).await;

    let mut patch = serde_json::Map::new();
    patch.insert(
        "attachments".to_string(),
        serde_json::to_value(&attachments).unwrap_or(Value::Array(vec![])),
    );

    let updated = db
        .patch_entity_for_project(&project_id, &entity_pk, existing.updated_at, patch)
        .map_err(|e| match e {
            crate::db::EntityWriteError::NotFound => ApiError::not_found("not found"),
            crate::db::EntityWriteError::Conflict { current_updated_at } => {
                ApiError::precondition_failed(format!("conflict (current updatedAt = {current_updated_at})"))
            }
            crate::db::EntityWriteError::ServiceUnavailable => {
                ApiError::service_unavailable("database temporarily unavailable")
            }
        })?;

    let mut headers = HeaderMap::new();
    headers.insert(header::ETAG, etag_for_entity(&updated).parse().unwrap());
    Ok((headers, Json(updated)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delete_project_attachments_dir_removes_dir() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("keel.sqlite3");
        let root = attachments_root_from_db_path(db_path.to_str().unwrap());
        let project_dir = root.join("proj-123").join("ab");
        std::fs::create_dir_all(&project_dir).expect("create dir");
        let file_path = project_dir.join("attachment-uuid");
        std::fs::write(&file_path, b"content").expect("write file");
        assert!(file_path.exists());

        delete_project_attachments_dir(db_path.to_str().unwrap(), "proj-123").expect("delete");
        assert!(!root.join("proj-123").exists());
    }

    #[test]
    fn delete_project_attachments_dir_ok_when_dir_missing() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("keel.sqlite3");
        let result = delete_project_attachments_dir(db_path.to_str().unwrap(), "nonexistent");
        assert!(result.is_ok());
    }
}
