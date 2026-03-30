use serde_json::{json, Value as JsonValue};
use std::sync::Arc;
use tokio::sync::RwLock;

use super::build_llm_error_message;
use super::tool_defs::build_tool_definitions;
use super::ToolCall;
use super::tool_exec::{
    get_current_datetime, get_project_manifest, get_task, list_projects, list_tasks, parse_tool_calls,
    search_projects, search_tasks,
};
use super::tool_exec_admin::execute_admin_tool;
use crate::app_state::{AppState, AuthConfig, LoginLimiter};
use crate::auth::{AuthedUser, Role};
use crate::db::Db;

fn tmp_db() -> (tempfile::TempDir, Db) {
    let dir = tempfile::tempdir().expect("create tempdir");
    let path = dir.path().join("ai_tools_test.sqlite3");
    let db = Db::new(path.to_string_lossy().as_ref()).expect("create db");
    (dir, db)
}

fn admin_user() -> AuthedUser {
    AuthedUser {
        user_id: "admin-1".to_string(),
        email: "admin@example.local".to_string(),
        role: Role::Admin,
        last_login_at: None,
        session_id: "session-1".to_string(),
    }
}

fn editor_user() -> AuthedUser {
    AuthedUser {
        user_id: "editor-1".to_string(),
        email: "editor@example.local".to_string(),
        role: Role::Editor,
        last_login_at: None,
        session_id: "session-2".to_string(),
    }
}

fn app_state(db: Db) -> AppState {
    AppState {
        db: Arc::new(RwLock::new(db)),
        db_path: "test.sqlite3".to_string(),
        service_gate: Arc::new(tokio::sync::RwLock::new(())),
        auth: AuthConfig::default(),
        login_limiter: Arc::new(LoginLimiter::new()),
        indexer_debounce: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
    }
}

#[test]
fn list_projects_returns_default() {
    let (_dir, db) = tmp_db();
    let state = app_state(db);
    let user = admin_user();

    let raw = list_projects(&state, &user).expect("list projects");
    let parsed: JsonValue = serde_json::from_str(&raw).expect("parse json");
    let projects = parsed.get("projects").and_then(|v| v.as_array());
    assert!(projects.map(|p| !p.is_empty()).unwrap_or(false), "projects should not be empty");
}

#[test]
fn search_projects_matches_name() {
    let (_dir, db) = tmp_db();
    let state = app_state(db);
    let user = admin_user();

    let raw = search_projects(&state, &user, &json!({ "query": "Default" })).expect("search projects");
    let parsed: JsonValue = serde_json::from_str(&raw).expect("parse json");
    let projects = parsed.get("projects").and_then(|v| v.as_array());
    assert!(projects.map(|p| !p.is_empty()).unwrap_or(false), "search should match default project");
}

#[test]
fn get_project_manifest_returns_manifest() {
    let (_dir, db) = tmp_db();
    let state = app_state(db);
    let user = admin_user();

    let raw = get_project_manifest(&state, &user, &json!({ "projectId": "default" })).expect("get manifest");
    let parsed: JsonValue = serde_json::from_str(&raw).expect("parse json");
    let manifest = parsed.get("manifest");
    assert!(manifest.is_some(), "manifest should exist");
}

#[test]
fn get_current_datetime_returns_iso_and_timestamp() {
    let raw = get_current_datetime().expect("get_current_datetime");
    let parsed: JsonValue = serde_json::from_str(&raw).expect("parse json");
    assert!(parsed.get("iso8601").and_then(|v| v.as_str()).is_some());
    assert!(parsed.get("rfc2822").and_then(|v| v.as_str()).is_some());
    assert!(parsed.get("timestampMs").and_then(|v| v.as_i64()).is_some());
}

#[test]
fn parse_tool_calls_reads_name_and_arguments() {
    let message = json!({
        "tool_calls": [
            {
                "id": "call-1",
                "function": {
                    "name": "search_projects",
                    "arguments": "{\"query\":\"alpha\"}"
                }
            },
            {
                "id": "call-2",
                "function": {
                    "name": "get_project_manifest",
                    "arguments": "{\"projectId\":\"p1\"}"
                }
            }
        ]
    });

    let calls = parse_tool_calls(&message);
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].id, "call-1");
    assert_eq!(calls[0].name, "search_projects");
    assert_eq!(
        calls[0].arguments.get("query").and_then(|v| v.as_str()),
        Some("alpha")
    );
    assert_eq!(calls[1].id, "call-2");
    assert_eq!(calls[1].name, "get_project_manifest");
    assert_eq!(
        calls[1].arguments.get("projectId").and_then(|v| v.as_str()),
        Some("p1")
    );
}

