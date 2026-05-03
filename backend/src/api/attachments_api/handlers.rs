use std::collections::HashSet;

use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::IntoResponse,
    Extension, Json,
};
use serde_json::Value;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::models::Entity;
use crate::permissions::{can_read, can_write};
use crate::ApiError;

use super::meta::{
    etag_for_entity, is_attachment_supported_entity, read_attachments_from_entity,
    AttachmentListResponse, AttachmentMeta,
};
use super::storage::{attachment_path, attachments_root_from_db_path, sanitize_filename};

pub(super) async fn list_attachments(
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

pub(super) async fn upload_attachments(
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

pub(super) async fn get_attachment(
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

pub(super) async fn delete_attachment(
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
