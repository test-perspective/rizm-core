use super::{admin_user, editor_user};
use crate::ai_tools::tool_defs::build_tool_definitions;

fn tool_names(tools: &[serde_json::Value]) -> Vec<String> {
    tools
        .iter()
        .filter_map(|t| {
            t.get("function")
                .and_then(|f| f.get("name"))
                .and_then(|n| n.as_str())
                .map(String::from)
        })
        .collect()
}

#[test]
fn build_tool_definitions_includes_admin_tools_when_admin_and_empty_project() {
    let user = admin_user();
    let tools = build_tool_definitions(&user, None, false);
    let names = tool_names(&tools);
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
    let names = tool_names(&tools);
    assert!(names.contains(&"list_users".to_string()), "should include list_users when force_include_admin");
}

#[test]
fn build_tool_definitions_excludes_full_admin_tools_when_project_set_but_includes_policy_tools() {
    let user = admin_user();
    let tools = build_tool_definitions(&user, Some("proj-1"), false);
    let names = tool_names(&tools);
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
    let names = tool_names(&tools);
    assert!(!names.contains(&"list_users".to_string()), "should not include list_users for non-admin");
    assert!(
        !names.contains(&"grant_project_user_access".to_string()),
        "should not include grant_project_user_access for non-admin"
    );
}