#[test]
fn build_tool_definitions_includes_admin_tools_when_admin_and_empty_project() {
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
    assert!(names.contains(&"list_users".to_string()), "should include list_users");
    assert!(names.contains(&"list_groups".to_string()), "should include list_groups");
    assert!(names.contains(&"list_tasks".to_string()), "should include list_tasks");
    assert!(names.contains(&"search_tasks".to_string()), "should include search_tasks");
    assert!(names.contains(&"get_task".to_string()), "should include get_task");
    assert!(
        names.contains(&"get_project_policy".to_string()),
        "should include get_project_policy for admin"
    );
    assert!(
        names.contains(&"grant_project_user_access".to_string()),
        "should include grant_project_user_access for admin"
    );
}

#[test]
fn build_tool_definitions_includes_admin_tools_when_force_include_admin() {
    let user = admin_user();
    let tools = build_tool_definitions(&user, Some("proj-1"), true);
    let names: Vec<String> = tools
        .iter()
        .filter_map(|t| {
            t.get("function")
                .and_then(|f| f.get("name"))
                .and_then(|n| n.as_str())
                .map(String::from)
        })
        .collect();
    assert!(names.contains(&"list_users".to_string()), "should include list_users when force_include_admin");
}

#[test]
fn build_tool_definitions_excludes_full_admin_tools_when_project_set_but_includes_policy_tools() {
    let user = admin_user();
    let tools = build_tool_definitions(&user, Some("proj-1"), false);
    let names: Vec<String> = tools
        .iter()
        .filter_map(|t| {
            t.get("function")
                .and_then(|f| f.get("name"))
                .and_then(|n| n.as_str())
                .map(String::from)
        })
        .collect();
    assert!(!names.contains(&"list_users".to_string()), "should not include list_users when project set");
    assert!(
        names.contains(&"get_project_policy".to_string()),
        "should include get_project_policy when project set"
    );
    assert!(
        names.contains(&"grant_project_user_access".to_string()),
        "should include grant_project_user_access when project set"
    );
}

#[test]
fn build_tool_definitions_excludes_admin_tools_when_not_admin() {
    let user = editor_user();
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
    assert!(!names.contains(&"list_users".to_string()), "should not include list_users for non-admin");
    assert!(
        !names.contains(&"grant_project_user_access".to_string()),
        "should not include grant_project_user_access for non-admin"
    );
}

#[test]
fn list_users_returns_users() {
    let (_dir, db) = tmp_db();
    let state = app_state(db);
    let user = admin_user();

    let call = ToolCall {
        id: "call-1".to_string(),
        name: "list_users".to_string(),
        arguments: json!({}),
    };
    let raw = execute_admin_tool(&state, &user, &call).expect("list_users");
    let parsed: JsonValue = serde_json::from_str(&raw).expect("parse json");
    let users = parsed.get("users").and_then(|v| v.as_array());
    assert!(users.is_some(), "should return users array");
}

#[test]
fn list_users_as_non_admin_fails() {
    let (_dir, db) = tmp_db();
    let state = app_state(db);
    let user = editor_user();

    let call = ToolCall {
        id: "call-1".to_string(),
        name: "list_users".to_string(),
        arguments: json!({}),
    };
    let result = execute_admin_tool(&state, &user, &call);
    assert!(result.is_err(), "non-admin should get error");
}

#[test]
fn list_users_inactive_only_filters() {
    let (_dir, db) = tmp_db();
    let state = app_state(db);
    let user = admin_user();

    let call = ToolCall {
        id: "call-1".to_string(),
        name: "list_users".to_string(),
        arguments: json!({ "inactiveOnly": true }),
    };
    let raw = execute_admin_tool(&state, &user, &call).expect("list_users");
    let parsed: JsonValue = serde_json::from_str(&raw).expect("parse json");
    let empty: Vec<JsonValue> = vec![];
    let users = parsed.get("users").and_then(|v| v.as_array()).unwrap_or(&empty);
    assert!(users.is_empty(), "fresh db has no disabled users");
}

