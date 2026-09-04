use axum::{
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde_json::Value;

use crate::app_state::{AppState, AuthConfig, LoginLimiter};
use crate::auth::Role;
use crate::db::Db;
use crate::defaults::default_manifest;
use crate::models::{Project, ProjectConfig};
use std::sync::Arc;
use tokio::sync::RwLock;

fn tmp_db_path() -> (tempfile::TempDir, String) {
    let dir = tempfile::tempdir().expect("create tempdir");
    let path = dir.path().join("keel_test.sqlite3");
    (dir, path.to_string_lossy().to_string())
}

fn mk_state_with_project(project_id: &str, project_key: &str) -> (tempfile::TempDir, AppState) {
    let (dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    let now = 1_i64;
    let project = Project {
        id: project_id.to_string(),
        name: "Project".to_string(),
        project_key: Some(project_key.to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: now,
        updated_at: now,
        entities: vec![],
        config: ProjectConfig {
            manifest: default_manifest(),
        },
    };
    db.replace_project_state(project).expect("insert project");
    let state = AppState {
        db: Arc::new(RwLock::new(db)),
        db_path,
        service_gate: Arc::new(tokio::sync::RwLock::new(())),
        auth: AuthConfig::default(),
        login_limiter: Arc::new(LoginLimiter::new()),
        indexer_debounce: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
    };
    (dir, state)
}

fn mk_user(role: Role) -> crate::auth::AuthedUser {
    crate::auth::AuthedUser {
        user_id: "u1".to_string(),
        email: "u1@example.local".to_string(),
        role,
        last_login_at: None,
        session_id: "s1".to_string(),
    }
}

fn tool_content_text(result: &Value) -> &str {
    result
        .get("content")
        .and_then(|c| c.as_array())
        .and_then(|a| a.first())
        .and_then(|c| c.get("text"))
        .and_then(|t| t.as_str())
        .expect("content text")
}

#[test]
fn markdown_to_blocknote_doc_converts_basic_blocks() {
    let doc = crate::mcp::markdown::markdown_to_blocknote_doc("# H1\n## H2\n- item\nplain")
        .expect("convert");
    let blocks: Value = serde_json::from_str(&doc).expect("parse doc json");
    let arr = blocks.as_array().expect("array");
    assert_eq!(arr.len(), 4);
    assert_eq!(arr[0].get("type").and_then(Value::as_str), Some("heading"));
    assert_eq!(
        arr[0]
            .get("props")
            .and_then(|v| v.get("level"))
            .and_then(Value::as_i64),
        Some(1)
    );
    assert_eq!(
        arr[2].get("type").and_then(Value::as_str),
        Some("bulletListItem")
    );
    assert_eq!(
        arr[3].get("type").and_then(Value::as_str),
        Some("paragraph")
    );
}

#[test]
fn markdown_to_blocknote_doc_converts_inline_bold_and_italic() {
    let doc = crate::mcp::markdown::markdown_to_blocknote_doc(
        "The project **REQ** currently has **28** tasks.\n*Investigation performed on:* Sun, 1 Mar 2026",
    )
    .expect("convert");
    let blocks: Value = serde_json::from_str(&doc).expect("parse doc json");
    let arr = blocks.as_array().expect("array");
    assert_eq!(arr.len(), 2);

    let content0 = arr[0]
        .get("content")
        .and_then(Value::as_array)
        .expect("content");
    assert!(content0.len() >= 3);
    let bold_segments: Vec<_> = content0
        .iter()
        .filter(|c| {
            c.get("styles")
                .and_then(|s| s.get("bold"))
                .and_then(Value::as_bool)
                == Some(true)
        })
        .collect();
    assert_eq!(bold_segments.len(), 2);
    assert_eq!(
        bold_segments[0].get("text").and_then(Value::as_str),
        Some("REQ")
    );
    assert_eq!(
        bold_segments[1].get("text").and_then(Value::as_str),
        Some("28")
    );

    let content1 = arr[1]
        .get("content")
        .and_then(Value::as_array)
        .expect("content");
    let italic_segments: Vec<_> = content1
        .iter()
        .filter(|c| {
            c.get("styles")
                .and_then(|s| s.get("italic"))
                .and_then(Value::as_bool)
                == Some(true)
        })
        .collect();
    assert_eq!(italic_segments.len(), 1);
    assert_eq!(
        italic_segments[0].get("text").and_then(Value::as_str),
        Some("Investigation performed on:")
    );
}

#[test]
fn markdown_to_blocknote_doc_converts_bullet_with_bold() {
    let doc = crate::mcp::markdown::markdown_to_blocknote_doc(
        "* **create_wiki_page** ツール追加（projectId/projectKey, title, content）",
    )
    .expect("convert");
    let blocks: Value = serde_json::from_str(&doc).expect("parse doc json");
    let arr = blocks.as_array().expect("array");
    assert_eq!(arr.len(), 1);
    assert_eq!(
        arr[0].get("type").and_then(Value::as_str),
        Some("bulletListItem")
    );
    let content = arr[0]
        .get("content")
        .and_then(Value::as_array)
        .expect("content");
    let bold_segments: Vec<_> = content
        .iter()
        .filter(|c| {
            c.get("styles")
                .and_then(|s| s.get("bold"))
                .and_then(Value::as_bool)
                == Some(true)
        })
        .collect();
    assert_eq!(bold_segments.len(), 1);
    assert_eq!(
        bold_segments[0].get("text").and_then(Value::as_str),
        Some("create_wiki_page")
    );
}

#[test]
fn add_comment_for_task_requires_write_permission() {
    let (_dir, state) = mk_state_with_project("p1", "P1A");
    let _task = state
        .db
        .blocking_read()
        .create_entity_for_project(
            "p1",
            Some("t1"),
            "task",
            serde_json::json!({"title": "Task 1"})
                .as_object()
                .cloned()
                .unwrap_or_default(),
        )
        .expect("create task");

    let viewer = mk_user(Role::Viewer);
    let args = serde_json::json!({
        "targetType": "task",
        "taskKey": "P1A-1",
        "text": "hello"
    });
    let err =
        crate::mcp::tools::add_comment_for_target(&state, &viewer, &args).expect_err("should fail");
    assert!(format!("{err:#}").contains("insufficient permissions"));
}

#[test]
fn add_comment_for_task_appends_comment() {
    let (_dir, state) = mk_state_with_project("p1", "P1A");
    let _task = state
        .db
        .blocking_read()
        .create_entity_for_project(
            "p1",
            Some("t1"),
            "task",
            serde_json::json!({"title": "Task 1"})
                .as_object()
                .cloned()
                .unwrap_or_default(),
        )
        .expect("create task");

    let admin = mk_user(Role::Admin);
    let args = serde_json::json!({
        "targetType": "task",
        "taskKey": "P1A-1",
        "text": "## Plan\n- step1"
    });
    let msg =
        crate::mcp::tools::add_comment_for_target(&state, &admin, &args).expect("add comment");
    assert!(msg.contains("comment added"));

    let props = crate::mcp::tools::read_entity_by_task_key_for_user(&state, &admin, "P1A-1")
        .expect("read entity");
    let comments = props
        .get("comments")
        .and_then(Value::as_array)
        .expect("comments array");
    assert_eq!(comments.len(), 1);
    let doc = comments[0]
        .get("doc")
        .and_then(|v| v.as_str())
        .expect("doc text");
    let blocks: Value = serde_json::from_str(doc).expect("doc json");
    assert!(blocks.as_array().map(|a| !a.is_empty()).unwrap_or(false));
}

#[test]
fn list_tasks_returns_tasks() {
    let (_dir, state) = mk_state_with_project("p1", "P1A");
    let _ = state
        .db
        .blocking_read()
        .create_entity_for_project(
            "p1",
            Some("t1"),
            "task",
            serde_json::json!({"title": "Task 1"})
                .as_object()
                .cloned()
                .unwrap_or_default(),
        )
        .expect("create task");
    let admin = mk_user(Role::Admin);
    let result = crate::mcp::task_wiki::list_tasks_for_user(&state, &admin, Some("P1A"), None, 10)
        .expect("list_tasks");
    let v: Value = serde_json::from_str(&result).expect("parse");
    let tasks = v.get("tasks").and_then(|t| t.as_array()).expect("tasks");
    assert!(!tasks.is_empty());
}

#[tokio::test]
async fn create_task_tool_creates_task() {
    let (_dir, state) = mk_state_with_project("p1", "P1A");
    let admin = mk_user(Role::Admin);
    let params = serde_json::json!({
        "name": "create_task",
        "arguments": {
            "projectKey": "P1A",
            "title": "New MCP Task",
            "status": "Todo",
            "priority": "High",
            "labels": ["mcp", "REQ-299"],
            "description": "## Details\n- created from MCP"
        }
    });

    let result = crate::mcp::tools::tools_call(&state, &admin, params)
        .await
        .expect("tools_call");
    let v: Value = serde_json::from_str(tool_content_text(&result)).expect("parse");
    assert_eq!(v.get("taskKey").and_then(Value::as_str), Some("P1A-1"));

    let entities = state
        .db
        .read()
        .await
        .list_entities_for_project("p1")
        .expect("list entities");
    let props = &entities
        .iter()
        .find(|e| e.properties.get("taskKey").and_then(Value::as_str) == Some("P1A-1"))
        .expect("task")
        .properties;
    assert_eq!(
        props.get("title").and_then(Value::as_str),
        Some("New MCP Task")
    );
    assert_eq!(props.get("createdBy").and_then(Value::as_str), Some("u1"));
    assert!(props.get("Description").and_then(Value::as_str).is_some());
}

#[tokio::test]
async fn create_task_tool_requires_write_permission() {
    let (_dir, state) = mk_state_with_project("p1", "P1A");
    let viewer = mk_user(Role::Viewer);
    let params = serde_json::json!({
        "name": "create_task",
        "arguments": {
            "projectKey": "P1A",
            "title": "Denied Task"
        }
    });

    let err = crate::mcp::tools::tools_call(&state, &viewer, params)
        .await
        .expect_err("viewer should fail");
    assert!(format!("{err:#}").contains("insufficient permissions"));
}

#[tokio::test]
async fn update_task_tool_updates_fields_and_ignores_actor_patch() {
    let (_dir, state) = mk_state_with_project("p1", "P1A");
    state
        .db
        .read()
        .await
        .create_entity_for_project(
            "p1",
            Some("t1"),
            "task",
            serde_json::json!({"title": "Task 1", "status": "Todo", "createdBy": "owner"})
                .as_object()
                .cloned()
                .unwrap_or_default(),
        )
        .expect("create task");
    let admin = mk_user(Role::Admin);
    let params = serde_json::json!({
        "name": "update_task",
        "arguments": {
            "taskKey": "P1A-1",
            "status": "In Progress",
            "labels": ["mcp"],
            "patch": {
                "createdBy": "attacker",
                "updatedBy": "attacker",
                "priority": "High"
            }
        }
    });

    let result = crate::mcp::tools::tools_call(&state, &admin, params)
        .await
        .expect("tools_call");
    let v: Value = serde_json::from_str(tool_content_text(&result)).expect("parse");
    let changed = v
        .get("changedFields")
        .and_then(Value::as_array)
        .expect("changed fields");
    assert!(changed.iter().any(|f| f.as_str() == Some("status")));
    assert!(changed.iter().any(|f| f.as_str() == Some("labels")));

    let entities = state
        .db
        .read()
        .await
        .list_entities_for_project("p1")
        .expect("list entities");
    let props = &entities
        .iter()
        .find(|e| e.properties.get("taskKey").and_then(Value::as_str) == Some("P1A-1"))
        .expect("task")
        .properties;
    assert_eq!(
        props.get("status").and_then(Value::as_str),
        Some("In Progress")
    );
    assert_eq!(props.get("priority").and_then(Value::as_str), Some("High"));
    assert_eq!(
        props.get("createdBy").and_then(Value::as_str),
        Some("owner")
    );
    assert_eq!(props.get("updatedBy").and_then(Value::as_str), Some("u1"));
    let labels = props
        .get("labels")
        .and_then(Value::as_array)
        .expect("labels");
    assert_eq!(labels.first().and_then(Value::as_str), Some("mcp"));
}

#[tokio::test]
async fn update_task_tool_add_labels_preserves_existing() {
    let (_dir, state) = mk_state_with_project("p1", "P1A");
    state
        .db
        .read()
        .await
        .create_entity_for_project(
            "p1",
            Some("t1"),
            "task",
            serde_json::json!({"title": "Task 1", "labels": ["alpha", "beta"]})
                .as_object()
                .cloned()
                .unwrap_or_default(),
        )
        .expect("create task");
    let admin = mk_user(Role::Admin);
    let params = serde_json::json!({
        "name": "update_task",
        "arguments": {
            "taskKey": "P1A-1",
            "addLabels": ["gamma"]
        }
    });

    crate::mcp::tools::tools_call(&state, &admin, params)
        .await
        .expect("tools_call");

    let entities = state
        .db
        .read()
        .await
        .list_entities_for_project("p1")
        .expect("list entities");
    let labels = entities
        .iter()
        .find(|e| e.properties.get("taskKey").and_then(Value::as_str) == Some("P1A-1"))
        .expect("task")
        .properties
        .get("labels")
        .and_then(Value::as_array)
        .expect("labels");
    let label_strings: Vec<&str> = labels.iter().filter_map(Value::as_str).collect();
    assert_eq!(label_strings, vec!["alpha", "beta", "gamma"]);
}

#[tokio::test]
async fn update_task_tool_remove_labels_keeps_others() {
    let (_dir, state) = mk_state_with_project("p1", "P1A");
    state
        .db
        .read()
        .await
        .create_entity_for_project(
            "p1",
            Some("t1"),
            "task",
            serde_json::json!({"title": "Task 1", "labels": ["alpha", "beta", "gamma"]})
                .as_object()
                .cloned()
                .unwrap_or_default(),
        )
        .expect("create task");
    let admin = mk_user(Role::Admin);
    let params = serde_json::json!({
        "name": "update_task",
        "arguments": {
            "taskKey": "P1A-1",
            "removeLabels": ["beta"]
        }
    });

    crate::mcp::tools::tools_call(&state, &admin, params)
        .await
        .expect("tools_call");

    let entities = state
        .db
        .read()
        .await
        .list_entities_for_project("p1")
        .expect("list entities");
    let labels = entities
        .iter()
        .find(|e| e.properties.get("taskKey").and_then(Value::as_str) == Some("P1A-1"))
        .expect("task")
        .properties
        .get("labels")
        .and_then(Value::as_array)
        .expect("labels");
    let label_strings: Vec<&str> = labels.iter().filter_map(Value::as_str).collect();
    assert_eq!(label_strings, vec!["alpha", "gamma"]);
}

#[tokio::test]
async fn project_manifest_tools_list_dry_run_and_apply() {
    let (_dir, state) = mk_state_with_project("p1", "P1A");
    let admin = mk_user(Role::Admin);

    let list = crate::mcp::tools::tools_call(
        &state,
        &admin,
        serde_json::json!({ "name": "list_projects", "arguments": {} }),
    )
    .await
    .expect("list projects");
    let list_v: Value = serde_json::from_str(tool_content_text(&list)).expect("parse list");
    let projects = list_v
        .get("projects")
        .and_then(Value::as_array)
        .expect("projects");
    assert!(projects
        .iter()
        .any(|p| { p.get("projectKey").and_then(Value::as_str) == Some("P1A") }));

    let manifest = crate::mcp::tools::tools_call(
        &state,
        &admin,
        serde_json::json!({
            "name": "get_project_manifest",
            "arguments": { "projectKey": "P1A" }
        }),
    )
    .await
    .expect("get manifest");
    let manifest_v: Value =
        serde_json::from_str(tool_content_text(&manifest)).expect("parse manifest");
    let etag = manifest_v
        .get("etag")
        .and_then(Value::as_str)
        .expect("etag")
        .to_string();
    let mut next_manifest = default_manifest();
    next_manifest.name = "MCP Applied".to_string();

    let dry_run = crate::mcp::tools::tools_call(
        &state,
        &admin,
        serde_json::json!({
            "name": "apply_manifest",
            "arguments": {
                "projectKey": "P1A",
                "manifest": next_manifest,
                "dryRun": true
            }
        }),
    )
    .await
    .expect("dry run");
    let dry_v: Value = serde_json::from_str(tool_content_text(&dry_run)).expect("parse dry run");
    assert_eq!(dry_v.get("dryRun").and_then(Value::as_bool), Some(true));
    let next_manifest = dry_v.get("manifest").cloned().expect("normalized manifest");

    let applied = crate::mcp::tools::tools_call(
        &state,
        &admin,
        serde_json::json!({
            "name": "apply_manifest",
            "arguments": {
                "projectKey": "P1A",
                "manifest": next_manifest,
                "dryRun": false,
                "ifMatch": etag,
                "message": "Apply from MCP test"
            }
        }),
    )
    .await
    .expect("apply manifest");
    let applied_v: Value =
        serde_json::from_str(tool_content_text(&applied)).expect("parse applied");
    assert_eq!(
        applied_v.get("dryRun").and_then(Value::as_bool),
        Some(false)
    );

    let (stored, _) = state
        .db
        .read()
        .await
        .get_manifest_with_etag("p1")
        .expect("get stored manifest")
        .expect("manifest exists");
    assert_eq!(stored.name, "MCP Applied");
}

#[tokio::test]
async fn apply_manifest_requires_write_permission() {
    let (_dir, state) = mk_state_with_project("p1", "P1A");
    let viewer = mk_user(Role::Viewer);
    let params = serde_json::json!({
        "name": "apply_manifest",
        "arguments": {
            "projectKey": "P1A",
            "manifest": default_manifest(),
            "dryRun": true
        }
    });

    let err = crate::mcp::tools::tools_call(&state, &viewer, params)
        .await
        .expect_err("viewer should fail");
    assert!(format!("{err:#}").contains("insufficient permissions"));
}

#[tokio::test]
async fn apply_manifest_rejects_stale_if_match() {
    let (_dir, state) = mk_state_with_project("p1", "P1A");
    let admin = mk_user(Role::Admin);
    let params = serde_json::json!({
        "name": "apply_manifest",
        "arguments": {
            "projectKey": "P1A",
            "manifest": default_manifest(),
            "dryRun": false,
            "ifMatch": "stale-etag"
        }
    });

    let err = crate::mcp::tools::tools_call(&state, &admin, params)
        .await
        .expect_err("stale etag should fail");
    let msg = format!("{err:#}");
    assert!(msg.contains("conflict") || msg.contains("etag"));
}

#[tokio::test]
async fn create_wiki_page_tool_creates_page() {
    let (_dir, state) = mk_state_with_project("p1", "P1A");
    let admin = mk_user(Role::Admin);
    let params = serde_json::json!({
        "name": "create_wiki_page",
        "arguments": {
            "projectKey": "P1A",
            "title": "AI Investigation",
            "content": "# Results\n\n- Item 1"
        }
    });
    let result = crate::mcp::tools::tools_call(&state, &admin, params)
        .await
        .expect("tools_call");
    let content = result
        .get("content")
        .and_then(|c| c.as_array())
        .and_then(|a| a.first())
        .and_then(|c| c.get("text"))
        .and_then(|t| t.as_str())
        .expect("content text");
    let v: Value = serde_json::from_str(content).expect("parse");
    assert_eq!(
        v.get("title").and_then(|t| t.as_str()),
        Some("AI Investigation")
    );
    assert!(v.get("pageId").and_then(|i| i.as_str()).is_some());

    let entities = state
        .db
        .read()
        .await
        .list_entities_for_project("p1")
        .expect("list");
    let wiki: Vec<_> = entities
        .into_iter()
        .filter(|e| e.entity_id == "wikiPage")
        .collect();
    assert_eq!(wiki.len(), 1);
}

#[test]
fn tools_list_includes_update_wiki_page() {
    let tools = crate::mcp_http::protocol::tools_list_result();
    let names: Vec<&str> = tools
        .get("tools")
        .and_then(|t| t.as_array())
        .expect("tools array")
        .iter()
        .filter_map(|t| t.get("name").and_then(|n| n.as_str()))
        .collect();
    assert!(
        names.contains(&"update_wiki_page"),
        "tools/list should expose update_wiki_page: {names:?}"
    );
}

#[test]
fn tools_list_includes_list_wiki_pages() {
    let tools = crate::mcp_http::protocol::tools_list_result();
    let list = tools
        .get("tools")
        .and_then(|t| t.as_array())
        .expect("tools array");
    let names: Vec<&str> = list
        .iter()
        .filter_map(|t| t.get("name").and_then(|n| n.as_str()))
        .collect();
    assert!(
        names.contains(&"list_wiki_pages"),
        "tools/list should expose list_wiki_pages: {names:?}"
    );
    let tool = list
        .iter()
        .find(|t| t.get("name").and_then(|n| n.as_str()) == Some("list_wiki_pages"))
        .expect("list_wiki_pages tool");
    assert_eq!(
        tool.get("inputSchema")
            .and_then(|s| s.get("additionalProperties")),
        Some(&Value::Bool(false))
    );
}

#[tokio::test]
async fn list_wiki_pages_tool_returns_pages() {
    let (_dir, state) = mk_state_with_project("p1", "P1A");
    let admin = mk_user(Role::Admin);
    crate::mcp::tools::tools_call(
        &state,
        &admin,
        serde_json::json!({
            "name": "create_wiki_page",
            "arguments": {
                "projectKey": "P1A",
                "title": "Inventory note",
                "content": "# Body that must not appear in list output"
            }
        }),
    )
    .await
    .expect("create");

    let result = crate::mcp::tools::tools_call(
        &state,
        &admin,
        serde_json::json!({
            "name": "list_wiki_pages",
            "arguments": { "projectKey": "P1A", "limit": 50 }
        }),
    )
    .await
    .expect("list_wiki_pages");
    let content = tool_result_text(&result);
    assert!(
        !content.contains("Body that must not appear"),
        "list must omit page body: {content}"
    );
    let v: Value = serde_json::from_str(&content).expect("parse");
    assert_eq!(v.get("totalCount").and_then(|c| c.as_i64()), Some(1));
    let pages = v.get("pages").and_then(|p| p.as_array()).expect("pages");
    assert_eq!(pages.len(), 1);
    assert_eq!(
        pages[0].get("title").and_then(|t| t.as_str()),
        Some("Inventory note")
    );
    assert!(pages[0].get("id").and_then(|i| i.as_str()).is_some());
    assert!(pages[0].get("doc").is_none());
}

fn tool_result_text(result: &Value) -> String {
    result
        .get("content")
        .and_then(|c| c.as_array())
        .and_then(|a| a.first())
        .and_then(|c| c.get("text"))
        .and_then(|t| t.as_str())
        .expect("content text")
        .to_string()
}

// REQ-315 E2E: create -> update (replace) -> get must show the new body.
#[tokio::test]
async fn update_wiki_page_tool_replaces_page_body() {
    let (_dir, state) = mk_state_with_project("p1", "P1A");
    let admin = mk_user(Role::Admin);

    let created = crate::mcp::tools::tools_call(
        &state,
        &admin,
        serde_json::json!({
            "name": "create_wiki_page",
            "arguments": {
                "projectKey": "P1A",
                "title": "Progress",
                "content": "# Old\n\nfirst version"
            }
        }),
    )
    .await
    .expect("create");
    let created: Value = serde_json::from_str(&tool_result_text(&created)).expect("parse create");
    let page_id = created
        .get("pageId")
        .and_then(|i| i.as_str())
        .expect("pageId")
        .to_string();

    let updated = crate::mcp::tools::tools_call(
        &state,
        &admin,
        serde_json::json!({
            "name": "update_wiki_page",
            "arguments": {
                "projectKey": "P1A",
                "pageId": page_id,
                "content": "# New\n\nsecond version",
                "mode": "replace"
            }
        }),
    )
    .await
    .expect("update");
    let updated: Value = serde_json::from_str(&tool_result_text(&updated)).expect("parse update");
    assert_eq!(updated.get("mode").and_then(|m| m.as_str()), Some("replace"));

    let fetched = crate::mcp::tools::tools_call(
        &state,
        &admin,
        serde_json::json!({
            "name": "get_wiki_page",
            "arguments": { "projectKey": "P1A", "pageId": page_id }
        }),
    )
    .await
    .expect("get");
    let fetched: Value = serde_json::from_str(&tool_result_text(&fetched)).expect("parse get");
    let doc = fetched["page"]["doc"].as_str().expect("doc");
    let blocks: Vec<Value> = serde_json::from_str(doc).expect("doc json");
    assert_eq!(
        blocks[0].get("type").and_then(|v| v.as_str()),
        Some("heading")
    );
    assert!(doc.contains("second version"), "doc should be replaced: {doc}");
    assert!(!doc.contains("first version"), "old body must be gone: {doc}");
}

#[tokio::test]
async fn update_wiki_page_tool_appends_by_title() {
    let (_dir, state) = mk_state_with_project("p1", "P1A");
    let admin = mk_user(Role::Admin);

    crate::mcp::tools::tools_call(
        &state,
        &admin,
        serde_json::json!({
            "name": "create_wiki_page",
            "arguments": {
                "projectKey": "P1A",
                "title": "Progress",
                "content": "intro paragraph"
            }
        }),
    )
    .await
    .expect("create");

    crate::mcp::tools::tools_call(
        &state,
        &admin,
        serde_json::json!({
            "name": "update_wiki_page",
            "arguments": {
                "projectKey": "P1A",
                "wikiPageTitle": "Progress",
                "content": "## Update 1\n\nappended line",
                "mode": "append"
            }
        }),
    )
    .await
    .expect("append");

    let fetched = crate::mcp::tools::tools_call(
        &state,
        &admin,
        serde_json::json!({
            "name": "get_wiki_page",
            "arguments": { "projectKey": "P1A", "wikiPageTitle": "Progress" }
        }),
    )
    .await
    .expect("get");
    let fetched: Value = serde_json::from_str(&tool_result_text(&fetched)).expect("parse get");
    let doc = fetched["page"]["doc"].as_str().expect("doc");
    assert!(doc.contains("intro paragraph"), "existing body kept: {doc}");
    assert!(doc.contains("appended line"), "new content appended: {doc}");
}

#[tokio::test]
async fn update_wiki_page_tool_requires_write_permission() {
    let (_dir, state) = mk_state_with_project("p1", "P1A");
    let admin = mk_user(Role::Admin);
    let viewer = mk_user(Role::Viewer);

    crate::mcp::tools::tools_call(
        &state,
        &admin,
        serde_json::json!({
            "name": "create_wiki_page",
            "arguments": { "projectKey": "P1A", "title": "Progress", "content": "body" }
        }),
    )
    .await
    .expect("create");

    let err = crate::mcp::tools::tools_call(
        &state,
        &viewer,
        serde_json::json!({
            "name": "update_wiki_page",
            "arguments": {
                "projectKey": "P1A",
                "wikiPageTitle": "Progress",
                "content": "hacked"
            }
        }),
    )
    .await
    .expect_err("viewer should fail");
    assert!(format!("{err:#}").contains("insufficient permissions"));
}

#[tokio::test]
async fn post_mcp_initialize_authenticates_without_blocking_read_panic() {
    let (_dir, state) = mk_state_with_project("p1", "P1A");
    let token = crate::mcp_api_key::generate_plaintext_api_key();
    let token_hash = crate::mcp_api_key::hash_api_key(&token);

    {
        let db = state.db.read().await;
        let user = db
            .create_local_user("mcp@example.local", "admin", "pw")
            .expect("create user");
        db.upsert_user_mcp_api_key_hash(&user.id, &token_hash)
            .expect("store api key");
    }

    let mut headers = HeaderMap::new();
    headers.insert(
        header::AUTHORIZATION,
        format!("Bearer {token}")
            .parse()
            .expect("authorization header"),
    );

    let response = super::post_mcp(
        axum::extract::State(state),
        headers,
        Json(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {}
        })),
    )
    .await
    .expect("mcp initialize")
    .into_response();

    assert_eq!(response.status(), StatusCode::OK);
}
