use serde_json::{json, Value as JsonValue};

use super::{admin_user, app_state, tmp_db};
use crate::ai_tools::tool_exec_admin::execute_admin_tool;
use crate::ai_tools::ToolCall;

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
