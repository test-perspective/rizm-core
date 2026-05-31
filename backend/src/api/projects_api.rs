use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::api::attachments_api;
use crate::app_state::AppState;
use crate::auth::{AuthedUser, Role};
use crate::models::{Permission, PolicyDefaults, Project, ProjectConfig, ProjectPolicy};
use crate::permissions::{can_read, can_write};
use crate::search::indexer::enqueue_reindex_project;
use crate::time;
use crate::ApiError;
use axum::Extension;
use rand::Rng;
use std::collections::HashMap;
use support::{
    can_create_project, is_valid_project_key, normalize_project_key, suggest_project_key,
};

mod support;

pub(crate) use support::create_project_with_manifest;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectMeta {
    id: String,
    name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    project_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    lifecycle_status: Option<String>,
    created_at: i64,
    updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectsIndexResponse {
    active_project_id: String,
    projects: Vec<ProjectMeta>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectStateResponse {
    project: Project,
    manifest_etag: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PutProjectStateRequest {
    project: Project,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/projects", get(list_projects))
        .route("/api/projects/key-suggestion", get(suggest_project_key_api))
        .route(
            "/api/projects/key-availability",
            get(check_project_key_availability),
        )
        .route(
            "/api/projects/:project_id/state",
            get(get_project_state).put(put_project_state),
        )
        .route("/api/projects/:project_id", delete(delete_project))
}

async fn list_projects(
    State(state): State<AppState>,
    Extension(user): Extension<AuthedUser>,
) -> Result<Json<ProjectsIndexResponse>, ApiError> {
    let db = state.db.read().await;
    let rows = db.list_projects_meta().map_err(|_| ApiError::internal())?;

    let mut projects = Vec::new();
    for (id, name, project_key, lifecycle_status, created_at, updated_at) in rows {
        // Filter projects by read permission
        if can_read(&db, &id, Some(&user)).map_err(|_| ApiError::internal())? {
            projects.push(ProjectMeta {
                id,
                name,
                project_key,
                lifecycle_status: Some(lifecycle_status),
                created_at,
                updated_at,
            });
        }
    }

    // Select active project that user has access to (per-user)
    let all_active_project_id = db
        .get_active_project_id_for_user(&user.user_id)
        .map_err(|_| ApiError::internal())?;

    let active_project_id = all_active_project_id
        .filter(|id| projects.iter().any(|p| p.id == *id))
        .or_else(|| projects.get(0).map(|p| p.id.clone()))
        .unwrap_or_else(|| "default".to_string());

    Ok(Json(ProjectsIndexResponse {
        active_project_id,
        projects,
    }))
}

async fn get_project_state(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Extension(user): Extension<AuthedUser>,
) -> Result<Json<ProjectStateResponse>, ApiError> {
    let db = state.db.read().await;
    // Check read permission
    if !can_read(&db, &project_id, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }
    let mut project = match db
        .get_project_state(&project_id)
        .map_err(|_| ApiError::internal())?
    {
        None => return Err(ApiError::not_found("not found")),
        Some(p) => p,
    };

    let manifest_etag = db
        .get_manifest_with_etag(&project_id)
        .map_err(|_| ApiError::internal())?
        .map(|(_, etag)| etag)
        .unwrap_or_else(|| "0".to_string());

    // Persist active project selection on read (per-user).
    db.set_active_project_id_for_user(&project_id, &user.user_id)
        .map_err(|_| ApiError::internal())?;

    // Reduce payload: wiki doc is fetched on demand via wiki endpoints.
    for e in &mut project.entities {
        if e.entity_id == "wikiPage" {
            e.properties.remove("doc");
        }
    }

    Ok(Json(ProjectStateResponse {
        project,
        manifest_etag,
    }))
}

async fn put_project_state(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Extension(user): Extension<AuthedUser>,
    Json(req): Json<PutProjectStateRequest>,
) -> Result<StatusCode, ApiError> {
    let mut project = req.project;
    if project.id.trim() != project_id.trim() {
        return Err(ApiError::bad_request("project.id must match URL projectId"));
    }
    if project.name.trim().is_empty() {
        return Err(ApiError::bad_request("project.name is required"));
    }

    // Require a valid projectKey (3-10 chars, A-Z0-9). Normalize to uppercase.
    let key = project
        .project_key
        .as_deref()
        .map(normalize_project_key)
        .unwrap_or_default();
    if key.is_empty() {
        return Err(ApiError::bad_request("project.projectKey is required"));
    }
    if !is_valid_project_key(&key) {
        return Err(ApiError::bad_request(
            "project.projectKey must be 3-10 chars (A-Z0-9)",
        ));
    }
    project.project_key = Some(key);

    // Be conservative: ensure we always have a manifest.
    // (Client normally sends one, but we avoid DB corruption on malformed requests.)
    if project.config.manifest.entities.is_empty() || project.config.manifest.views.is_empty() {
        project.config = ProjectConfig {
            manifest: crate::defaults::default_manifest(),
        };
    }

    let db = state.db.read().await;

    // Check if this is a new project creation
    let existing_project = db
        .get_project_state(&project_id)
        .map_err(|_| ApiError::internal())?;
    let is_new_project = existing_project.is_none();

    // Check permissions: for new projects, require admin/editor role; for existing projects, require write permission
    if is_new_project {
        if !can_create_project(user.role) {
            return Err(ApiError::forbidden("viewer role cannot create projects"));
        }
    } else {
        if !can_write(&db, &project_id, Some(&user)).map_err(|_| ApiError::internal())? {
            return Err(ApiError::forbidden("insufficient permissions"));
        }
    }

    db.replace_project_state(project.clone()).map_err(|e| {
        let s = e.to_string();
        if s.contains("idx_projects_project_key")
            || s.contains("UNIQUE constraint failed: projects.project_key")
        {
            ApiError::bad_request("project.projectKey must be unique")
        } else {
            ApiError::internal()
        }
    })?;

    enqueue_reindex_project(state.clone(), project_id.clone());

    // For new projects, set up default policy granting the creator write access
    if is_new_project {
        let mut users_map = HashMap::new();
        users_map.insert(user.user_id.clone(), Permission::Write);
        let policy = ProjectPolicy {
            project_defaults: PolicyDefaults {
                users: users_map,
                groups: HashMap::new(),
                anonymous: Permission::None,
            },
        };
        db.set_project_policy(&project_id, policy)
            .map_err(|_| ApiError::internal())?;

        // Log activity for new project creation
        let meta_json = json!({
            "entity_type": "PROJECT",
            "entity_id": project.id,
            "entity_title": project.name,
            "project_id": project.id,
            "project_name": project.name,
            "project_key": project.project_key.as_deref().unwrap_or(""),
        });
        let meta_json_str = serde_json::to_string(&meta_json).unwrap_or_default();
        let now = time::now_ms();
        let db_clone = db.clone();
        let _ = db.insert_audit_log_with_activity(
            Some(&user.user_id),
            "PROJECT_CREATED",
            None,
            Some(&meta_json_str),
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

    // Treat the saved project as active (per-user).
    db.set_active_project_id_for_user(&project_id, &user.user_id)
        .map_err(|_| ApiError::internal())?;

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
struct SuggestProjectKeyQuery {
    name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SuggestProjectKeyResponse {
    project_key: String,
}

async fn suggest_project_key_api(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<SuggestProjectKeyQuery>,
    Extension(_user): Extension<AuthedUser>,
) -> Result<Json<SuggestProjectKeyResponse>, ApiError> {
    let name = params.name.trim().to_string();
    let state = state.clone();
    let project_key = tokio::task::spawn_blocking(move || {
        suggest_project_key(&name, |candidate| {
            state
                .db
                .blocking_read()
                .get_project_id_by_key(candidate)
                .map(|id| id.is_some())
                .unwrap_or(true)
        })
    })
    .await
    .map_err(|e| {
        tracing::error!(error = ?e, "suggest_project_key spawn_blocking join failed");
        ApiError::internal()
    })?;
    Ok(Json(SuggestProjectKeyResponse { project_key }))
}

#[derive(Debug, Deserialize)]
struct CheckProjectKeyAvailabilityQuery {
    key: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CheckProjectKeyAvailabilityResponse {
    available: bool,
}

async fn check_project_key_availability(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<CheckProjectKeyAvailabilityQuery>,
    Extension(_user): Extension<AuthedUser>,
) -> Result<Json<CheckProjectKeyAvailabilityResponse>, ApiError> {
    let key = normalize_project_key(params.key.trim());
    if key.is_empty() || !is_valid_project_key(&key) {
        return Err(ApiError::bad_request(
            "project.projectKey must be 3-10 chars (A-Z0-9)",
        ));
    }
    let db = state.db.read().await;
    let exists = db
        .get_project_id_by_key(&key)
        .map_err(|_| ApiError::internal())?
        .is_some();
    Ok(Json(CheckProjectKeyAvailabilityResponse {
        available: !exists,
    }))
}

async fn delete_project(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Extension(user): Extension<AuthedUser>,
) -> Result<StatusCode, ApiError> {
    // Require admin role for deletion (destructive operation)
    if user.role != Role::Admin {
        return Err(ApiError::forbidden("admin role required"));
    }
    let db = state.db.read().await;
    // Also check write permission as an additional safety check
    if !can_write(&db, &project_id, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }

    // Delete the project
    db.delete_project(&project_id).map_err(|e| {
        let s = e.to_string();
        if s.contains("not found") {
            ApiError::not_found("project not found")
        } else {
            ApiError::internal()
        }
    })?;

    // Remove attachment files from disk (best-effort)
    if let Err(e) = attachments_api::delete_project_attachments_dir(&state.db_path, &project_id) {
        tracing::warn!(error = %e, project_id = %project_id, "failed to delete project attachments dir");
    }

    // Log activity for project deletion
    let meta_json = json!({
        "entity_type": "PROJECT",
        "entity_id": project_id,
        "project_id": project_id,
    });
    let meta_json_str = serde_json::to_string(&meta_json).unwrap_or_default();
    let now = time::now_ms();
    let _ = db.insert_audit_log_with_activity(
        Some(&user.user_id),
        "PROJECT_DELETED",
        None,
        Some(&meta_json_str),
        now,
        true,
    );

    Ok(StatusCode::NO_CONTENT)
}
