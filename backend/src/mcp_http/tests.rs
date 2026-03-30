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
    assert_eq!(arr[2].get("type").and_then(Value::as_str), Some("bulletListItem"));
    assert_eq!(arr[3].get("type").and_then(Value::as_str), Some("paragraph"));
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

    let content0 = arr[0].get("content").and_then(Value::as_array).expect("content");
    assert!(content0.len() >= 3);
    let bold_segments: Vec<_> = content0
        .iter()
        .filter(|c| c.get("styles").and_then(|s| s.get("bold")).and_then(Value::as_bool) == Some(true))
        .collect();
    assert_eq!(bold_segments.len(), 2);
    assert_eq!(bold_segments[0].get("text").and_then(Value::as_str), Some("REQ"));
    assert_eq!(bold_segments[1].get("text").and_then(Value::as_str), Some("28"));

    let content1 = arr[1].get("content").and_then(Value::as_array).expect("content");
    let italic_segments: Vec<_> = content1
        .iter()
        .filter(|c| c.get("styles").and_then(|s| s.get("italic")).and_then(Value::as_bool) == Some(true))
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
    assert_eq!(arr[0].get("type").and_then(Value::as_str), Some("bulletListItem"));
    let content = arr[0].get("content").and_then(Value::as_array).expect("content");
    let bold_segments: Vec<_> = content
        .iter()
        .filter(|c| c.get("styles").and_then(|s| s.get("bold")).and_then(Value::as_bool) == Some(true))
        .collect();
    assert_eq!(bold_segments.len(), 1);
    assert_eq!(bold_segments[0].get("text").and_then(Value::as_str), Some("create_wiki_page"));
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
    let err = crate::mcp::tools::add_comment_for_target(&state, &viewer, &args).expect_err("should fail");
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
    let msg = crate::mcp::tools::add_comment_for_target(&state, &admin, &args).expect("add comment");
    assert!(msg.contains("comment added"));

    let props =
        crate::mcp::tools::read_entity_by_task_key_for_user(&state, &admin, "P1A-1").expect("read entity");
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
    let result = crate::mcp::task_wiki::list_tasks_for_user(
        &state,
        &admin,
        Some("P1A"),
        None,
        10,
    )
    .expect("list_tasks");
    let v: Value = serde_json::from_str(&result).expect("parse");
    let tasks = v.get("tasks").and_then(|t| t.as_array()).expect("tasks");
    assert!(!tasks.is_empty());
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
    let result = crate::mcp::tools::tools_call(
        &state,
        &admin,
        params,
    )
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
    assert_eq!(v.get("title").and_then(|t| t.as_str()), Some("AI Investigation"));
    assert!(v.get("pageId").and_then(|i| i.as_str()).is_some());

    let entities = state
        .db
        .read()
        .await
        .list_entities_for_project("p1")
        .expect("list");
    let wiki: Vec<_> = entities.into_iter().filter(|e| e.entity_id == "wikiPage").collect();
    assert_eq!(wiki.len(), 1);
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
        format!("Bearer {token}").parse().expect("authorization header"),
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
