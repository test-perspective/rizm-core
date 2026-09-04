//! Task create/update tool execution for AIA.

use serde_json::Value;

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::mcp::task_wiki::{
    create_task_for_user, update_task_for_user, TaskCreateInput, TaskUpdateInput,
};
use crate::ApiError;

pub(super) fn create_task(
    state: &AppState,
    user: &AuthedUser,
    args: &Value,
) -> Result<String, ApiError> {
    let input = TaskCreateInput::from_mcp_args(args)
        .map_err(|e| ApiError::bad_request(format!("{e:#}")))?;
    create_task_for_user(state, user, input).map_err(|e| ApiError::bad_request(format!("{e:#}")))
}

pub(super) fn update_task(
    state: &AppState,
    user: &AuthedUser,
    args: &Value,
) -> Result<String, ApiError> {
    let input = TaskUpdateInput::from_mcp_args(args)
        .map_err(|e| ApiError::bad_request(format!("{e:#}")))?;
    update_task_for_user(state, user, input).map_err(|e| ApiError::bad_request(format!("{e:#}")))
}
