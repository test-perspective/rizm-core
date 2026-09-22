//! Use-case level coverage for the cross-project task move (REQ-309).

use std::collections::HashMap;
use std::sync::Arc;

use serde_json::{json, Value};
use tokio::sync::RwLock;

use super::{move_tasks, TaskCreateInput, TaskMoveInput};
use crate::app_state::{AppState, AuthConfig, LoginLimiter};
use crate::auth::{AuthedUser, Role};
use crate::db::Db;
use crate::defaults::default_manifest;
use crate::models::{
    Permission, PolicyDefaults, Project, ProjectConfig, ProjectManifest, ProjectPolicy,
};

fn tmp_state() -> (tempfile::TempDir, AppState) {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("test.sqlite3");
    let db = Db::new(path.to_string_lossy().as_ref()).expect("db");
    let state = AppState {
        db: Arc::new(RwLock::new(db)),
        db_path: path.to_string_lossy().to_string(),
        service_gate: Arc::new(tokio::sync::RwLock::new(())),
        auth: AuthConfig::default(),
        login_limiter: Arc::new(LoginLimiter::new()),
        indexer_debounce: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
    };
    (dir, state)
}

fn add_project(state: &AppState, id: &str, key: &str, manifest: ProjectManifest) {
    let project = Project {
        id: id.to_string(),
        name: key.to_string(),
        project_key: Some(key.to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![],
        config: ProjectConfig { manifest },
    };
    state
        .db
        .blocking_read()
        .replace_project_state(project)
        .expect("replace project");
}

fn user(role: Role) -> AuthedUser {
    AuthedUser {
        user_id: "u1".to_string(),
        email: "u1@example.local".to_string(),
        role,
        last_login_at: None,
        session_id: "s1".to_string(),
    }
}

fn grant(state: &AppState, project_id: &str, permission: Permission) {
    let mut users = HashMap::new();
    users.insert("u1".to_string(), permission);
    state
        .db
        .blocking_read()
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
        .expect("set policy");
}

fn create_task(state: &AppState, input: TaskCreateInput) -> String {
    let out = super::create_task_for_user(state, &user(Role::Admin), input).expect("create task");
    let v: Value = serde_json::from_str(&out).expect("parse create result");
    v["taskKey"].as_str().expect("taskKey").to_string()
}

fn read_task(state: &AppState, project_id: &str, task_key: &str) -> serde_json::Map<String, Value> {
    state
        .db
        .blocking_read()
        .list_entities_for_project(project_id)
        .expect("list entities")
        .into_iter()
        .find(|e| e.properties.get("taskKey").and_then(Value::as_str) == Some(task_key))
        .unwrap_or_else(|| panic!("{task_key} not found in {project_id}"))
        .properties
}

fn status_options(state: &AppState, project_id: &str) -> Vec<String> {
    state
        .db
        .blocking_read()
        .get_manifest_with_etag(project_id)
        .expect("get manifest")
        .expect("manifest present")
        .0
        .entities
        .into_iter()
        .find(|e| e.id == "task")
        .expect("task definition")
        .properties
        .into_iter()
        .find(|p| p.name == "status")
        .and_then(|p| p.options)
        .unwrap_or_default()
}

/// The use case reads the DB with `blocking_read` but enqueues indexer work with
/// `tokio::spawn`, so tests need a runtime *and* a blocking thread to run on.
async fn on_blocking<F>(state: AppState, f: F)
where
    F: FnOnce(&AppState) + Send + 'static,
{
    tokio::task::spawn_blocking(move || f(&state))
        .await
        .expect("join");
}

#[tokio::test]
async fn move_tasks_moves_the_subtree_and_reports_the_new_keys() {
    let (_dir, state) = tmp_state();
    on_blocking(state, |state| {
        add_project(&state, "p1", "AAA", default_manifest());
        add_project(&state, "p2", "BBB", default_manifest());

        let parent = create_task(
            &state,
            TaskCreateInput {
                project_key: Some("AAA".to_string()),
                title: "Parent".to_string(),
                ..Default::default()
            },
        );
        create_task(
            &state,
            TaskCreateInput {
                project_key: Some("AAA".to_string()),
                title: "Child".to_string(),
                parent_task_key: Some(vec![parent.clone()]),
                ..Default::default()
            },
        );

        let result = move_tasks(
            &state,
            &user(Role::Admin),
            TaskMoveInput {
                task_keys: vec![parent.clone()],
                destination_project_key: Some("BBB".to_string()),
                ..Default::default()
            },
        )
        .expect("move");

        assert_eq!(result.source_project_id, "p1");
        assert_eq!(result.destination_project_id, "p2");
        assert_eq!(result.destination_project_key, "BBB");
        assert_eq!(result.moved.len(), 2, "the child moves with its parent");
        assert_eq!(result.moved[0].previous_task_key, parent);
        assert_eq!(result.moved[0].task_key, "BBB-1");
        assert_eq!(result.moved[1].task_key, "BBB-2");

        assert_eq!(read_task(&state, "p2", "BBB-2")["parentTaskKey"], json!("BBB-1"));
        assert!(state
            .db
            .blocking_read()
            .list_entities_for_project("p1")
            .expect("list")
            .is_empty());
    })
    .await;
}

#[tokio::test]
async fn move_tasks_accepts_entity_ids_with_an_explicit_source_project() {
    let (_dir, state) = tmp_state();
    on_blocking(state, |state| {
        add_project(&state, "p1", "AAA", default_manifest());
        add_project(&state, "p2", "BBB", default_manifest());
        create_task(
            &state,
            TaskCreateInput {
                project_key: Some("AAA".to_string()),
                title: "Solo".to_string(),
                ..Default::default()
            },
        );
        let id = state
            .db
            .blocking_read()
            .list_entities_for_project("p1")
            .expect("list")[0]
            .id
            .clone();

        let result = move_tasks(
            &state,
            &user(Role::Admin),
            TaskMoveInput {
                source_project_id: Some("p1".to_string()),
                task_ids: vec![id.clone()],
                destination_project_id: Some("p2".to_string()),
                ..Default::default()
            },
        )
        .expect("move");

        assert_eq!(result.moved.len(), 1);
        assert_eq!(result.moved[0].id, id);
    })
    .await;
}

#[tokio::test]
async fn move_tasks_backfills_the_destination_manifest() {
    let (_dir, state) = tmp_state();
    on_blocking(state, |state| {

        let mut source_manifest = default_manifest();
        {
            let task = source_manifest
                .entities
                .iter_mut()
                .find(|e| e.id == "task")
                .expect("task def");
            let status = task
                .properties
                .iter_mut()
                .find(|p| p.name == "status")
                .expect("status");
            // Source has an extra stage before its completed one.
            status.options = Some(vec![
                "Backlog".to_string(),
                "Todo".to_string(),
                "In Progress".to_string(),
                "Verifying".to_string(),
                "Done".to_string(),
            ]);
        }
        add_project(&state, "p1", "AAA", source_manifest);
        add_project(&state, "p2", "BBB", default_manifest());

        let key = create_task(
            &state,
            TaskCreateInput {
                project_key: Some("AAA".to_string()),
                title: "Needs a status".to_string(),
                status: Some("Verifying".to_string()),
                ..Default::default()
            },
        );

        let result = move_tasks(
            &state,
            &user(Role::Admin),
            TaskMoveInput {
                task_keys: vec![key],
                destination_project_key: Some("BBB".to_string()),
                ..Default::default()
            },
        )
        .expect("move");

        assert!(result.manifest_updated);
        // Inserted before the completed status so "Done" keeps that role.
        assert_eq!(
            status_options(&state, "p2"),
            vec!["Backlog", "Todo", "In Progress", "Verifying", "Done"]
        );
        assert_eq!(read_task(&state, "p2", "BBB-1")["status"], json!("Verifying"));
    })
    .await;
}

#[tokio::test]
async fn move_tasks_requires_write_permission_on_the_destination() {
    let (_dir, state) = tmp_state();
    on_blocking(state, |state| {
        add_project(&state, "p1", "AAA", default_manifest());
        add_project(&state, "p2", "BBB", default_manifest());
        let key = create_task(
            &state,
            TaskCreateInput {
                project_key: Some("AAA".to_string()),
                title: "Stay put".to_string(),
                ..Default::default()
            },
        );
        grant(&state, "p1", Permission::Write);
        grant(&state, "p2", Permission::Read);

        let err = move_tasks(
            &state,
            &user(Role::Editor),
            TaskMoveInput {
                task_keys: vec![key.clone()],
                destination_project_key: Some("BBB".to_string()),
                ..Default::default()
            },
        )
        .expect_err("read-only destination must be refused");
        assert!(
            err.to_string().contains("insufficient permissions"),
            "unexpected error: {err}"
        );

        // The task is still where it was.
        assert_eq!(read_task(&state, "p1", &key)["title"], json!("Stay put"));
    })
    .await;
}

#[tokio::test]
async fn move_tasks_rejects_keys_from_more_than_one_project() {
    let (_dir, state) = tmp_state();
    on_blocking(state, |state| {
        add_project(&state, "p1", "AAA", default_manifest());
        add_project(&state, "p2", "BBB", default_manifest());
        add_project(&state, "p3", "CCC", default_manifest());
        let a = create_task(
            &state,
            TaskCreateInput {
                project_key: Some("AAA".to_string()),
                title: "A".to_string(),
                ..Default::default()
            },
        );
        let c = create_task(
            &state,
            TaskCreateInput {
                project_key: Some("CCC".to_string()),
                title: "C".to_string(),
                ..Default::default()
            },
        );

        let err = move_tasks(
            &state,
            &user(Role::Admin),
            TaskMoveInput {
                task_keys: vec![a, c],
                destination_project_key: Some("BBB".to_string()),
                ..Default::default()
            },
        )
        .expect_err("mixed projects must be refused");
        assert!(
            err.to_string().contains("same project"),
            "unexpected error: {err}"
        );
    })
    .await;
}

#[tokio::test]
async fn move_tasks_rejects_the_source_project_as_destination() {
    let (_dir, state) = tmp_state();
    on_blocking(state, |state| {
        add_project(&state, "p1", "AAA", default_manifest());
        let key = create_task(
            &state,
            TaskCreateInput {
                project_key: Some("AAA".to_string()),
                title: "A".to_string(),
                ..Default::default()
            },
        );

        let err = move_tasks(
            &state,
            &user(Role::Admin),
            TaskMoveInput {
                task_keys: vec![key],
                destination_project_key: Some("AAA".to_string()),
                ..Default::default()
            },
        )
        .expect_err("same project must be refused");
        assert!(
            err.to_string().contains("must differ"),
            "unexpected error: {err}"
        );
    })
    .await;
}
