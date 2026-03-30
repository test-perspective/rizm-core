use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::models::{PolicyDefaults, ProjectPolicy};
use std::collections::HashMap;
use crate::ApiError;
use crate::permissions::{can_read, can_write};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GroupResponse {
    id: String,
    name: String,
    description: Option<String>,
    created_at: i64,
    updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateGroupRequest {
    name: String,
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateGroupRequest {
    name: String,
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddMemberRequest {
    user_id: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/permissions/groups", get(list_groups).post(create_group))
        .route("/api/permissions/groups/:id", get(get_group).put(update_group).delete(delete_group))
        .route("/api/permissions/groups/:id/members", get(get_group_members).post(add_member))
        .route("/api/permissions/groups/:id/members/:user_id", delete(remove_member))
        .route("/api/projects/:project_id/policy", get(get_project_policy).put(update_project_policy))
        .route("/api/permissions/check", get(check_permission))
}

async fn list_groups(State(state): State<AppState>, Extension(user): Extension<AuthedUser>) -> Result<impl IntoResponse, ApiError> {
    // Only admins can list groups
    if user.role != crate::auth::Role::Admin {
        return Err(ApiError::forbidden("admin only"));
    }

    let groups = (state.db.read().await).list_user_groups().map_err(|_| ApiError::internal())?;
    let responses: Vec<GroupResponse> = groups
        .into_iter()
        .map(|g| GroupResponse {
            id: g.id,
            name: g.name,
            description: g.description,
            created_at: g.created_at,
            updated_at: g.updated_at,
        })
        .collect();

    Ok(Json(responses))
}

async fn get_group(State(state): State<AppState>, Path(id): Path<String>, Extension(user): Extension<AuthedUser>) -> Result<impl IntoResponse, ApiError> {
    if user.role != crate::auth::Role::Admin {
        return Err(ApiError::forbidden("admin only"));
    }

    let group = (state.db.read().await).get_user_group(&id).map_err(|_| ApiError::internal())?;
    match group {
        Some(g) => Ok(Json(GroupResponse {
            id: g.id,
            name: g.name,
            description: g.description,
            created_at: g.created_at,
            updated_at: g.updated_at,
        })),
        None => Err(ApiError::not_found("group not found")),
    }
}

async fn create_group(
    State(state): State<AppState>,
    Extension(user): Extension<AuthedUser>,
    Json(req): Json<CreateGroupRequest>,
) -> Result<impl IntoResponse, ApiError> {
    if user.role != crate::auth::Role::Admin {
        return Err(ApiError::forbidden("admin only"));
    }

    let id = (state.db.read().await).create_user_group(&req.name, req.description.as_deref()).map_err(|_| ApiError::internal())?;
    let group = (state.db.read().await).get_user_group(&id).map_err(|_| ApiError::internal())?.unwrap();

    Ok((StatusCode::CREATED, Json(GroupResponse {
        id: group.id,
        name: group.name,
        description: group.description,
        created_at: group.created_at,
        updated_at: group.updated_at,
    })))
}

async fn update_group(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Extension(user): Extension<AuthedUser>,
    Json(req): Json<UpdateGroupRequest>,
) -> Result<impl IntoResponse, ApiError> {
    if user.role != crate::auth::Role::Admin {
        return Err(ApiError::forbidden("admin only"));
    }

    (state.db.read().await).update_user_group(&id, &req.name, req.description.as_deref()).map_err(|_| ApiError::internal())?;
    let group = (state.db.read().await).get_user_group(&id).map_err(|_| ApiError::internal())?.ok_or_else(|| ApiError::not_found("group not found"))?;

    Ok(Json(GroupResponse {
        id: group.id,
        name: group.name,
        description: group.description,
        created_at: group.created_at,
        updated_at: group.updated_at,
    }))
}

async fn delete_group(State(state): State<AppState>, Path(id): Path<String>, Extension(user): Extension<AuthedUser>) -> Result<impl IntoResponse, ApiError> {
    if user.role != crate::auth::Role::Admin {
        return Err(ApiError::forbidden("admin only"));
    }

    (state.db.read().await).delete_user_group(&id).map_err(|_| ApiError::internal())?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_group_members(State(state): State<AppState>, Path(id): Path<String>, Extension(user): Extension<AuthedUser>) -> Result<impl IntoResponse, ApiError> {
    if user.role != crate::auth::Role::Admin {
        return Err(ApiError::forbidden("admin only"));
    }

    let user_ids = (state.db.read().await).get_group_members(&id).map_err(|_| ApiError::internal())?;
    Ok(Json(user_ids))
}

async fn add_member(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Extension(user): Extension<AuthedUser>,
    Json(req): Json<AddMemberRequest>,
) -> Result<impl IntoResponse, ApiError> {
    if user.role != crate::auth::Role::Admin {
        return Err(ApiError::forbidden("admin only"));
    }

    (state.db.read().await).add_user_to_group(&req.user_id, &id).map_err(|_| ApiError::internal())?;
    Ok(StatusCode::NO_CONTENT)
}

async fn remove_member(
    State(state): State<AppState>,
    Path((id, user_id)): Path<(String, String)>,
    Extension(user): Extension<AuthedUser>,
) -> Result<impl IntoResponse, ApiError> {
    if user.role != crate::auth::Role::Admin {
        return Err(ApiError::forbidden("admin only"));
    }

    (state.db.read().await).remove_user_from_group(&user_id, &id).map_err(|_| ApiError::internal())?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_project_policy(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Extension(user): Extension<AuthedUser>,
) -> Result<impl IntoResponse, ApiError> {
    // Check if user can read the project
    if !can_read(&*state.db.read().await, &project_id, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }

    let policy = (state.db.read().await).get_project_policy(&project_id).map_err(|_| ApiError::internal())?;
    match policy {
        Some(p) => Ok(Json(p)),
        None => {
            // Return default policy
            Ok(Json(ProjectPolicy {
                project_defaults: PolicyDefaults {
                    groups: HashMap::new(),
                    users: HashMap::new(),
                    anonymous: crate::models::Permission::None,
                },
            }))
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdatePolicyRequest {
    policy: ProjectPolicy,
}

async fn update_project_policy(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Extension(user): Extension<AuthedUser>,
    Json(req): Json<UpdatePolicyRequest>,
) -> Result<impl IntoResponse, ApiError> {
    // Only admins can update policies for now
    if user.role != crate::auth::Role::Admin {
        return Err(ApiError::forbidden("admin only"));
    }

    // Validate policy
    validate_policy(&req.policy)?;

    (state.db.read().await).set_project_policy(&project_id, req.policy).map_err(|_| ApiError::internal())?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CheckPermissionResponse {
    can_read: bool,
    can_write: bool,
}

#[derive(Debug, Deserialize)]
struct CheckPermissionQuery {
    project_id: String,
}

async fn check_permission(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<CheckPermissionQuery>,
    Extension(user): Extension<AuthedUser>,
) -> Result<impl IntoResponse, ApiError> {
    let can_read_result = can_read(&*state.db.read().await, &params.project_id, Some(&user)).map_err(|_| ApiError::internal())?;
    let can_write_result = can_write(&*state.db.read().await, &params.project_id, Some(&user)).map_err(|_| ApiError::internal())?;

    Ok(Json(CheckPermissionResponse {
        can_read: can_read_result,
        can_write: can_write_result,
    }))
}

fn validate_policy(policy: &ProjectPolicy) -> Result<(), ApiError> {
    // Check for dangerous anonymous permissions
    if policy.project_defaults.anonymous == crate::models::Permission::Write {
        return Err(ApiError::bad_request("anonymous users cannot have write permission on project defaults"));
    }

    Ok(())
}

