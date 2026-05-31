use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use super::attachments_api::{
    attachment_path, attachments_root_from_db_path, read_attachments_from_entity,
};
use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::models::Entity;
use crate::permissions::{can_read, can_write};
use crate::search::indexer::{enqueue_entity_delete, enqueue_entity_upsert};
use crate::time;
use crate::ApiError;
use axum::Extension;
use rand::Rng;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateEntityRequest {
    #[serde(default)]
    id: Option<String>,
    entity_id: String,
    #[serde(default)]
    properties: serde_json::Map<String, Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PatchEntityRequest {
    patch: serde_json::Map<String, Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteEntityQuery {
    #[serde(default)]
    _force: Option<bool>,
}

fn etag_for_entity(e: &Entity) -> String {
    // Use updatedAt as the optimistic-lock token.
    // Strong ETag: quoted integer.
    format!("\"{}\"", e.updated_at)
}

fn parse_if_match_updated_at(headers: &HeaderMap) -> Result<i64, ApiError> {
    let raw = headers
        .get(header::IF_MATCH)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    if raw.is_empty() {
        return Err(ApiError::precondition_required(
            "If-Match header is required",
        ));
    }

    // Accept W/"123" or "123" or 123
    let s = raw.strip_prefix("W/").unwrap_or(&raw).trim();
    let s = s.trim_matches('"').trim();
    s.parse::<i64>()
        .map_err(|_| ApiError::bad_request("invalid If-Match"))
}

fn get_entity_title(entity: &Entity) -> String {
    if entity.entity_id == "task" || entity.entity_id == "item" {
        entity
            .properties
            .get("taskKey")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                entity
                    .properties
                    .get("title")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| "Untitled Task".to_string())
    } else if entity.entity_id == "wikiPage" {
        entity
            .properties
            .get("title")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| "Untitled".to_string())
    } else {
        "Unknown".to_string()
    }
}

fn build_activity_meta_json(
    entity_type: &str,
    entity_id: &str,
    entity_title: &str,
    project_id: &str,
    changes: Option<serde_json::Map<String, Value>>,
) -> String {
    let mut meta = json!({
        "entity_type": entity_type,
        "entity_id": entity_id,
        "entity_title": entity_title,
        "project_id": project_id,
    });
    if let Some(changes) = changes {
        meta.as_object_mut()
            .unwrap()
            .insert("changes".to_string(), json!(changes));
    }
    serde_json::to_string(&meta).unwrap_or_default()
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/projects/:project_id/entities", post(create_entity))
        .route(
            "/api/projects/:project_id/entities/:entity_pk",
            get(get_entity).patch(patch_entity).delete(delete_entity),
        )
}

async fn get_entity(
    State(state): State<AppState>,
    Path((project_id, entity_pk)): Path<(String, String)>,
    Extension(user): Extension<AuthedUser>,
) -> Result<(HeaderMap, Json<Entity>), ApiError> {
    let db = state.db.read().await;
    // Check read permission
    if !can_read(&db, &project_id, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }
    let e = db
        .get_entity_for_project(&project_id, &entity_pk)
        .map_err(|_| ApiError::internal())?
        .ok_or_else(|| ApiError::not_found("not found"))?;

    let mut headers = HeaderMap::new();
    headers.insert(header::ETAG, etag_for_entity(&e).parse().unwrap());
    Ok((headers, Json(e)))
}

