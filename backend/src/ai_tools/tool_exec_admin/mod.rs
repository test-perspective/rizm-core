//! Admin tool execution for user and group management.
//! Admin user/group tools are included when project context is empty (or force_include_admin).
//! Project policy tools are always available to admins (see build_tool_definitions).

mod tool_exec_admin_groups;
mod tool_exec_admin_policy;
mod tool_exec_admin_users;

use serde_json::json;

use crate::admin::ensure_admin;
use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::ApiError;

use super::ToolCall;

pub(super) fn execute_admin_tool(
    state: &AppState,
    user: &AuthedUser,
    call: &ToolCall,
) -> Result<String, ApiError> {
    ensure_admin(user)?;
    match call.name.as_str() {
        "list_users" => tool_exec_admin_users::list_users(state, &call.arguments),
        "get_user" => tool_exec_admin_users::get_user(state, &call.arguments),
        "bulk_delete_users" => tool_exec_admin_users::bulk_delete_users(state, user, &call.arguments),
        "create_user" => tool_exec_admin_users::create_user(state, user, &call.arguments),
        "update_user" => tool_exec_admin_users::update_user(state, user, &call.arguments),
        "reset_password" => tool_exec_admin_users::reset_password(state, user, &call.arguments),
        "list_groups" => tool_exec_admin_groups::list_groups(state, &call.arguments),
        "create_group" => tool_exec_admin_groups::create_group(state, &call.arguments),
        "update_group" => tool_exec_admin_groups::update_group(state, &call.arguments),
        "delete_group" => tool_exec_admin_groups::delete_group(state, &call.arguments),
        "add_member_to_group" => tool_exec_admin_groups::add_member_to_group(state, &call.arguments),
        "remove_member_from_group" => tool_exec_admin_groups::remove_member_from_group(state, &call.arguments),
        "get_group_members" => tool_exec_admin_groups::get_group_members(state, &call.arguments),
        "get_user_groups" => tool_exec_admin_groups::get_user_groups(state, &call.arguments),
        "get_project_policy" => tool_exec_admin_policy::get_project_policy(state, user, &call.arguments),
        "grant_project_user_access" => tool_exec_admin_policy::grant_project_user_access(state, user, &call.arguments),
        _ => Ok(json!({ "error": "unknown admin tool" }).to_string()),
    }
}
