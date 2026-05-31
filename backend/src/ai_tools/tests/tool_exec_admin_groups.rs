use serde_json::{json, Value as JsonValue};

use super::{admin_user, app_state, tmp_db};
use crate::ai_tools::tool_exec_admin::execute_admin_tool;
use crate::ai_tools::ToolCall;

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
    assert_eq!(
        parsed.get("error").and_then(|v| v.as_str()),
        Some("group not found")
    );
}

#[test]
fn add_member_to_group_user_not_found_returns_error() {
    let (_dir, db) = tmp_db();
    let group_id = db
        .create_user_group("Test Group", None)
        .expect("create group");
    let state = app_state(db);
    let actor = admin_user();

    let call = ToolCall {
        id: "call-1".to_string(),
        name: "add_member_to_group".to_string(),
        arguments: json!({ "groupId": group_id, "userId": "non-existent-user" }),
    };
    let raw = execute_admin_tool(&state, &actor, &call).expect("add_member_to_group");
    let parsed: JsonValue = serde_json::from_str(&raw).expect("parse json");
    assert_eq!(
        parsed.get("error").and_then(|v| v.as_str()),
        Some("user not found")
    );
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