#[test]
fn get_user_returns_user_with_last_login_at() {
    let (_dir, db) = tmp_db();
    let created = db
        .create_local_user("get-user-test@example.local", "editor", "dummy_hash")
        .expect("create user");
    let state = app_state(db);
    let actor = admin_user();

    let call = ToolCall {
        id: "call-1".to_string(),
        name: "get_user".to_string(),
        arguments: json!({ "userId": created.id }),
    };
    let raw = execute_admin_tool(&state, &actor, &call).expect("get_user");
    let parsed: JsonValue = serde_json::from_str(&raw).expect("parse json");
    let user_obj = parsed.get("user");
    assert!(user_obj.is_some(), "should return user");
    assert!(user_obj.and_then(|u| u.get("lastLoginAt")).is_some(), "should include lastLoginAt");
    assert_eq!(
        user_obj.and_then(|u| u.get("email")).and_then(|v| v.as_str()),
        Some("get-user-test@example.local")
    );
}

#[test]
fn get_user_not_found_returns_error() {
    let (_dir, db) = tmp_db();
    let state = app_state(db);
    let user = admin_user();

    let call = ToolCall {
        id: "call-1".to_string(),
        name: "get_user".to_string(),
        arguments: json!({ "userId": "non-existent-user-id" }),
    };
    let raw = execute_admin_tool(&state, &user, &call).expect("get_user");
    let parsed: JsonValue = serde_json::from_str(&raw).expect("parse json");
    assert_eq!(parsed.get("error").and_then(|v| v.as_str()), Some("user not found"));
}

#[test]
fn add_member_to_group_group_not_found_returns_error() {
    let (_dir, db) = tmp_db();
    let created = db
        .create_local_user("add-member-test@example.local", "editor", "dummy_hash")
        .expect("create user");
    let state = app_state(db);
    let actor = admin_user();

    let call = ToolCall {
        id: "call-1".to_string(),
        name: "add_member_to_group".to_string(),
        arguments: json!({ "groupId": "non-existent-group", "userId": created.id }),
    };
    let raw = execute_admin_tool(&state, &actor, &call).expect("add_member_to_group");
    let parsed: JsonValue = serde_json::from_str(&raw).expect("parse json");
    assert_eq!(parsed.get("error").and_then(|v| v.as_str()), Some("group not found"));
}

#[test]
fn add_member_to_group_user_not_found_returns_error() {
    let (_dir, db) = tmp_db();
    let group_id = db.create_user_group("Test Group", None).expect("create group");
    let state = app_state(db);
    let actor = admin_user();

    let call = ToolCall {
        id: "call-1".to_string(),
        name: "add_member_to_group".to_string(),
        arguments: json!({ "groupId": group_id, "userId": "non-existent-user" }),
    };
    let raw = execute_admin_tool(&state, &actor, &call).expect("add_member_to_group");
    let parsed: JsonValue = serde_json::from_str(&raw).expect("parse json");
    assert_eq!(parsed.get("error").and_then(|v| v.as_str()), Some("user not found"));
}

#[test]
fn list_groups_returns_groups() {
    let (_dir, db) = tmp_db();
    let state = app_state(db);
    let user = admin_user();

    let call = ToolCall {
        id: "call-1".to_string(),
        name: "list_groups".to_string(),
        arguments: json!({}),
    };
    let raw = execute_admin_tool(&state, &user, &call).expect("list_groups");
    let parsed: JsonValue = serde_json::from_str(&raw).expect("parse json");
    let groups = parsed.get("groups").and_then(|v| v.as_array());
    assert!(groups.is_some(), "should return groups array");
}

