use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::app_state::AppState;
use crate::auth::{AuthedUser, Role};
use crate::models::{ManifestVersionSummary, ProjectManifest};
use crate::ApiError;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionsQuery {
    #[serde(default)]
    limit: Option<u32>,
    #[serde(default)]
    offset: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RevertRequest {
    version_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ManifestVersionDetail {
    #[serde(flatten)]
    summary: ManifestVersionSummary,
    manifest: ProjectManifest,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/projects/:project_id/manifest/versions",
            get(list_versions),
        )
        .route(
            "/api/projects/:project_id/manifest/versions/:version_id",
            get(get_version).delete(hide_version),
        )
        .route(
            "/api/projects/:project_id/manifest/versions/clear",
            post(clear_versions),
        )
        .route(
            "/api/projects/:project_id/manifest/revert",
            post(revert_manifest),
        )
}

async fn list_versions(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Query(q): Query<VersionsQuery>,
) -> Result<Json<Vec<ManifestVersionSummary>>, ApiError> {
    let limit = q.limit.unwrap_or(50).min(200) as i64;
    let offset = q.offset.unwrap_or(0) as i64;
    let db = state.db.read().await;
    let rows = db
        .list_manifest_versions(&project_id, limit, offset)
        .map_err(|_| ApiError::internal())?;
    Ok(Json(rows))
}

async fn get_version(
    State(state): State<AppState>,
    Path((project_id, version_id)): Path<(String, String)>,
) -> Result<Json<ManifestVersionDetail>, ApiError> {
    let db = state.db.read().await;
    let Some((summary, manifest)) = db
        .get_manifest_version(&project_id, &version_id)
        .map_err(|_| ApiError::internal())?
    else {
        return Err(ApiError::not_found("not found"));
    };
    Ok(Json(ManifestVersionDetail { summary, manifest }))
}

async fn revert_manifest(
    State(state): State<AppState>,
    Extension(actor): Extension<AuthedUser>,
    Path(project_id): Path<String>,
    Json(req): Json<RevertRequest>,
) -> Result<StatusCode, ApiError> {
    ensure_editor(&actor)?;
    if req.version_id.trim().is_empty() {
        return Err(ApiError::bad_request("versionId is required"));
    }
    let msg = format!("revert to {}", req.version_id.trim());
    let db = state.db.read().await;
    db
        .revert_manifest_to_version(&project_id, req.version_id.trim(), Some(&actor.user_id), Some(&msg))
        .map_err(|e| {
            let s = e.to_string();
            if s.contains("project not found") || s.contains("version not found") {
                ApiError::not_found("not found")
            } else {
                ApiError::internal()
            }
        })?;
    Ok(StatusCode::NO_CONTENT)
}

async fn hide_version(
    State(state): State<AppState>,
    Extension(actor): Extension<AuthedUser>,
    Path((project_id, version_id)): Path<(String, String)>,
) -> Result<StatusCode, ApiError> {
    ensure_editor(&actor)?;
    if version_id.trim().is_empty() {
        return Err(ApiError::bad_request("versionId is required"));
    }
    let db = state.db.read().await;
    db
        .hide_manifest_version(&project_id, &version_id.trim(), Some(&actor.user_id))
        .map_err(|e| {
            let s = e.to_string();
            if s.contains("project not found") || s.contains("version not found") {
                ApiError::not_found("not found")
            } else {
                ApiError::internal()
            }
        })?;
    Ok(StatusCode::NO_CONTENT)
}

async fn clear_versions(
    State(state): State<AppState>,
    Extension(actor): Extension<AuthedUser>,
    Path(project_id): Path<String>,
) -> Result<StatusCode, ApiError> {
    ensure_editor(&actor)?;
    let db = state.db.read().await;
    db
        .clear_manifest_versions(&project_id, Some(&actor.user_id))
        .map_err(|e| {
            let s = e.to_string();
            if s.contains("project not found") {
                ApiError::not_found("not found")
            } else {
                ApiError::internal()
            }
        })?;
    Ok(StatusCode::NO_CONTENT)
}

fn ensure_editor(user: &AuthedUser) -> Result<(), ApiError> {
    if user.role == Role::Viewer {
        return Err(ApiError::forbidden("forbidden"));
    }
    Ok(())
}

