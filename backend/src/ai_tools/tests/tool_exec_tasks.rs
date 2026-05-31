use serde_json::{json, Value as JsonValue};

use super::{admin_user, app_state, tmp_db};
use crate::ai_tools::tool_exec::{add_comment, get_task, list_tasks, search_tasks};

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
