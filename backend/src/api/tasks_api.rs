use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};
use serde::Serialize;
use std::collections::HashMap;

use crate::app_state::AppState;
use crate::models::Entity;
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
}

pub fn router() -> Router<AppState> {
    Router::new().route("/api/tasks/:task_key", get(get_task_by_key))
}

async fn get_task_by_key(
    State(state): State<AppState>,
    Path(task_key): Path<String>,
) -> Result<Json<TaskLookupResponse>, ApiError> {
    let (project_key, canonical_task_key) =
        parse_task_key_and_project(&task_key).map_err(|_| ApiError::bad_request("invalid taskKey"))?;

    let db = state.db.read().await;
    let project = db
        .get_project_meta_by_key(&project_key)
        .map_err(|_| ApiError::internal())?
        .ok_or_else(|| ApiError::not_found("not found"))?;

    let entities = db
        .list_entities_for_project(&project.id)
        .map_err(|_| ApiError::internal())?;

    let task = entities
        .iter()
        .find(|e| {
            e.entity_id == "task"
                && e.properties
                    .get("taskKey")
                    .and_then(|v| v.as_str())
                    .map(|s| s == canonical_task_key.as_str())
                    .unwrap_or(false)
        })
        .cloned()
        .ok_or_else(|| ApiError::not_found("not found"))?;

    let manifest = db
        .get_manifest_with_etag(&project.id)
        .map_err(|_| ApiError::internal())?
        .map(|(m, _)| m)
        .unwrap_or_else(|| crate::defaults::default_manifest());

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

    Ok(Json(TaskLookupResponse {
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
    }))
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
mod tests {
    use super::*;
    use crate::app_state::{AppState, AuthConfig, LoginLimiter};
    use crate::db::Db;
    use crate::models::{Project, ProjectConfig};
    use axum::http::StatusCode;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn tmp_db_path() -> (tempfile::TempDir, String) {
        let dir = tempfile::tempdir().expect("create tempdir");
        let path = dir.path().join("keel_test.sqlite3");
        (dir, path.to_string_lossy().to_string())
    }

    #[tokio::test]
    async fn get_task_by_key_returns_task_and_resolves_id_refs() {
        let (_dir, db_path) = tmp_db_path();
        let db = Db::new(&db_path).expect("create db");

        let now = 1_i64;
        let p = Project {
            id: "p1".to_string(),
            name: "Project 1".to_string(),
            // Use a non-default projectKey to avoid clashing with the seeded default project.
            project_key: Some("P1A".to_string()),
            lifecycle_status: Some("ready".to_string()),
            created_at: now,
            updated_at: now,
            entities: vec![],
            config: ProjectConfig {
                manifest: crate::defaults::default_manifest(),
            },
        };
        db.replace_project_state(p).expect("insert project");

        // Reference target entity (e.g. assigneeId -> this entity.id).
        let user_props: serde_json::Map<String, serde_json::Value> =
            serde_json::json!({ "name": "Alice" }).as_object().cloned().unwrap_or_default();
        let _user = db
            .create_entity_for_project("p1", Some("u1"), "user", user_props)
            .expect("create user entity");

        // Task with *Id ref.
        let task_props: serde_json::Map<String, serde_json::Value> = serde_json::json!({
            "title": "Test task",
            "assigneeId": "u1",
            "owner": "u1"
        })
        .as_object()
        .cloned()
        .unwrap_or_default();
        let task = db
            .create_entity_for_project("p1", Some("t1"), "task", task_props)
            .expect("create task");

        let state = AppState {
            db: Arc::new(RwLock::new(db)),
            db_path: db_path.clone(),
            service_gate: Arc::new(tokio::sync::RwLock::new(())),
            auth: AuthConfig::default(),
            login_limiter: Arc::new(LoginLimiter::new()),
            indexer_debounce: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
        };

        // Use different casing + leading zeros to ensure canonicalization.
        let Json(resp) = get_task_by_key(State(state), Path("p1a-0001".to_string()))
            .await
            .expect("api ok");

        assert_eq!(resp.project.id, "p1");
        assert_eq!(resp.project.project_key, "P1A");
        assert_eq!(resp.project.name, "Project 1");

        assert_eq!(resp.task.id, task.id);
        assert_eq!(resp.task.entity_id, "task");
        assert_eq!(
            resp.task.properties.get("taskKey").and_then(|v| v.as_str()),
            Some("P1A-1")
        );

        // entityId label from manifest
        assert_eq!(resp.labels.entity_id, "Task");

        // Only *Id suffix keys are resolved.
        assert!(resp.labels.property_refs.contains_key("assigneeId"));
        assert!(!resp.labels.property_refs.contains_key("owner"));
        let assignee = resp.labels.property_refs.get("assigneeId").expect("assigneeId ref");
        assert_eq!(assignee.id, "u1");
        assert_eq!(assignee.entity_id, "user");
        assert_eq!(assignee.label, "Alice");
    }

    #[tokio::test]
    async fn get_task_by_key_rejects_non_prefixed_key() {
        let (_dir, db_path) = tmp_db_path();
        let db = Db::new(&db_path).expect("create db");

        let state = AppState {
            db: Arc::new(RwLock::new(db)),
            db_path: db_path.clone(),
            service_gate: Arc::new(tokio::sync::RwLock::new(())),
            auth: AuthConfig::default(),
            login_limiter: Arc::new(LoginLimiter::new()),
            indexer_debounce: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
        };

        let err = get_task_by_key(State(state), Path("task-xyz".to_string()))
            .await
            .expect_err("api error");
        assert_eq!(err.status, StatusCode::BAD_REQUEST);
    }
}

