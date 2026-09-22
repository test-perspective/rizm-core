use axum::{
    extract::{Path, State},
    routing::get,
    Extension, Json, Router,
};
use serde::Serialize;
use std::collections::HashMap;

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::db::{Db, ProjectMeta};
use crate::models::Entity;
use crate::permissions::can_read;
use crate::task_key::parse_task_key_and_project;
use crate::ApiError;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectMetaResponse {
    id: String,
    project_key: String,
    name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RefLabel {
    id: String,
    label: String,
    entity_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TaskLabels {
    entity_id: String,
    property_refs: HashMap<String, RefLabel>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TaskLookupResponse {
    project: ProjectMetaResponse,
    task: Entity,
    labels: TaskLabels,
    /// The key that was asked for, canonicalised.
    requested_task_key: String,
    /// `taskKey` for the task's current key, `alias` for a key it used before a
    /// cross-project move (REQ-309).
    resolved_via: &'static str,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/api/tasks/:task_key", get(get_task_by_key))
}

async fn get_task_by_key(
    State(state): State<AppState>,
    Path(task_key): Path<String>,
    Extension(user): Extension<AuthedUser>,
) -> Result<Json<TaskLookupResponse>, ApiError> {
    let (project_key, canonical_task_key) = parse_task_key_and_project(&task_key)
        .map_err(|_| ApiError::bad_request("invalid taskKey"))?;

    let db = state.db.read().await;

    if let Some((project, task)) = find_live_task(&db, &project_key, &canonical_task_key)? {
        return Ok(Json(build_response(
            &db,
            project,
            task,
            &canonical_task_key,
            "taskKey",
        )?));
    }

    // A task that moved projects keeps its old keys resolvable. This path crosses
    // into another project, so unlike the live lookup it checks read permission.
    let (project, task) = db
        .resolve_task_by_alias(&canonical_task_key)
        .map_err(|_| ApiError::internal())?
        .ok_or_else(|| ApiError::not_found("not found"))?;
    if !can_read(&db, &project.id, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }
    Ok(Json(build_response(
        &db,
        project,
        task,
        &canonical_task_key,
        "alias",
    )?))
}

/// Look the key up as the task's current key, in the project its prefix names.
fn find_live_task(
    db: &Db,
    project_key: &str,
    canonical_task_key: &str,
) -> Result<Option<(ProjectMeta, Entity)>, ApiError> {
    let Some(project) = db
        .get_project_meta_by_key(project_key)
        .map_err(|_| ApiError::internal())?
    else {
        return Ok(None);
    };
    let task = db
        .list_entities_for_project(&project.id)
        .map_err(|_| ApiError::internal())?
        .into_iter()
        .find(|e| {
            e.entity_id == "task"
                && e.properties
                    .get("taskKey")
                    .and_then(|v| v.as_str())
                    .map(|s| s == canonical_task_key)
                    .unwrap_or(false)
        });
    Ok(task.map(|t| (project, t)))
}

fn build_response(
    db: &Db,
    project: ProjectMeta,
    task: Entity,
    requested_task_key: &str,
    resolved_via: &'static str,
) -> Result<TaskLookupResponse, ApiError> {
    let entities = db
        .list_entities_for_project(&project.id)
        .map_err(|_| ApiError::internal())?;

    let manifest = db
        .get_manifest_with_etag(&project.id)
        .map_err(|_| ApiError::internal())?
        .map(|(m, _)| m)
        .unwrap_or_else(crate::defaults::default_manifest);

    let entity_id_label = manifest
        .entities
        .iter()
        .find(|d| d.id == task.entity_id)
        .map(|d| d.name.clone())
        .unwrap_or_else(|| task.entity_id.clone());

    let mut property_refs: HashMap<String, RefLabel> = HashMap::new();
    for (k, v) in &task.properties {
        if !k.ends_with("Id") {
            continue;
        }
        let Some(id) = v.as_str() else { continue };
        if id.trim().is_empty() {
            continue;
        }
        let Some(target) = entities.iter().find(|e| e.id == id) else {
            continue;
        };
        property_refs.insert(
            k.clone(),
            RefLabel {
                id: id.to_string(),
                label: entity_label(target),
                entity_id: target.entity_id.clone(),
            },
        );
    }

    Ok(TaskLookupResponse {
        project: ProjectMetaResponse {
            id: project.id,
            project_key: project.project_key,
            name: project.name,
        },
        task,
        labels: TaskLabels {
            entity_id: entity_id_label,
            property_refs,
        },
        requested_task_key: requested_task_key.to_string(),
        resolved_via,
    })
}

fn entity_label(e: &Entity) -> String {
    e.properties
        .get("title")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string())
        .or_else(|| {
            e.properties
                .get("name")
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.to_string())
        })
        .or_else(|| {
            e.properties
                .get("taskKey")
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| e.id.clone())
}

#[cfg(test)]
mod tests;
