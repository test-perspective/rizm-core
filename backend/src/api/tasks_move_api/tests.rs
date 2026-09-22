use std::collections::HashMap;
use std::sync::Arc;

use axum::http::StatusCode;
use serde_json::{json, Value};
use tokio::sync::RwLock;

use super::*;
use crate::app_state::{AppState, AuthConfig, LoginLimiter};
use crate::auth::Role;
use crate::db::Db;
use crate::models::{
    Permission, PolicyDefaults, Project, ProjectConfig, ProjectPolicy,
};

fn tmp_state() -> (tempfile::TempDir, AppState) {
    let dir = tempfile::tempdir().expect("create tempdir");
    let db_path = dir.path().join("keel_test.sqlite3").to_string_lossy().to_string();
    let db = Db::new(&db_path).expect("create db");
    for (id, key) in [("p1", "AAA"), ("p2", "BBB")] {
        db.replace_project_state(Project {
            id: id.to_string(),
            name: key.to_string(),
            project_key: Some(key.to_string()),
            lifecycle_status: Some("ready".to_string()),
            created_at: 1,
            updated_at: 1,
            entities: vec![],
            config: ProjectConfig {
                manifest: crate::defaults::default_manifest(),
            },
        })
        .expect("insert project");
    }
    let state = AppState {
        db: Arc::new(RwLock::new(db)),
        db_path,
        service_gate: Arc::new(tokio::sync::RwLock::new(())),
        auth: AuthConfig::default(),
        login_limiter: Arc::new(LoginLimiter::new()),
        indexer_debounce: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
    };
    (dir, state)
}

fn user() -> AuthedUser {
    AuthedUser {
        user_id: "u1".to_string(),
        email: "u1@test.local".to_string(),
        role: Role::Editor,
        last_login_at: None,
        session_id: "test-session".to_string(),
    }
}

async fn grant(state: &AppState, project_id: &str, permission: Permission) {
    let mut users = HashMap::new();
    users.insert("u1".to_string(), permission);
    state
        .db
        .read()
        .await
        .set_project_policy(
            project_id,
            ProjectPolicy {
                project_defaults: PolicyDefaults {
                    groups: HashMap::new(),
                    users,
                    anonymous: Permission::None,
                },
            },
        )
        .expect("set project policy");
}

/// Adds a task to `p1` and returns its entity id.
async fn add_task(state: &AppState, id: &str, extra: Value) -> String {
    let mut properties = serde_json::Map::new();
    if let Value::Object(map) = extra {
        for (k, v) in map {
            properties.insert(k, v);
        }
    }
    properties.insert("title".to_string(), json!(id));
    state
        .db
        .read()
        .await
        .create_entity_for_project("p1", Some(id), "task", properties)
        .expect("create task")
        .id
}

fn request(dest: &str, task_ids: &[&str]) -> MoveTasksRequest {
    MoveTasksRequest {
        destination_project_id: Some(dest.to_string()),
        destination_project_key: None,
        task_ids: task_ids.iter().map(|s| s.to_string()).collect(),
        task_keys: vec![],
    }
}