async fn create_entity(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Extension(user): Extension<AuthedUser>,
    Json(req): Json<CreateEntityRequest>,
) -> Result<(StatusCode, HeaderMap, Json<Entity>), ApiError> {
    let db = state.db.read().await;
    // Check write permission
    if !can_write(&db, &project_id, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }
    if req.entity_id.trim().is_empty() {
        return Err(ApiError::bad_request("entityId is required"));
    }
    // Sanitize properties: remove client-provided createdBy/updatedBy to prevent tampering
    let mut properties = req.properties;
    properties.remove("createdBy");
    properties.remove("updatedBy");
    // Set server-controlled creator fields
    properties.insert("createdBy".to_string(), Value::String(user.user_id.clone()));
    properties.insert("updatedBy".to_string(), Value::String(user.user_id.clone()));

    let e = db
        .create_entity_for_project(
            &project_id,
            req.id.as_deref(),
            req.entity_id.trim(),
            properties,
        )
        .map_err(|e| {
            let s = e.to_string();
            if s.contains("project not found") {
                ApiError::not_found("not found")
            } else if s.contains("projectKey") || s.contains("project key") {
                ApiError::bad_request(s)
            } else {
                ApiError::internal()
            }
        })?;

    // Log activity for task creation
    if e.entity_id == "task" || e.entity_id == "item" {
        let entity_title = get_entity_title(&e);
        let meta_json = build_activity_meta_json("TASK", &e.id, &entity_title, &project_id, None);
        let db_clone = db.clone();
        let _ = db.insert_audit_log_with_activity(
            Some(&user.user_id),
            "TASK_CREATED",
            None,
            Some(&meta_json),
            e.created_at,
            true,
        );
        // Periodically clean up old activity logs (10% chance)
        let mut rng = rand::thread_rng();
        if rng.gen::<f64>() < 0.1 {
            tokio::spawn(async move {
                let _ = db_clone.delete_old_activity_logs();
            });
        }
    }

    let mut headers = HeaderMap::new();
    headers.insert(header::ETAG, etag_for_entity(&e).parse().unwrap());
    enqueue_entity_upsert(state.clone(), project_id.clone(), e.clone());
    Ok((StatusCode::CREATED, headers, Json(e)))
}

async fn patch_entity(
    State(state): State<AppState>,
    Path((project_id, entity_pk)): Path<(String, String)>,
    headers: HeaderMap,
    Extension(user): Extension<AuthedUser>,
    Json(req): Json<PatchEntityRequest>,
) -> Result<(HeaderMap, Json<Entity>), ApiError> {
    let db = state.db.read().await;
    // Check write permission
    if !can_write(&db, &project_id, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }
    let expected = parse_if_match_updated_at(&headers)?;

    // Get existing entity to compare changes
    let existing_entity = db
        .get_entity_for_project(&project_id, &entity_pk)
        .map_err(|_| ApiError::internal())?
        .ok_or_else(|| ApiError::not_found("not found"))?;

    // Sanitize patch: remove client-provided createdBy/updatedBy to prevent tampering
    let mut sanitized_patch = req.patch.clone();
    sanitized_patch.remove("createdBy");
    sanitized_patch.remove("updatedBy");

    // Build changes diff from sanitized patch (before adding server-controlled updatedBy)
    let mut changes = serde_json::Map::new();
    for (key, new_value) in &sanitized_patch {
        let old_value = existing_entity.properties.get(key);
        changes.insert(
            key.clone(),
            json!({
                "from": old_value.unwrap_or(&Value::Null),
                "to": new_value
            }),
        );
    }

    // Add server-controlled updatedBy to patch before saving
    sanitized_patch.insert("updatedBy".to_string(), Value::String(user.user_id.clone()));

    let res = db
        .patch_entity_for_project(&project_id, &entity_pk, expected, sanitized_patch)
        .map_err(|e| match e {
            crate::db::EntityWriteError::NotFound => ApiError::not_found("not found"),
            crate::db::EntityWriteError::Conflict { current_updated_at } => {
                ApiError::precondition_failed(format!(
                    "conflict (current updatedAt = {current_updated_at})"
                ))
            }
            crate::db::EntityWriteError::ServiceUnavailable => {
                ApiError::service_unavailable("database temporarily unavailable")
            }
        })?;

    // Log activity for task or wiki updates
    if res.entity_id == "task" || res.entity_id == "item" || res.entity_id == "wikiPage" {
        let entity_title = get_entity_title(&res);
        let action = if res.entity_id == "task" || res.entity_id == "item" {
            "TASK_UPDATED"
        } else {
            "WIKI_UPDATED"
        };
        let entity_type = if res.entity_id == "task" || res.entity_id == "item" {
            "TASK"
        } else {
            "WIKI"
        };

        let meta_json = build_activity_meta_json(
            entity_type,
            &res.id,
            &entity_title,
            &project_id,
            if changes.is_empty() {
                None
            } else {
                Some(changes)
            },
        );
        let db_clone = db.clone();
        let _ = db.insert_audit_log_with_activity(
            Some(&user.user_id),
            action,
            None,
            Some(&meta_json),
            res.updated_at,
            true,
        );
        // Periodically clean up old activity logs (10% chance)
        let mut rng = rand::thread_rng();
        if rng.gen::<f64>() < 0.1 {
            tokio::spawn(async move {
                let _ = db_clone.delete_old_activity_logs();
            });
        }
    }

    let mut out_headers = HeaderMap::new();
    out_headers.insert(header::ETAG, etag_for_entity(&res).parse().unwrap());
    enqueue_entity_upsert(state.clone(), project_id.clone(), res.clone());
    Ok((out_headers, Json(res)))
}