#[test]
fn list_tasks_returns_tasks() {
    let (_dir, db) = tmp_db();
    let project = crate::models::Project {
        id: "p1".to_string(),
        name: "P1".to_string(),
        project_key: Some("P1A".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![],
        config: crate::models::ProjectConfig {
            manifest: crate::defaults::default_manifest(),
        },
    };
    db.replace_project_state(project).expect("replace");
    db.create_entity_for_project(
        "p1",
        Some("t1"),
        "task",
        serde_json::json!({"title": "Task 1"}).as_object().cloned().unwrap_or_default(),
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
    let project = crate::models::Project {
        id: "p1".to_string(),
        name: "P1".to_string(),
        project_key: Some("P1A".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![],
        config: crate::models::ProjectConfig {
            manifest: crate::defaults::default_manifest(),
        },
    };
    db.replace_project_state(project).expect("replace");
    db.create_entity_for_project(
        "p1",
        Some("t1"),
        "task",
        serde_json::json!({"title": "My Task", "status": "Todo"}).as_object().cloned().unwrap_or_default(),
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
    let project = crate::models::Project {
        id: "p1".to_string(),
        name: "P1".to_string(),
        project_key: Some("P1A".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![],
        config: crate::models::ProjectConfig {
            manifest: crate::defaults::default_manifest(),
        },
    };
    db.replace_project_state(project).expect("replace");
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
    assert_eq!(task.get("title").and_then(|v| v.as_str()), Some("Alias Task"));
}

#[test]
fn search_tasks_property_filter_allows_limit_above_twenty() {
    let (_dir, db) = tmp_db();
    let project = crate::models::Project {
        id: "p1".to_string(),
        name: "P1".to_string(),
        project_key: Some("REL".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![],
        config: crate::models::ProjectConfig {
            manifest: crate::defaults::default_manifest(),
        },
    };
    db.replace_project_state(project).expect("replace");
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
    let results = parsed.get("results").and_then(|r| r.as_array()).expect("results");
    assert_eq!(results.len(), 25, "property-filtered search should return all labeled tasks up to limit");
}

#[test]
fn grant_project_user_access_sets_write_then_none_removes() {
    let (_dir, db) = tmp_db();
    let project = crate::models::Project {
        id: "p-access".to_string(),
        name: "AccessProj".to_string(),
        project_key: Some("ACC".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![],
        config: crate::models::ProjectConfig {
            manifest: crate::defaults::default_manifest(),
        },
    };
    db.replace_project_state(project).expect("replace");
    let created = db
        .create_local_user("grant-access-test@example.local", "editor", "dummy_hash")
        .expect("create user");
    let state = app_state(db);
    let actor = admin_user();

    let grant = ToolCall {
        id: "call-1".to_string(),
        name: "grant_project_user_access".to_string(),
        arguments: json!({
            "projectKey": "ACC",
            "email": "grant-access-test@example.local",
            "permission": "write"
        }),
    };
    let raw = execute_admin_tool(&state, &actor, &grant).expect("grant");
    let parsed: JsonValue = serde_json::from_str(&raw).expect("parse");
    assert_eq!(parsed.get("ok").and_then(|v| v.as_bool()), Some(true));

    let get_pol = ToolCall {
        id: "call-2".to_string(),
        name: "get_project_policy".to_string(),
        arguments: json!({ "projectId": "p-access" }),
    };
    let raw_pol = execute_admin_tool(&state, &actor, &get_pol).expect("get policy");
    let pol: crate::models::ProjectPolicy = serde_json::from_str(&raw_pol).expect("policy json");
    assert_eq!(
        pol.project_defaults.users.get(&created.id).copied(),
        Some(crate::models::Permission::Write)
    );

    let revoke = ToolCall {
        id: "call-3".to_string(),
        name: "grant_project_user_access".to_string(),
        arguments: json!({
            "projectId": "p-access",
            "userId": created.id,
            "permission": "none"
        }),
    };
    let raw_rev = execute_admin_tool(&state, &actor, &revoke).expect("revoke");
    let parsed_rev: JsonValue = serde_json::from_str(&raw_rev).expect("parse revoke");
    assert_eq!(parsed_rev.get("ok").and_then(|v| v.as_bool()), Some(true));

    let raw_pol2 = execute_admin_tool(&state, &actor, &get_pol).expect("get policy 2");
    let pol2: crate::models::ProjectPolicy = serde_json::from_str(&raw_pol2).expect("policy json 2");
    assert!(!pol2.project_defaults.users.contains_key(&created.id));
}

#[test]
fn build_llm_error_message_401_with_openrouter_json_includes_api_key_hint() {
    let body = r#"{"error":{"message":"Invalid API key"}}"#;
    let msg = build_llm_error_message(401, body);
    assert!(msg.contains("Invalid API key"), "should mention API key");
    assert!(msg.contains("LLM settings"), "should hint at settings");
    assert!(msg.contains("Details:"), "should include provider details");
}

#[test]
fn build_llm_error_message_401_empty_body_returns_base_only() {
    let msg = build_llm_error_message(401, "");
    assert_eq!(msg, "Invalid API key. Please check your API key in LLM settings.");
}

#[test]
fn build_llm_error_message_429_returns_rate_limit() {
    let body = r#"{"error":{"message":"Rate limit exceeded"}}"#;
    let msg = build_llm_error_message(429, body);
    assert!(msg.contains("Rate limit exceeded"));
    assert!(msg.contains("try again later"));
}

#[test]
fn build_llm_error_message_invalid_json_returns_base_only() {
    let msg = build_llm_error_message(401, "not valid json");
    assert_eq!(msg, "Invalid API key. Please check your API key in LLM settings.");
}

#[test]
fn build_llm_error_message_500_returns_generic() {
    let msg = build_llm_error_message(500, "");
    assert_eq!(msg, "LLM provider error (HTTP 500).");
}
