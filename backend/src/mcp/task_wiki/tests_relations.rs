use super::task_relations::RelationWriteLock;
use super::{create_task_for_user, update_task_for_user, TaskCreateInput, TaskUpdateInput};
use crate::app_state::{AppState, AuthConfig, LoginLimiter};
use crate::auth::Role;
use crate::db::Db;
use crate::defaults::default_manifest;
use crate::mcp::tools::read_entity_by_task_key_for_user;
use crate::models::{Project, ProjectConfig, PropertyType};
use std::sync::Arc;
use tokio::sync::RwLock;

fn tmp_state(project_id: &str, project_key: &str) -> (tempfile::TempDir, AppState) {
    tmp_state_with_manifest(project_id, project_key, default_manifest())
}

fn tmp_state_with_manifest(
    project_id: &str,
    project_key: &str,
    manifest: crate::models::ProjectManifest,
) -> (tempfile::TempDir, AppState) {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("test.sqlite3");
    let db = Db::new(path.to_string_lossy().as_ref()).expect("db");
    let project = Project {
        id: project_id.to_string(),
        name: "Test".to_string(),
        project_key: Some(project_key.to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![],
        config: ProjectConfig { manifest },
    };
    db.replace_project_state(project).expect("replace");
    let state = AppState {
        db: Arc::new(RwLock::new(db)),
        db_path: path.to_string_lossy().to_string(),
        service_gate: Arc::new(tokio::sync::RwLock::new(())),
        auth: AuthConfig::default(),
        login_limiter: Arc::new(LoginLimiter::new()),
        indexer_debounce: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
    };
    (dir, state)
}

fn admin_user() -> crate::auth::AuthedUser {
    crate::auth::AuthedUser {
        user_id: "u1".to_string(),
        email: "admin@example.local".to_string(),
        role: Role::Admin,
        last_login_at: None,
        session_id: "s1".to_string(),
    }
}

fn add_project(state: &AppState, id: &str, key: &str) {
    let project = Project {
        id: id.to_string(),
        name: key.to_string(),
        project_key: Some(key.to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![],
        config: ProjectConfig {
            manifest: default_manifest(),
        },
    };
    state
        .db
        .blocking_read()
        .replace_project_state(project)
        .expect("replace");
}

fn create_named(state: &AppState, title: &str) -> String {
    create_with(
        state,
        TaskCreateInput {
            project_key: Some("P1A".to_string()),
            title: title.to_string(),
            ..Default::default()
        },
    )
}

fn create_with(state: &AppState, input: TaskCreateInput) -> String {
    let user = admin_user();
    let out = create_task_for_user(state, &user, input).expect("create_task");
    let v: serde_json::Value = serde_json::from_str(&out).expect("parse");
    v.get("taskKey")
        .and_then(|k| k.as_str())
        .expect("taskKey")
        .to_string()
}

fn read_task(state: &AppState, task_key: &str) -> serde_json::Map<String, serde_json::Value> {
    read_entity_by_task_key_for_user(state, &admin_user(), task_key).expect("read_entity")
}

fn json_string_list(props: &serde_json::Map<String, serde_json::Value>, key: &str) -> Vec<String> {
    props
        .get(key)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

fn relations(props: &serde_json::Map<String, serde_json::Value>) -> serde_json::Value {
    props.get("_relations").expect("_relations").clone()
}

fn update_with(state: &AppState, input: TaskUpdateInput) -> serde_json::Value {
    let out = update_task_for_user(state, &admin_user(), input).expect("update_task");
    serde_json::from_str(&out).expect("parse")
}

fn changed_fields(out: &serde_json::Value) -> Vec<String> {
    let mut fields: Vec<String> = out
        .get("changedFields")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    fields.sort();
    fields
}

/// Writes a property straight to the entity, mimicking the REST/UI path that has
/// no relation validation, so tests can plant data that MCP would have rejected.
fn set_property_raw(state: &AppState, task_key: &str, key: &str, value: serde_json::Value) {
    let db = state.db.blocking_read();
    let entity = db
        .list_entities_for_project("p1")
        .expect("list entities")
        .into_iter()
        .find(|e| e.properties.get("taskKey").and_then(|v| v.as_str()) == Some(task_key))
        .expect("task entity");
    let mut patch = serde_json::Map::new();
    patch.insert(key.to_string(), value);
    db.patch_entity_for_project("p1", &entity.id, entity.updated_at, patch)
        .expect("patch entity");
}

async fn on_blocking<F>(state: AppState, f: F)
where
    F: FnOnce(&AppState) + Send + 'static,
{
    tokio::task::spawn_blocking(move || f(&state))
        .await
        .expect("join");
}

#[tokio::test]
async fn create_task_persists_blocked_by_and_read_entity_returns_it() {
    let (_dir, state) = tmp_state("p1", "P1A");
    on_blocking(state, |state| {
        let blocker = create_named(&state, "Gate A");
        let blocked = create_with(
            &state,
            TaskCreateInput {
                project_key: Some("P1A".to_string()),
                title: "Gate B".to_string(),
                blocked_by: Some(vec![blocker.clone()]),
                ..Default::default()
            },
        );

        let props = read_task(&state, &blocked);
        assert_eq!(json_string_list(&props, "blockedBy"), vec![blocker.clone()]);
        let rel = relations(&props);
        assert_eq!(
            rel.get("blockedByOpen")
                .and_then(|v| v.as_array())
                .expect("blockedByOpen")
                .iter()
                .filter_map(|v| v.as_str())
                .collect::<Vec<_>>(),
            vec![blocker.as_str()]
        );
        assert_eq!(rel.get("ready").and_then(|v| v.as_bool()), Some(false));
    })
    .await;
}

#[tokio::test]
async fn update_task_blocks_writes_into_target_blocked_by() {
    let (_dir, state) = tmp_state("p1", "P1A");
    on_blocking(state, |state| {
        let blocker = create_named(&state, "Gate A");
        let blocked = create_named(&state, "Gate B");

        update_task_for_user(
            &state,
            &admin_user(),
            TaskUpdateInput {
                task_key: blocker.clone(),
                blocks: Some(vec![blocked.clone()]),
                ..Default::default()
            },
        )
        .expect("blocks");

        let blocked_props = read_task(&state, &blocked);
        assert_eq!(
            json_string_list(&blocked_props, "blockedBy"),
            vec![blocker.clone()]
        );
        let blocker_rel = relations(&read_task(&state, &blocker));
        assert_eq!(
            blocker_rel
                .get("blocks")
                .and_then(|v| v.as_array())
                .expect("blocks")
                .iter()
                .filter_map(|v| v.as_str())
                .collect::<Vec<_>>(),
            vec![blocked.as_str()]
        );
    })
    .await;
}

#[tokio::test]
async fn read_entity_ready_becomes_true_when_blocker_is_done() {
    let (_dir, state) = tmp_state("p1", "P1A");
    on_blocking(state, |state| {
        let blocker = create_named(&state, "Gate A");
        let blocked = create_with(
            &state,
            TaskCreateInput {
                project_key: Some("P1A".to_string()),
                title: "Gate B".to_string(),
                blocked_by: Some(vec![blocker.clone()]),
                ..Default::default()
            },
        );
        assert_eq!(
            relations(&read_task(&state, &blocked))
                .get("ready")
                .and_then(|v| v.as_bool()),
            Some(false)
        );

        update_task_for_user(
            &state,
            &admin_user(),
            TaskUpdateInput {
                task_key: blocker,
                status: Some("Done".to_string()),
                ..Default::default()
            },
        )
        .expect("mark done");

        let rel = relations(&read_task(&state, &blocked));
        assert_eq!(rel.get("ready").and_then(|v| v.as_bool()), Some(true));
        assert!(rel
            .get("blockedByOpen")
            .and_then(|v| v.as_array())
            .expect("blockedByOpen")
            .is_empty());
    })
    .await;
}

#[tokio::test]
async fn parent_task_key_is_stored_and_children_are_derived() {
    let (_dir, state) = tmp_state("p1", "P1A");
    on_blocking(state, |state| {
        let parent = create_named(&state, "Epic");
        let child = create_with(
            &state,
            TaskCreateInput {
                project_key: Some("P1A".to_string()),
                title: "Child".to_string(),
                parent_task_key: Some(vec![parent.clone()]),
                ..Default::default()
            },
        );

        assert_eq!(
            json_string_list(&read_task(&state, &child), "parentTaskKey"),
            vec![parent.clone()]
        );
        let parent_rel = relations(&read_task(&state, &parent));
        assert_eq!(
            parent_rel
                .get("children")
                .and_then(|v| v.as_array())
                .expect("children")
                .iter()
                .filter_map(|v| v.as_str())
                .collect::<Vec<_>>(),
            vec![child.as_str()]
        );
    })
    .await;
}

#[tokio::test]
async fn parent_task_key_rejects_more_than_one_key() {
    let (_dir, state) = tmp_state("p1", "P1A");
    on_blocking(state, |state| {
        let a = create_named(&state, "A");
        let b = create_named(&state, "B");
        let err = create_task_for_user(
            &state,
            &admin_user(),
            TaskCreateInput {
                project_key: Some("P1A".to_string()),
                title: "C".to_string(),
                parent_task_key: Some(vec![a, b]),
                ..Default::default()
            },
        )
        .unwrap_err();
        assert!(format!("{err}").contains("parentTaskKey must be a single task key"));
    })
    .await;
}

#[tokio::test]
async fn relation_rejects_self_missing_and_cross_project() {
    let (_dir, state) = tmp_state("p1", "P1A");
    on_blocking(state, |state| {
        add_project(&state, "p2", "P2B");
        let a = create_named(&state, "A");
        create_task_for_user(
            &state,
            &admin_user(),
            TaskCreateInput {
                project_key: Some("P2B".to_string()),
                title: "Other".to_string(),
                ..Default::default()
            },
        )
        .expect("other project task");

        let self_err = update_task_for_user(
            &state,
            &admin_user(),
            TaskUpdateInput {
                task_key: a.clone(),
                blocked_by: Some(vec![a.clone()]),
                ..Default::default()
            },
        )
        .unwrap_err();
        assert!(format!("{self_err}").contains("cannot reference the same task"));

        let missing_err = update_task_for_user(
            &state,
            &admin_user(),
            TaskUpdateInput {
                task_key: a.clone(),
                blocked_by: Some(vec!["P1A-99".to_string()]),
                ..Default::default()
            },
        )
        .unwrap_err();
        assert!(format!("{missing_err}").contains("not found"));

        let cross_err = update_task_for_user(
            &state,
            &admin_user(),
            TaskUpdateInput {
                task_key: a,
                blocked_by: Some(vec!["P2B-1".to_string()]),
                ..Default::default()
            },
        )
        .unwrap_err();
        assert!(format!("{cross_err}").contains("not in project"));
    })
    .await;
}

#[tokio::test]
async fn parent_and_blocked_by_cycles_are_rejected() {
    let (_dir, state) = tmp_state("p1", "P1A");
    on_blocking(state, |state| {
        let a = create_named(&state, "A");
        let b = create_with(
            &state,
            TaskCreateInput {
                project_key: Some("P1A".to_string()),
                title: "B".to_string(),
                parent_task_key: Some(vec![a.clone()]),
                ..Default::default()
            },
        );
        let parent_cycle = update_task_for_user(
            &state,
            &admin_user(),
            TaskUpdateInput {
                task_key: a.clone(),
                parent_task_key: Some(vec![b.clone()]),
                ..Default::default()
            },
        )
        .unwrap_err();
        assert!(format!("{parent_cycle}").contains("cycle"));

        let c = create_named(&state, "C");
        let d = create_with(
            &state,
            TaskCreateInput {
                project_key: Some("P1A".to_string()),
                title: "D".to_string(),
                blocked_by: Some(vec![c.clone()]),
                ..Default::default()
            },
        );
        let dep_cycle = update_task_for_user(
            &state,
            &admin_user(),
            TaskUpdateInput {
                task_key: c,
                blocked_by: Some(vec![d]),
                ..Default::default()
            },
        )
        .unwrap_err();
        assert!(format!("{dep_cycle}").contains("cycle"));
    })
    .await;
}

#[tokio::test]
async fn create_with_blocks_and_blocked_by_same_target_is_cycle() {
    let (_dir, state) = tmp_state("p1", "P1A");
    on_blocking(state, |state| {
        let a = create_named(&state, "A");
        let err = create_task_for_user(
            &state,
            &admin_user(),
            TaskCreateInput {
                project_key: Some("P1A".to_string()),
                title: "B".to_string(),
                blocked_by: Some(vec![a.clone()]),
                blocks: Some(vec![a]),
                ..Default::default()
            },
        )
        .unwrap_err();
        assert!(format!("{err}").contains("cycle"));
    })
    .await;
}

#[tokio::test]
async fn create_task_adds_missing_relation_properties_to_manifest() {
    let mut manifest = default_manifest();
    if let Some(task) = manifest.entities.iter_mut().find(|e| e.id == "task") {
        task.properties
            .retain(|p| p.name != "parentTaskKey" && p.name != "blockedBy");
    }
    let (_dir, state) = tmp_state_with_manifest("p1", "P1A", manifest);
    on_blocking(state, |state| {
        let blocker = create_named(&state, "Gate A");
        create_with(
            &state,
            TaskCreateInput {
                project_key: Some("P1A".to_string()),
                title: "Gate B".to_string(),
                blocked_by: Some(vec![blocker]),
                ..Default::default()
            },
        );

        let (updated, _) = state
            .db
            .blocking_read()
            .get_manifest_with_etag("p1")
            .expect("get manifest")
            .expect("manifest");
        let task = updated
            .entities
            .iter()
            .find(|e| e.id == "task")
            .expect("task entity");
        for name in ["parentTaskKey", "blockedBy"] {
            let prop = task
                .properties
                .iter()
                .find(|p| p.name == name)
                .unwrap_or_else(|| panic!("missing {name}"));
            assert!(
                matches!(prop.type_, PropertyType::Link),
                "{name} should be link"
            );
        }
    })
    .await;
}

#[tokio::test]
async fn update_task_patch_still_updates_priority() {
    let (_dir, state) = tmp_state("p1", "P1A");
    on_blocking(state, |state| {
        let key = create_named(&state, "Task");
        let mut patch = serde_json::Map::new();
        patch.insert(
            "priority".to_string(),
            serde_json::Value::String("High".to_string()),
        );
        update_task_for_user(
            &state,
            &admin_user(),
            TaskUpdateInput {
                task_key: key.clone(),
                patch: Some(patch),
                ..Default::default()
            },
        )
        .expect("patch");
        let props = read_task(&state, &key);
        assert_eq!(props.get("priority").and_then(|v| v.as_str()), Some("High"));
    })
    .await;
}

#[tokio::test]
async fn create_task_persists_link_property() {
    let (_dir, state) = tmp_state("p1", "P1A");
    on_blocking(state, |state| {
        let related = create_named(&state, "Related");
        let created = create_with(
            &state,
            TaskCreateInput {
                project_key: Some("P1A".to_string()),
                title: "Has link".to_string(),
                link: Some(vec![related.clone()]),
                ..Default::default()
            },
        );
        assert_eq!(
            json_string_list(&read_task(&state, &created), "link"),
            vec![related]
        );
    })
    .await;
}

#[tokio::test]
async fn update_task_clears_blocked_by_parent_and_link() {
    let (_dir, state) = tmp_state("p1", "P1A");
    on_blocking(state, |state| {
        let other = create_named(&state, "Other");
        let key = create_with(
            &state,
            TaskCreateInput {
                project_key: Some("P1A".to_string()),
                title: "Wired".to_string(),
                parent_task_key: Some(vec![other.clone()]),
                blocked_by: Some(vec![other.clone()]),
                link: Some(vec![other.clone()]),
                ..Default::default()
            },
        );
        let props = read_task(&state, &key);
        assert_eq!(
            json_string_list(&props, "parentTaskKey"),
            vec![other.clone()]
        );
        assert_eq!(json_string_list(&props, "blockedBy"), vec![other.clone()]);
        assert_eq!(json_string_list(&props, "link"), vec![other]);

        update_task_for_user(
            &state,
            &admin_user(),
            TaskUpdateInput {
                task_key: key.clone(),
                parent_task_key: Some(vec![]),
                blocked_by: Some(vec![]),
                link: Some(vec![]),
                ..Default::default()
            },
        )
        .expect("clear relations");

        let props = read_task(&state, &key);
        assert!(json_string_list(&props, "parentTaskKey").is_empty());
        assert!(json_string_list(&props, "blockedBy").is_empty());
        assert!(json_string_list(&props, "link").is_empty());
        assert_eq!(
            relations(&props).get("ready").and_then(|v| v.as_bool()),
            Some(true)
        );
    })
    .await;
}

#[tokio::test]
async fn update_task_add_and_remove_blocked_by() {
    let (_dir, state) = tmp_state("p1", "P1A");
    on_blocking(state, |state| {
        let first = create_named(&state, "Gate A");
        let second = create_named(&state, "Gate B");
        let key = create_named(&state, "Target");

        update_task_for_user(
            &state,
            &admin_user(),
            TaskUpdateInput {
                task_key: key.clone(),
                add_blocked_by: Some(vec![first.clone()]),
                ..Default::default()
            },
        )
        .expect("add first");
        update_task_for_user(
            &state,
            &admin_user(),
            TaskUpdateInput {
                task_key: key.clone(),
                add_blocked_by: Some(vec![second.clone()]),
                ..Default::default()
            },
        )
        .expect("add second");
        assert_eq!(
            json_string_list(&read_task(&state, &key), "blockedBy"),
            vec![first.clone(), second.clone()]
        );

        update_task_for_user(
            &state,
            &admin_user(),
            TaskUpdateInput {
                task_key: key.clone(),
                remove_blocked_by: Some(vec![first]),
                ..Default::default()
            },
        )
        .expect("remove first");
        assert_eq!(
            json_string_list(&read_task(&state, &key), "blockedBy"),
            vec![second]
        );
    })
    .await;
}

#[tokio::test]
async fn update_task_patch_cannot_write_relation_properties() {
    let (_dir, state) = tmp_state("p1", "P1A");
    on_blocking(state, |state| {
        let key = create_named(&state, "Task");
        let mut patch = serde_json::Map::new();
        for name in ["parentTaskKey", "blockedBy", "link", "blocked_by", "labels"] {
            patch.insert(name.to_string(), serde_json::json!(["P9Z-999"]));
        }
        patch.insert(
            "priority".to_string(),
            serde_json::Value::String("High".to_string()),
        );
        update_task_for_user(
            &state,
            &admin_user(),
            TaskUpdateInput {
                task_key: key.clone(),
                patch: Some(patch),
                ..Default::default()
            },
        )
        .expect("patch");

        let props = read_task(&state, &key);
        assert_eq!(props.get("priority").and_then(|v| v.as_str()), Some("High"));
        for name in ["parentTaskKey", "blockedBy", "link", "blocked_by", "labels"] {
            assert!(
                !props.contains_key(name),
                "{name} must not be writable through patch"
            );
        }
    })
    .await;
}

#[tokio::test]
async fn ready_uses_last_status_option_from_manifest() {
    let mut manifest = default_manifest();
    if let Some(task) = manifest.entities.iter_mut().find(|e| e.id == "task") {
        if let Some(status) = task.properties.iter_mut().find(|p| p.name == "status") {
            status.options = Some(vec![
                "Open".to_string(),
                "In Progress".to_string(),
                "Closed".to_string(),
            ]);
        }
    }
    let (_dir, state) = tmp_state_with_manifest("p1", "P1A", manifest);
    on_blocking(state, |state| {
        let blocker = create_named(&state, "Gate A");
        let blocked = create_with(
            &state,
            TaskCreateInput {
                project_key: Some("P1A".to_string()),
                title: "Gate B".to_string(),
                blocked_by: Some(vec![blocker.clone()]),
                ..Default::default()
            },
        );
        assert_eq!(
            relations(&read_task(&state, &blocked))
                .get("ready")
                .and_then(|v| v.as_bool()),
            Some(false)
        );

        update_task_for_user(
            &state,
            &admin_user(),
            TaskUpdateInput {
                task_key: blocker,
                status: Some("Closed".to_string()),
                ..Default::default()
            },
        )
        .expect("close blocker");

        assert_eq!(
            relations(&read_task(&state, &blocked))
                .get("ready")
                .and_then(|v| v.as_bool()),
            Some(true)
        );
    })
    .await;
}

#[tokio::test]
async fn relation_noop_succeeds_with_empty_changed_fields() {
    let (_dir, state) = tmp_state("p1", "P1A");
    on_blocking(state, |state| {
        let other = create_named(&state, "Other");
        let downstream = create_named(&state, "Downstream");
        let key = create_with(
            &state,
            TaskCreateInput {
                project_key: Some("P1A".to_string()),
                title: "Wired".to_string(),
                parent_task_key: Some(vec![other.clone()]),
                blocked_by: Some(vec![other.clone()]),
                link: Some(vec![other.clone()]),
                ..Default::default()
            },
        );

        let out = update_with(
            &state,
            TaskUpdateInput {
                task_key: key.clone(),
                add_blocked_by: Some(vec![other.clone()]),
                ..Default::default()
            },
        );
        assert!(changed_fields(&out).is_empty(), "addBlockedBy no-op: {out}");

        let out = update_with(
            &state,
            TaskUpdateInput {
                task_key: key.clone(),
                parent_task_key: Some(vec![other.clone()]),
                blocked_by: Some(vec![other.clone()]),
                link: Some(vec![other]),
                ..Default::default()
            },
        );
        assert!(changed_fields(&out).is_empty(), "same-value no-op: {out}");

        let out = update_with(
            &state,
            TaskUpdateInput {
                task_key: key.clone(),
                blocks: Some(vec![downstream.clone()]),
                ..Default::default()
            },
        );
        assert_eq!(changed_fields(&out), vec!["blocks".to_string()]);
        let out = update_with(
            &state,
            TaskUpdateInput {
                task_key: key.clone(),
                blocks: Some(vec![downstream]),
                ..Default::default()
            },
        );
        assert!(changed_fields(&out).is_empty(), "blocks no-op: {out}");

        // Without any relation argument an empty update is still an error.
        let err = update_task_for_user(
            &state,
            &admin_user(),
            TaskUpdateInput {
                task_key: key,
                ..Default::default()
            },
        )
        .unwrap_err();
        assert!(format!("{err}").contains("no task fields to update"));
    })
    .await;
}

#[tokio::test]
async fn pre_existing_cycle_does_not_block_unrelated_relation_edits() {
    let (_dir, state) = tmp_state("p1", "P1A");
    on_blocking(state, |state| {
        let a = create_named(&state, "A");
        let b = create_named(&state, "B");
        let c = create_named(&state, "C");
        set_property_raw(&state, &a, "blockedBy", serde_json::json!([b.clone()]));
        set_property_raw(&state, &b, "blockedBy", serde_json::json!([a.clone()]));
        set_property_raw(&state, &a, "parentTaskKey", serde_json::json!([b.clone()]));
        set_property_raw(&state, &b, "parentTaskKey", serde_json::json!([a.clone()]));

        let out = update_with(
            &state,
            TaskUpdateInput {
                task_key: c.clone(),
                blocked_by: Some(vec![a.clone()]),
                parent_task_key: Some(vec![a.clone()]),
                ..Default::default()
            },
        );
        assert_eq!(
            changed_fields(&out),
            vec!["blockedBy".to_string(), "parentTaskKey".to_string()]
        );
        assert_eq!(
            json_string_list(&read_task(&state, &c), "blockedBy"),
            vec![a]
        );

        // A cycle that this edit really would introduce is still rejected.
        let err = update_task_for_user(
            &state,
            &admin_user(),
            TaskUpdateInput {
                task_key: b,
                add_blocked_by: Some(vec![c]),
                ..Default::default()
            },
        )
        .unwrap_err();
        assert!(format!("{err}").contains("cycle"), "{err}");
    })
    .await;
}

#[test]
fn relation_write_lock_serializes_same_project_ignoring_case() {
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::Arc;

    let inside = Arc::new(AtomicBool::new(false));
    let overlaps = Arc::new(AtomicUsize::new(0));
    let handles: Vec<_> = ["P1A", "p1a", "P1a", "P1A"]
        .into_iter()
        .map(|key| {
            let inside = inside.clone();
            let overlaps = overlaps.clone();
            std::thread::spawn(move || {
                let lock = RelationWriteLock::for_project_key(key);
                let _guard = lock.acquire();
                if inside.swap(true, Ordering::SeqCst) {
                    overlaps.fetch_add(1, Ordering::SeqCst);
                }
                std::thread::sleep(std::time::Duration::from_millis(20));
                inside.store(false, Ordering::SeqCst);
            })
        })
        .collect();
    for handle in handles {
        handle.join().expect("join");
    }
    assert_eq!(overlaps.load(Ordering::SeqCst), 0);
}
