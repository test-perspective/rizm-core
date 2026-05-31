use serde_json::{json, Value as JsonValue};

use super::{admin_user, app_state, editor_user, tmp_db};
use crate::ai_tools::tool_exec_admin::execute_admin_tool;
use crate::ai_tools::ToolCall;

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
    let users = parsed
        .get("users")
        .and_then(|v| v.as_array())
        .unwrap_or(&empty);
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
    assert!(
        user_obj.and_then(|u| u.get("lastLoginAt")).is_some(),
        "should include lastLoginAt"
    );
    assert_eq!(
        user_obj
            .and_then(|u| u.get("email"))
            .and_then(|v| v.as_str()),
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
    assert_eq!(
        parsed.get("error").and_then(|v| v.as_str()),
        Some("user not found")
    );
}