async fn delete_entity(
    State(state): State<AppState>,
    Path((project_id, entity_pk)): Path<(String, String)>,
    headers: HeaderMap,
    _q: axum::extract::Query<DeleteEntityQuery>,
    Extension(user): Extension<AuthedUser>,
) -> Result<StatusCode, ApiError> {
    let db = state.db.read().await;
    // Check write permission
    if !can_write(&db, &project_id, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }
    let expected = parse_if_match_updated_at(&headers)?;

    // Get entity before deletion to log activity
    let entity_to_delete = db
        .get_entity_for_project(&project_id, &entity_pk)
        .map_err(|_| ApiError::internal())?
        .ok_or_else(|| ApiError::not_found("not found"))?;

    db.delete_entity_for_project(&project_id, &entity_pk, expected)
        .map_err(|e| match e {
            crate::db::EntityWriteError::NotFound => ApiError::not_found("not found"),
            crate::db::EntityWriteError::Conflict { current_updated_at } => {
                ApiError::precondition_failed(format!(
                    "conflict (current updatedAt = {current_updated_at})"
                ))
            }
            crate::db::EntityWriteError::ServiceUnavailable => {
                ApiError::service_unavailable("database temporarily unavailable")
            }
        })?;

    // Cleanup task attachments on disk (best-effort).
    if entity_to_delete.entity_id == "task" || entity_to_delete.entity_id == "item" {
        let root = attachments_root_from_db_path(&state.db_path);
        let attachments = read_attachments_from_entity(&entity_to_delete);
        for a in attachments {
            let path = attachment_path(&root, &project_id, &a.id);
            let _ = tokio::fs::remove_file(path).await;
        }
    }

    // Log activity for task deletion
    if entity_to_delete.entity_id == "task" || entity_to_delete.entity_id == "item" {
        let entity_title = get_entity_title(&entity_to_delete);
        let meta_json = build_activity_meta_json(
            "TASK",
            &entity_to_delete.id,
            &entity_title,
            &project_id,
            None,
        );
        let now = time::now_ms();
        let db_clone = db.clone();
        let _ = db.insert_audit_log_with_activity(
            Some(&user.user_id),
            "TASK_DELETED",
            None,
            Some(&meta_json),
            now,
            true,
        );
        // Periodically clean up old activity logs (10% chance)
        let mut rng = rand::thread_rng();
        if rng.gen::<f64>() < 0.1 {
            tokio::spawn(async move {
                let _ = db_clone.delete_old_activity_logs();
            });
        }
    }

    enqueue_entity_delete(state.clone(), project_id.clone(), entity_pk.clone());
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests;