async fn task_keys_in(state: &AppState, project_id: &str) -> Vec<String> {
    let mut keys: Vec<String> = state
        .db
        .read()
        .await
        .list_entities_for_project(project_id)
        .expect("list")
        .into_iter()
        .filter_map(|e| {
            e.properties
                .get("taskKey")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect();
    keys.sort();
    keys
}

#[tokio::test]
async fn move_returns_the_new_keys_and_the_detached_relations() {
    let (_dir, state) = tmp_state();
    grant(&state, "p1", Permission::Write).await;
    grant(&state, "p2", Permission::Write).await;
    add_task(&state, "t1", json!({ "blockedBy": ["AAA-2"] })).await;
    add_task(&state, "t2", json!({})).await;

    let Json(result) = move_tasks_handler(
        State(state.clone()),
        Path("p1".to_string()),
        Extension(user()),
        Json(request("p2", &["t1"])),
    )
    .await
    .expect("move");

    assert_eq!(result.destination_project_key, "BBB");
    assert_eq!(result.moved.len(), 1);
    assert_eq!(result.moved[0].previous_task_key, "AAA-1");
    assert_eq!(result.moved[0].task_key, "BBB-1");
    assert_eq!(result.detached_relations.len(), 1);
    assert_eq!(result.detached_relations[0].property, "blockedBy");

    assert_eq!(task_keys_in(&state, "p1").await, vec!["AAA-2"]);
    assert_eq!(task_keys_in(&state, "p2").await, vec!["BBB-1"]);
}

#[tokio::test]
async fn move_accepts_several_tasks_in_one_request() {
    let (_dir, state) = tmp_state();
    grant(&state, "p1", Permission::Write).await;
    grant(&state, "p2", Permission::Write).await;
    add_task(&state, "t1", json!({})).await;
    add_task(&state, "t2", json!({})).await;

    let Json(result) = move_tasks_handler(
        State(state.clone()),
        Path("p1".to_string()),
        Extension(user()),
        Json(request("p2", &["t1", "t2"])),
    )
    .await
    .expect("move");

    assert_eq!(result.moved.len(), 2);
    assert_eq!(task_keys_in(&state, "p2").await, vec!["BBB-1", "BBB-2"]);
    assert!(task_keys_in(&state, "p1").await.is_empty());
}

#[tokio::test]
async fn move_requires_write_permission_on_both_projects() {
    let (_dir, state) = tmp_state();
    grant(&state, "p1", Permission::Write).await;
    grant(&state, "p2", Permission::Read).await;
    add_task(&state, "t1", json!({})).await;

    let err = move_tasks_handler(
        State(state.clone()),
        Path("p1".to_string()),
        Extension(user()),
        Json(request("p2", &["t1"])),
    )
    .await
    .expect_err("read-only destination must be refused");

    assert_eq!(err.status, StatusCode::FORBIDDEN);
    assert_eq!(task_keys_in(&state, "p1").await, vec!["AAA-1"]);
}

#[tokio::test]
async fn move_reports_a_missing_task_as_not_found() {
    let (_dir, state) = tmp_state();
    grant(&state, "p1", Permission::Write).await;
    grant(&state, "p2", Permission::Write).await;

    let err = move_tasks_handler(
        State(state.clone()),
        Path("p1".to_string()),
        Extension(user()),
        Json(request("p2", &["nope"])),
    )
    .await
    .expect_err("unknown task");

    assert_eq!(err.status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn move_rejects_an_incomplete_request() {
    let (_dir, state) = tmp_state();
    grant(&state, "p1", Permission::Write).await;
    grant(&state, "p2", Permission::Write).await;
    add_task(&state, "t1", json!({})).await;

    let no_destination = MoveTasksRequest {
        destination_project_id: None,
        destination_project_key: None,
        task_ids: vec!["t1".to_string()],
        task_keys: vec![],
    };
    let err = move_tasks_handler(
        State(state.clone()),
        Path("p1".to_string()),
        Extension(user()),
        Json(no_destination),
    )
    .await
    .expect_err("missing destination");
    assert_eq!(err.status, StatusCode::BAD_REQUEST);

    let err = move_tasks_handler(
        State(state.clone()),
        Path("p1".to_string()),
        Extension(user()),
        Json(request("p2", &[])),
    )
    .await
    .expect_err("empty selection");
    assert_eq!(err.status, StatusCode::BAD_REQUEST);

    let err = move_tasks_handler(
        State(state.clone()),
        Path("p1".to_string()),
        Extension(user()),
        Json(request("p1", &["t1"])),
    )
    .await
    .expect_err("same project");
    assert_eq!(err.status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn move_reports_an_already_moved_task_as_not_found() {
    let (_dir, state) = tmp_state();
    grant(&state, "p1", Permission::Write).await;
    grant(&state, "p2", Permission::Write).await;
    add_task(&state, "t1", json!({})).await;

    let _ = move_tasks_handler(
        State(state.clone()),
        Path("p1".to_string()),
        Extension(user()),
        Json(request("p2", &["t1"])),
    )
    .await
    .expect("first move");

    // The second request still names p1 as the source, where the task no longer is.
    let err = move_tasks_handler(
        State(state.clone()),
        Path("p1".to_string()),
        Extension(user()),
        Json(request("p2", &["t1"])),
    )
    .await
    .expect_err("second move");
    assert_eq!(err.status, StatusCode::NOT_FOUND);
}
