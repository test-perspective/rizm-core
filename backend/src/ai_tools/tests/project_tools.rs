use serde_json::{json, Value as JsonValue};

use super::{admin_user, app_state, tmp_db};
use crate::ai_tools::tool_exec::{
    get_current_datetime, get_project_manifest, list_projects, parse_tool_calls, search_projects,
};

#[test]
fn list_projects_returns_default() {
    let (_dir, db) = tmp_db();
    let state = app_state(db);
    let user = admin_user();

    let raw = list_projects(&state, &user).expect("list projects");
    let parsed: JsonValue = serde_json::from_str(&raw).expect("parse json");
    let projects = parsed.get("projects").and_then(|v| v.as_array());
    assert!(
        projects.map(|p| !p.is_empty()).unwrap_or(false),
        "projects should not be empty"
    );
}

#[test]
fn search_projects_matches_name() {
    let (_dir, db) = tmp_db();
    let state = app_state(db);
    let user = admin_user();

    let raw =
        search_projects(&state, &user, &json!({ "query": "Default" })).expect("search projects");
    let parsed: JsonValue = serde_json::from_str(&raw).expect("parse json");
    let projects = parsed.get("projects").and_then(|v| v.as_array());
    assert!(
        projects.map(|p| !p.is_empty()).unwrap_or(false),
        "search should match default project"
    );
}

#[test]
fn get_project_manifest_returns_manifest() {
    let (_dir, db) = tmp_db();
    let state = app_state(db);
    let user = admin_user();

    let raw = get_project_manifest(&state, &user, &json!({ "projectId": "default" }))
        .expect("get manifest");
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
