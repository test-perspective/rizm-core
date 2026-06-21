//! Task create/update tool execution for AIA.

use serde_json::Value;

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::mcp::jsonrpc::{read_string_arg, read_string_array_arg};
use crate::ApiError;

pub(super) fn create_task(
    state: &AppState,
    user: &AuthedUser,
    args: &Value,
) -> Result<String, ApiError> {
    let project_key = read_string_arg(args, &["projectKey", "project_key"]);
    let project_id = read_string_arg(args, &["projectId", "project_id"]);
    let title = read_string_arg(args, &["title"]).ok_or_else(|| ApiError::bad_request("title is required"))?;
    let description = read_string_arg(args, &["description", "body", "content"]);
    let status = read_string_arg(args, &["status"]);
    let priority = read_string_arg(args, &["priority"]);
    let labels = read_string_array_arg(args, &["labels"]);
    let task_key = read_string_arg(args, &["taskKey", "task_key"]);

    crate::mcp::task_wiki::create_task_for_user(
        state,
        user,
        project_key.as_deref(),
        project_id.as_deref(),
        &title,
        description.as_deref(),
        status.as_deref(),
        priority.as_deref(),
        labels.as_deref(),
        task_key.as_deref(),
    )
    .map_err(|e| ApiError::bad_request(format!("{e:#}")))
}

pub(super) fn update_task(
    state: &AppState,
    user: &AuthedUser,
    args: &Value,
) -> Result<String, ApiError> {
    let task_key = read_string_arg(args, &["taskKey", "task_key", "entity_id", "entityId"])
        .ok_or_else(|| ApiError::bad_request("taskKey is required"))?;
    let title = read_string_arg(args, &["title"]);
    let description = read_string_arg(args, &["description", "body", "content"]);
    let status = read_string_arg(args, &["status"]);
    let priority = read_string_arg(args, &["priority"]);
    let labels = read_string_array_arg(args, &["labels"]);
    let add_labels = read_string_array_arg(args, &["addLabels", "add_labels"]);
    let remove_labels = read_string_array_arg(args, &["removeLabels", "remove_labels"]);
    let patch = args.get("patch").and_then(Value::as_object);

    crate::mcp::task_wiki::update_task_for_user(
        state,
        user,
        &task_key,
        title.as_deref(),
        description.as_deref(),
        status.as_deref(),
        priority.as_deref(),
        labels.as_deref(),
        add_labels.as_deref(),
        remove_labels.as_deref(),
        patch,
    )
    .map_err(|e| ApiError::bad_request(format!("{e:#}")))
}
