use serde_json::{json, Value as JsonValue};

use super::{admin_user, app_state, tmp_db};
use crate::ai_tools::tool_defs::build_tool_definitions;
use crate::ai_tools::tool_exec::{create_task, get_task, update_task, add_comment, list_tasks, search_tasks};

fn make_project_with_key(db: &crate::db::Db, id: &str, key: &str) {
    let project = crate::models::Project {
        id: id.to_string(),
        name: id.to_string(),
        project_key: Some(key.to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![],
        config: crate::models::ProjectConfig {
            manifest: crate::defaults::default_manifest(),
        },
    };
    db.replace_project_state(project).expect("replace");
}

#[test]
fn list_tasks_returns_tasks() {
    let (_dir, db) = tmp_db();
    make_project_with_key(&db, "p1", "P1A");
    db.create_entity_for_project(
        "p1",
        Some("t1"),
        "task",
        serde_json::json!({"title": "Task 1"})
            .as_object()
            .cloned()
            .unwrap_or_default(),
    )
    .expect("create task");
    let state = app_state(db);
    let user = admin_user();

    let raw = list_tasks(&state, &user, &json!({ "projectId": "p1" })).expect("list_tasks");
    let parsed: JsonValue = serde_json::from_str(&raw).expect("parse");
    let total_count = parsed.get("totalCount").and_then(|c| c.as_i64());
    assert_eq!(total_count, Some(1));
    let tasks = parsed.get("tasks").and_then(|v| v.as_array());
    assert!(tasks.map(|t| !t.is_empty()).unwrap_or(false));
}

#[test]
fn get_task_returns_task() {
    let (_dir, db) = tmp_db();
    make_project_with_key(&db, "p1", "P1A");
    db.create_entity_for_project(
        "p1",
        Some("t1"),
        "task",
        serde_json::json!({"title": "My Task", "status": "Todo"})
            .as_object()
            .cloned()
            .unwrap_or_default(),
    )
    .expect("create task");
    let state = app_state(db);
    let user = admin_user();

    let raw = get_task(&state, &user, &json!({ "taskKey": "P1A-1" })).expect("get_task");
    let parsed: JsonValue = serde_json::from_str(&raw).expect("parse");
    let task = parsed.get("task").expect("task");
    assert_eq!(task.get("title").and_then(|v| v.as_str()), Some("My Task"));
}

#[test]
fn get_task_accepts_entity_id_alias() {
    let (_dir, db) = tmp_db();
    make_project_with_key(&db, "p1", "P1A");
    db.create_entity_for_project(
        "p1",
        Some("t1"),
        "task",
        serde_json::json!({"title": "Alias Task", "status": "Todo"})
            .as_object()
            .cloned()
            .unwrap_or_default(),
    )
    .expect("create task");
    let state = app_state(db);
    let user = admin_user();

    let raw = get_task(&state, &user, &json!({ "entity_id": "P1A-1" })).expect("get_task");
    let parsed: JsonValue = serde_json::from_str(&raw).expect("parse");
    let task = parsed.get("task").expect("task");
    assert_eq!(
        task.get("title").and_then(|v| v.as_str()),
        Some("Alias Task")
    );
}

#[test]
fn add_comment_appends_task_comment() {
    let (_dir, db) = tmp_db();
    make_project_with_key(&db, "p1", "P1A");
    db.create_entity_for_project(
        "p1",
        Some("t1"),
        "task",
        serde_json::json!({"title": "Comment Task"})
            .as_object()
            .cloned()
            .unwrap_or_default(),
    )
    .expect("create task");
    let state = app_state(db);
    let user = admin_user();

    let raw = add_comment(
        &state,
        &user,
        &json!({
            "targetType": "task",
            "taskKey": "P1A-1",
            "text": "AIA comment"
        }),
    )
    .expect("add comment");
    assert!(raw.contains("comment added"));

    let raw = get_task(&state, &user, &json!({ "taskKey": "P1A-1" })).expect("get_task");
    let parsed: JsonValue = serde_json::from_str(&raw).expect("parse");
    let comments = parsed
        .get("task")
        .and_then(|t| t.get("comments"))
        .and_then(|v| v.as_array())
        .expect("comments");
    assert_eq!(comments.len(), 1);
}

#[test]
fn search_tasks_property_filter_allows_limit_above_twenty() {
    let (_dir, db) = tmp_db();
    make_project_with_key(&db, "p1", "REL");
    for i in 0..25 {
        let tid = format!("t{i}");
        db.create_entity_for_project(
            "p1",
            Some(&tid),
            "task",
            serde_json::json!({
                "title": format!("Task {i}"),
                "labels": ["0.11.0"],
                "status": "Done"
            })
            .as_object()
            .cloned()
            .unwrap_or_default(),
        )
        .expect("create task");
    }
    let state = app_state(db);
    let user = admin_user();

    let raw = search_tasks(
        &state,
        &user,
        &json!({
            "projectKey": "REL",
            "labels": ["0.11.0"],
            "limit": 100
        }),
    )
    .expect("search_tasks");
    let parsed: JsonValue = serde_json::from_str(&raw).expect("parse");
    let results = parsed
        .get("results")
        .and_then(|r| r.as_array())
        .expect("results");
    assert_eq!(
        results.len(),
        25,
        "property-filtered search should return all labeled tasks up to limit"
    );
}

#[test]
fn build_tool_definitions_includes_task_write_tools() {
    let user = admin_user();
    let tools = build_tool_definitions(&user, None, false);
    let names: Vec<String> = tools
        .iter()
        .filter_map(|t| {
            t.get("function")
                .and_then(|f| f.get("name"))
                .and_then(|n| n.as_str())
                .map(String::from)
        })
        .collect();
    assert!(names.contains(&"create_task".to_string()));
    assert!(names.contains(&"update_task".to_string()));
}

#[tokio::test]
async fn create_task_creates_task_with_labels() {
    let (_dir, db) = tmp_db();
    make_project_with_key(&db, "p1", "P1A");
    let state = app_state(db);
    let user = admin_user();

    let raw = tokio::task::spawn_blocking({
        let state = state.clone();
        let user = user.clone();
        move || {
            create_task(
                &state,
                &user,
                &json!({
                    "projectKey": "P1A",
                    "title": "New Task",
                    "labels": ["aia", "req-305"]
                }),
            )
        }
    })
    .await
    .expect("join")
    .expect("create_task");
    let parsed: JsonValue = serde_json::from_str(&raw).expect("parse");
    assert_eq!(parsed.get("title").and_then(|v| v.as_str()), Some("New Task"));

    let entities = state
        .db
        .read()
        .await
        .list_entities_for_project("p1")
        .expect("list");
    let task = entities
        .into_iter()
        .find(|e| e.properties.get("taskKey").and_then(|v| v.as_str()) == Some("P1A-1"))
        .expect("task");
    let labels = task
        .properties
        .get("labels")
        .and_then(|v| v.as_array())
        .expect("labels")
        .iter()
        .filter_map(|v| v.as_str())
        .collect::<Vec<_>>();
    assert_eq!(labels, vec!["aia", "req-305"]);
}

#[tokio::test]
async fn update_task_add_labels_via_aia() {
    let (_dir, db) = tmp_db();
    make_project_with_key(&db, "p1", "P1A");
    db.create_entity_for_project(
        "p1",
        Some("t1"),
        "task",
        serde_json::json!({
            "title": "Label Task",
            "labels": ["alpha"]
        })
        .as_object()
        .cloned()
        .unwrap_or_default(),
    )
    .expect("create task");
    let state = app_state(db);
    let user = admin_user();

    tokio::task::spawn_blocking({
        let state = state.clone();
        let user = user.clone();
        move || {
            update_task(
                &state,
                &user,
                &json!({
                    "taskKey": "P1A-1",
                    "addLabels": ["beta"]
                }),
            )
        }
    })
    .await
    .expect("join")
    .expect("update_task");

    let entities = state
        .db
        .read()
        .await
        .list_entities_for_project("p1")
        .expect("list");
    let task = entities
        .into_iter()
        .find(|e| e.properties.get("taskKey").and_then(|v| v.as_str()) == Some("P1A-1"))
        .expect("task");
    let labels = task
        .properties
        .get("labels")
        .and_then(|v| v.as_array())
        .expect("labels")
        .iter()
        .filter_map(|v| v.as_str())
        .collect::<Vec<_>>();
    assert_eq!(labels, vec!["alpha", "beta"]);
}

#[tokio::test]
async fn update_task_remove_labels_via_aia() {
    let (_dir, db) = tmp_db();
    make_project_with_key(&db, "p1", "P1A");
    db.create_entity_for_project(
        "p1",
        Some("t1"),
        "task",
        serde_json::json!({
            "title": "Label Task",
            "labels": ["alpha", "beta"]
        })
        .as_object()
        .cloned()
        .unwrap_or_default(),
    )
    .expect("create task");
    let state = app_state(db);
    let user = admin_user();

    tokio::task::spawn_blocking({
        let state = state.clone();
        let user = user.clone();
        move || {
            update_task(
                &state,
                &user,
                &json!({
                    "entity_id": "P1A-1",
                    "removeLabels": ["alpha"]
                }),
            )
        }
    })
    .await
    .expect("join")
    .expect("update_task");

    let entities = state
        .db
        .read()
        .await
        .list_entities_for_project("p1")
        .expect("list");
    let task = entities
        .into_iter()
        .find(|e| e.properties.get("taskKey").and_then(|v| v.as_str()) == Some("P1A-1"))
        .expect("task");
    let labels = task
        .properties
        .get("labels")
        .and_then(|v| v.as_array())
        .expect("labels")
        .iter()
        .filter_map(|v| v.as_str())
        .collect::<Vec<_>>();
    assert_eq!(labels, vec!["beta"]);
}

#[tokio::test]
async fn create_task_persists_blocked_by_and_get_task_derives_relations() {
    let (_dir, db) = tmp_db();
    make_project_with_key(&db, "p1", "P1A");
    db.create_entity_for_project(
        "p1",
        Some("t1"),
        "task",
        serde_json::json!({"title": "Gate A", "status": "Todo"})
            .as_object()
            .cloned()
            .unwrap_or_default(),
    )
    .expect("create blocker");
    let state = app_state(db);
    let user = admin_user();

    let (create_raw, get_raw) = tokio::task::spawn_blocking({
        let state = state.clone();
        let user = user.clone();
        move || {
            let create_raw = create_task(
                &state,
                &user,
                &json!({
                    "projectKey": "P1A",
                    "title": "Gate B",
                    "blockedBy": ["P1A-1"]
                }),
            )?;
            let get_raw = get_task(&state, &user, &json!({ "taskKey": "P1A-2" }))?;
            Ok::<_, crate::ApiError>((create_raw, get_raw))
        }
    })
    .await
    .expect("join")
    .expect("create_task");
    let parsed: JsonValue = serde_json::from_str(&create_raw).expect("parse");
    assert_eq!(parsed.get("taskKey").and_then(|v| v.as_str()), Some("P1A-2"));

    let parsed: JsonValue = serde_json::from_str(&get_raw).expect("parse");
    let task = parsed.get("task").expect("task");
    let blocked_by = task
        .get("blockedBy")
        .and_then(|v| v.as_array())
        .expect("blockedBy");
    assert_eq!(
        blocked_by
            .iter()
            .filter_map(|v| v.as_str())
            .collect::<Vec<_>>(),
        vec!["P1A-1"]
    );
    assert_eq!(
        task.get("_relations")
            .and_then(|r| r.get("ready"))
            .and_then(|v| v.as_bool()),
        Some(false)
    );
}
