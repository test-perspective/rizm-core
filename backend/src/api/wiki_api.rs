use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::permissions::{can_read, can_write};
use crate::search::indexer::{enqueue_entity_delete, enqueue_entity_upsert};
use crate::ApiError;
use axum::Extension;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WikiPageMeta {
    id: String,
    title: String,
    updated_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    node_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    parent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    order: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WikiPageResponse {
    id: String,
    title: String,
    updated_at: i64,
    doc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    crdt_blob: Option<Vec<u8>>,
    comments: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    node_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    parent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    order: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveWikiCollabRequest {
    doc: String,
    crdt_blob: Vec<u8>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MoveWikiPageRequest {
    destination_project_id: String,
    #[serde(default)]
    destination_parent_id: Option<String>,
    #[serde(default)]
    before_page_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MoveWikiPageResponse {
    destination_project_id: String,
    root_page_id: String,
    moved_page_ids: Vec<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/projects/:project_id/wiki/pages",
            get(list_wiki_pages),
        )
        .route(
            "/api/projects/:project_id/wiki/pages/:page_id",
            get(get_wiki_page),
        )
        .route(
            "/api/projects/:project_id/wiki/pages/:page_id/move",
            post(move_wiki_page),
        )
        .route(
            "/api/projects/:project_id/wiki/pages/:page_id/collab",
            put(save_wiki_collab_state),
        )
}

async fn list_wiki_pages(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Extension(user): Extension<AuthedUser>,
) -> Result<Json<Vec<WikiPageMeta>>, ApiError> {
    let db = state.db.read().await;
    if !can_read(&db, &project_id, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }
    let entities = db
        .list_entities_for_project(&project_id)
        .map_err(|_| ApiError::internal())?;

    let mut wiki_entities: Vec<_> = entities
        .into_iter()
        .filter(|e| e.entity_id == "wikiPage")
        .collect();

    // Sort by __keelOrder (ascending), then by createdAt for stable ordering
    wiki_entities.sort_by(|a, b| {
        let a_order = a
            .properties
            .get("__keelOrder")
            .and_then(|v| v.as_f64())
            .map(|f| f as i64);
        let b_order = b
            .properties
            .get("__keelOrder")
            .and_then(|v| v.as_f64())
            .map(|f| f as i64);

        match (a_order, b_order) {
            (Some(ao), Some(bo)) => ao.cmp(&bo),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => {
                // Fallback to createdAt for stable ordering
                a.created_at.cmp(&b.created_at)
            }
        }
    });

    let pages: Vec<WikiPageMeta> = wiki_entities
        .into_iter()
        .map(|e| {
            let title = e
                .properties
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Untitled")
                .to_string();
            let node_type = e
                .properties
                .get("nodeType")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let parent_id = e
                .properties
                .get("parentId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let order = e
                .properties
                .get("__keelOrder")
                .and_then(|v| v.as_f64())
                .map(|f| f as i64);
            WikiPageMeta {
                id: e.id,
                title,
                updated_at: e.updated_at,
                node_type,
                parent_id,
                order,
            }
        })
        .collect();

    Ok(Json(pages))
}

async fn get_wiki_page(
    State(state): State<AppState>,
    Path((project_id, page_id)): Path<(String, String)>,
    Extension(user): Extension<AuthedUser>,
) -> Result<Json<WikiPageResponse>, ApiError> {
    let db = state.db.read().await;
    if !can_read(&db, &project_id, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }
    let entities = db
        .list_entities_for_project(&project_id)
        .map_err(|_| ApiError::internal())?;
    let e = entities
        .into_iter()
        .find(|e| e.entity_id == "wikiPage" && e.id == page_id)
        .ok_or_else(|| ApiError::not_found("not found"))?;

    let title = e
        .properties
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Untitled")
        .to_string();
    let doc = e
        .properties
        .get("doc")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let comments = e
        .properties
        .get("comments")
        .cloned()
        .unwrap_or(Value::Array(Vec::new()));

    let crdt_blob = db
        .get_wiki_collab_state_for_project(&project_id, &page_id)
        .map_err(|_| ApiError::internal())?
        .map(|(blob, _doc_json, _updated_at)| blob);

    let node_type = e
        .properties
        .get("nodeType")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let parent_id = e
        .properties
        .get("parentId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let order = e
        .properties
        .get("__keelOrder")
        .and_then(|v| v.as_f64())
        .map(|f| f as i64);

    Ok(Json(WikiPageResponse {
        id: e.id,
        title,
        updated_at: e.updated_at,
        doc,
        crdt_blob,
        comments,
        node_type,
        parent_id,
        order,
    }))
}

async fn move_wiki_page(
    State(state): State<AppState>,
    Path((source_project_id, page_id)): Path<(String, String)>,
    Extension(user): Extension<AuthedUser>,
    Json(req): Json<MoveWikiPageRequest>,
) -> Result<Json<MoveWikiPageResponse>, ApiError> {
    let dest = req.destination_project_id.trim();
    if dest.is_empty() {
        return Err(ApiError::bad_request("destinationProjectId is required"));
    }
    let dest = dest.to_string();

    let db = state.db.read().await;
    if !can_write(&db, &source_project_id, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }
    if !can_write(&db, &dest, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }

    let outcome = db
        .move_wiki_page_subtree(
            &state.db_path,
            &source_project_id,
            &page_id,
            &dest,
            req.destination_parent_id.as_deref(),
            req.before_page_id.as_deref(),
            &user.user_id,
        )
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("not found") {
                return ApiError::not_found("not found");
            }
            if msg.contains("cannot move")
                || msg.contains("invalid")
                || msg.contains("destination")
                || msg.contains("beforePage")
                || msg.contains("attachment destination")
            {
                return ApiError::bad_request(msg);
            }
            tracing::error!(error = %e, "wiki move failed");
            ApiError::internal()
        })?;

    let root_page_id = page_id.clone();
    let moved_page_ids = outcome.moved_page_ids.clone();
    let destination_project_id = outcome.dest_project_id.clone();

    drop(db);

    for (pid, pk) in outcome.index_deletes {
        enqueue_entity_delete(state.clone(), pid, pk);
    }
    for (pid, ent) in outcome.index_upserts {
        enqueue_entity_upsert(state.clone(), pid, ent);
    }

    Ok(Json(MoveWikiPageResponse {
        destination_project_id,
        root_page_id,
        moved_page_ids,
    }))
}

async fn save_wiki_collab_state(
    State(state): State<AppState>,
    Path((project_id, page_id)): Path<(String, String)>,
    Extension(user): Extension<AuthedUser>,
    Json(req): Json<SaveWikiCollabRequest>,
) -> Result<(StatusCode, Json<WikiPageResponse>), ApiError> {
    let db = state.db.read().await;
    if !can_write(&db, &project_id, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }
    drop(db);
    if req.crdt_blob.is_empty() {
        return Err(ApiError::bad_request("crdtBlob is required"));
    }

    let mut last_err = None;
    for attempt in 0..5 {
        let upsert = {
            let db = state.db.read().await;
            db.upsert_wiki_collab_state_for_project(
                &project_id,
                &page_id,
                req.doc.as_str(),
                req.crdt_blob.as_slice(),
                Some(&user.user_id),
            )
        };
        match upsert {
            Ok(updated) => {
                let title = updated
                    .properties
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Untitled")
                    .to_string();
                let comments = updated
                    .properties
                    .get("comments")
                    .cloned()
                    .unwrap_or(Value::Array(Vec::new()));
                let node_type = updated
                    .properties
                    .get("nodeType")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let parent_id = updated
                    .properties
                    .get("parentId")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let order = updated
                    .properties
                    .get("__keelOrder")
                    .and_then(|v| v.as_f64())
                    .map(|f| f as i64);

                enqueue_entity_upsert(state.clone(), project_id.clone(), updated.clone());

                return Ok((
                    StatusCode::OK,
                    Json(WikiPageResponse {
                        id: updated.id,
                        title,
                        updated_at: updated.updated_at,
                        doc: req.doc,
                        crdt_blob: Some(req.crdt_blob),
                        comments,
                        node_type,
                        parent_id,
                        order,
                    }),
                ));
            }
            Err(e) => {
                let msg = e.to_string();
                if msg.contains("database is locked") && attempt < 4 {
                    tokio::time::sleep(tokio::time::Duration::from_millis(50 * (attempt + 1) as u64)).await;
                    last_err = Some(e);
                    continue;
                }
                last_err = Some(e);
                break;
            }
        }
    }

    let e = last_err.unwrap();
    let msg = e.to_string();
    if msg.contains("not found") {
        return Err(ApiError::not_found("not found"));
    }
    if msg.contains("not wikiPage") {
        return Err(ApiError::bad_request("entity is not wikiPage"));
    }
    tracing::error!(error = ?e, "wiki collab upsert failed");
    Err(ApiError::internal())
}

