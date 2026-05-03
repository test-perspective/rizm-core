//! OpenAI-style tool / function definitions for the AI assistant.
//!
//! Split by audience:
//!   - `project`        : tools available to any authenticated user
//!   - `project_policy` : project-access management (admin)
//!   - `admin`          : user / group management (admin)

use serde_json::Value;

use crate::auth::{AuthedUser, Role};

mod admin;
mod project;
mod project_policy;

pub(super) fn build_tool_definitions(
    user: &AuthedUser,
    project_id: Option<&str>,
    force_include_admin: bool,
) -> Vec<Value> {
    let mut tools = project::project_tools();
    if user.role == Role::Admin {
        tools.extend(project_policy::project_policy_tools());
    }
    let include_admin = user.role == Role::Admin
        && (force_include_admin || project_id.map(|s| s.trim().is_empty()).unwrap_or(true));
    if include_admin {
        tools.extend(admin::admin_tools());
    }
    tools
}
