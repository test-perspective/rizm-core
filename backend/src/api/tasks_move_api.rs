//! Move tasks to another project (REQ-309).
//!
//! A single task and a bulk selection go through the same route: the request
//! always carries a list, and the destination is resolved by id or by project key.

use axum::{
    extract::{Path, State},
    routing::post,
    Extension, Json, Router,
};
use serde::Deserialize;

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::mcp::task_wiki::{move_tasks, TaskMoveInput, TaskMoveResult};
use crate::ApiError;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MoveTasksRequest {
    #[serde(default)]
    destination_project_id: Option<String>,
    #[serde(default)]
    destination_project_key: Option<String>,
    /// Entity ids, as the UI already has them.
    #[serde(default)]
    task_ids: Vec<String>,
    /// Task keys, for callers that only know those.
    #[serde(default)]
    task_keys: Vec<String>,
}

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/api/projects/:project_id/tasks/move",
        post(move_tasks_handler),
    )
}

async fn move_tasks_handler(
    State(state): State<AppState>,
    Path(source_project_id): Path<String>,
    Extension(user): Extension<AuthedUser>,
    Json(req): Json<MoveTasksRequest>,
) -> Result<Json<TaskMoveResult>, ApiError> {
    if req.destination_project_id.is_none() && req.destination_project_key.is_none() {
        return Err(ApiError::bad_request(
            "destinationProjectId or destinationProjectKey is required",
        ));
    }
    if req.task_ids.is_empty() && req.task_keys.is_empty() {
        return Err(ApiError::bad_request("taskIds or taskKeys is required"));
    }

    let input = TaskMoveInput {
        source_project_id: Some(source_project_id),
        task_ids: req.task_ids,
        task_keys: req.task_keys,
        destination_project_key: req.destination_project_key,
        destination_project_id: req.destination_project_id,
    };

    // The use case reads the DB with `blocking_read`, which must not run on an
    // async worker thread (same reason as `mcp::tools::tools_call`).
    let result = tokio::task::spawn_blocking(move || move_tasks(&state, &user, input))
        .await
        .map_err(|e| {
            tracing::error!(error = ?e, "task move worker failed");
            ApiError::internal()
        })?;

    result.map(Json).map_err(map_move_error)
}

/// The use case reports failures as `anyhow` messages; translate the ones the
/// client can act on into their own status codes.
fn map_move_error(e: anyhow::Error) -> ApiError {
    let msg = e.to_string();
    if msg.contains("insufficient permissions") {
        return ApiError::forbidden(msg);
    }
    if msg.contains("was modified by someone else") || msg.contains("conflict") {
        return ApiError::conflict(msg);
    }
    if msg.contains("not found") {
        return ApiError::not_found(msg);
    }
    if msg.contains("must differ")
        || msg.contains("no tasks selected")
        || msg.contains("same project")
        || msg.contains("too many tasks")
        || msg.contains("has no taskKey")
        || msg.contains("invalid taskKey")
        || msg.contains("projectKey")
        || msg.contains("is required")
    {
        return ApiError::bad_request(msg);
    }
    tracing::error!(error = %e, "task move failed");
    ApiError::internal()
}

#[cfg(test)]
mod tests;
