use std::collections::HashMap;
use std::sync::Arc;

use axum::http::StatusCode;
use serde_json::json;
use tokio::sync::RwLock;

use super::*;
use crate::app_state::{AppState, AuthConfig, LoginLimiter};
use crate::auth::Role;
use crate::db::Db;
use crate::models::{
    Permission, PolicyDefaults, Project, ProjectConfig, ProjectPolicy,
};

fn tmp_db_path() -> (tempfile::TempDir, String) {
    let dir = tempfile::tempdir().expect("create tempdir");
    let path = dir.path().join("keel_test.sqlite3");
    (dir, path.to_string_lossy().to_string())
}

fn state_for(db: Db, db_path: &str) -> AppState {
    AppState {
        db: Arc::new(RwLock::new(db)),
        db_path: db_path.to_string(),
        service_gate: Arc::new(tokio::sync::RwLock::new(())),
        auth: AuthConfig::default(),
        login_limiter: Arc::new(LoginLimiter::new()),
        indexer_debounce: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
    }
}

fn admin() -> AuthedUser {
    AuthedUser {
        user_id: "u1".to_string(),
        email: "admin@test.local".to_string(),
        role: Role::Admin,
        last_login_at: None,
        session_id: "s1".to_string(),
    }
}

fn editor() -> AuthedUser {
    AuthedUser {
        user_id: "u2".to_string(),
        email: "editor@test.local".to_string(),
        role: Role::Editor,
        last_login_at: None,
        session_id: "s2".to_string(),
    }
}

fn add_project(db: &Db, id: &str, key: &str) {
    db.replace_project_state(Project {
        id: id.to_string(),
        name: format!("Project {key}"),
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

#[tokio::test]
async fn get_task_by_key_returns_task_and_resolves_id_refs() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    // Use a non-default projectKey to avoid clashing with the seeded default project.
    add_project(&db, "p1", "P1A");

    let user_props: serde_json::Map<String, serde_json::Value> =
        json!({ "name": "Alice" }).as_object().cloned().unwrap_or_default();
    db.create_entity_for_project("p1", Some("u1"), "user", user_props)
        .expect("create user entity");

    let task_props: serde_json::Map<String, serde_json::Value> = json!({
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

    let state = state_for(db, &db_path);

    // Different casing plus leading zeros to ensure canonicalization.
    let Json(resp) = get_task_by_key(
        State(state),
        Path("p1a-0001".to_string()),
        Extension(admin()),
    )
    .await
    .expect("api ok");

    assert_eq!(resp.project.id, "p1");
    assert_eq!(resp.project.project_key, "P1A");
    assert_eq!(resp.project.name, "Project P1A");
    assert_eq!(resp.requested_task_key, "P1A-1");
    assert_eq!(resp.resolved_via, "taskKey");

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
    let assignee = resp
        .labels
        .property_refs
        .get("assigneeId")
        .expect("assigneeId ref");
    assert_eq!(assignee.id, "u1");
    assert_eq!(assignee.entity_id, "user");
    assert_eq!(assignee.label, "Alice");
}

#[tokio::test]
async fn get_task_by_key_rejects_non_prefixed_key() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    let state = state_for(db, &db_path);

    let err = get_task_by_key(
        State(state),
        Path("task-xyz".to_string()),
        Extension(admin()),
    )
    .await
    .expect_err("api error");
    assert_eq!(err.status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn get_task_by_key_falls_back_to_an_alias_after_a_move() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    add_project(&db, "p1", "AAA");
    add_project(&db, "p2", "BBB");
    db.create_entity_for_project("p1", Some("t1"), "task", serde_json::Map::new())
        .expect("create task");
    db.move_tasks_to_project(&db_path, "p1", &["t1".to_string()], "p2", "u1")
        .expect("move");

    let state = state_for(db, &db_path);
    let Json(resp) = get_task_by_key(
        State(state),
        Path("AAA-1".to_string()),
        Extension(admin()),
    )
    .await
    .expect("old key still resolves");

    assert_eq!(resp.project.id, "p2");
    assert_eq!(resp.task.id, "t1");
    assert_eq!(
        resp.task.properties.get("taskKey").and_then(|v| v.as_str()),
        Some("BBB-1")
    );
    assert_eq!(resp.requested_task_key, "AAA-1");
    assert_eq!(resp.resolved_via, "alias");
}

#[tokio::test]
async fn get_task_by_key_prefers_the_live_key_over_an_alias() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    add_project(&db, "p1", "AAA");
    add_project(&db, "p2", "BBB");
    db.create_entity_for_project("p1", Some("t1"), "task", serde_json::Map::new())
        .expect("create moved task");
    db.move_tasks_to_project(&db_path, "p1", &["t1".to_string()], "p2", "u1")
        .expect("move");
    // A second task takes the freed key back by explicit request.
    let mut props = serde_json::Map::new();
    props.insert("taskKey".to_string(), json!("AAA-1"));
    props.insert("title".to_string(), json!("Reused"));
    db.create_entity_for_project("p1", Some("t2"), "task", props)
        .expect("create reusing task");

    let state = state_for(db, &db_path);
    let Json(resp) = get_task_by_key(
        State(state),
        Path("AAA-1".to_string()),
        Extension(admin()),
    )
    .await
    .expect("live lookup wins");

    assert_eq!(resp.task.id, "t2");
    assert_eq!(resp.project.id, "p1");
    assert_eq!(resp.resolved_via, "taskKey");
}

#[tokio::test]
async fn get_task_by_key_denies_an_alias_target_without_read_permission() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    add_project(&db, "p1", "AAA");
    add_project(&db, "p2", "BBB");
    db.create_entity_for_project("p1", Some("t1"), "task", serde_json::Map::new())
        .expect("create task");
    db.move_tasks_to_project(&db_path, "p1", &["t1".to_string()], "p2", "u1")
        .expect("move");
    // The editor may read the source project but not the destination.
    let mut users = HashMap::new();
    users.insert("u2".to_string(), Permission::Read);
    db.set_project_policy(
        "p1",
        ProjectPolicy {
            project_defaults: PolicyDefaults {
                groups: HashMap::new(),
                users,
                anonymous: Permission::None,
            },
        },
    )
    .expect("policy p1");
    db.set_project_policy(
        "p2",
        ProjectPolicy {
            project_defaults: PolicyDefaults {
                groups: HashMap::new(),
                users: HashMap::new(),
                anonymous: Permission::None,
            },
        },
    )
    .expect("policy p2");

    let state = state_for(db, &db_path);
    let err = get_task_by_key(
        State(state),
        Path("AAA-1".to_string()),
        Extension(editor()),
    )
    .await
    .expect_err("alias must not leak across a permission boundary");
    assert_eq!(err.status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn get_task_by_key_returns_not_found_for_an_unknown_key() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    add_project(&db, "p1", "AAA");
    let state = state_for(db, &db_path);

    let err = get_task_by_key(
        State(state),
        Path("AAA-42".to_string()),
        Extension(admin()),
    )
    .await
    .expect_err("unknown key");
    assert_eq!(err.status, StatusCode::NOT_FOUND);
}
