use axum::{
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::Response,
    routing::{get, patch, post},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};
use std::io::Write;

use crate::app_state::AppState;
use crate::auth::{Role, AuthedUser};
use crate::ApiError;

mod system_info;
pub mod db_snapshot;
mod support;
pub(crate) use support::{ensure_admin, generate_temp_password, hash_password, normalize_email};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UserPublic {
    id: String,
    email: String,
    role: Role,
    is_disabled: bool,
    created_at: i64,
    updated_at: i64,
    last_login_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateUserRequest {
    email: String,
    role: Role,
    initial_password: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateUserResponse {
    user: UserPublic,
    #[serde(skip_serializing_if = "Option::is_none")]
    temp_password: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PatchUserRequest {
    role: Option<Role>,
    is_disabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResetPasswordRequest {
    new_password: Option<String>,
    generate_temp: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ResetPasswordResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    temp_password: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuditLogsQuery {
    #[serde(default)]
    limit: Option<u32>,
    #[serde(default)]
    offset: Option<u32>,
    #[serde(default)]
    since: Option<i64>,
    #[serde(default)]
    until: Option<i64>,
    #[serde(default)]
    is_activity: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AuditLogRow {
    id: String,
    actor_user_id: Option<String>,
    actor_user_email: Option<String>,
    action: String,
    target_user_id: Option<String>,
    target_user_email: Option<String>,
    meta_json: Option<String>,
    created_at: i64,
    is_activity: bool,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/admin/users", get(list_users).post(create_user))
        .route("/api/admin/users/:id", patch(patch_user).delete(delete_user))
        .route("/api/admin/users/:id/reset-password", post(reset_password))
        .route("/api/admin/audit-logs", get(list_audit_logs))
        .route("/api/admin/export-db", get(export_database))
        .route("/api/admin/system-info", get(system_info::get_system_info))
        .merge(db_snapshot::router())
}

async fn list_users(State(state): State<AppState>, Extension(actor): Extension<AuthedUser>) -> Result<Json<Vec<UserPublic>>, ApiError> {
    ensure_admin(&actor)?;
    let db = state.db.read().await;
    let users = db.list_users().map_err(|_| ApiError::internal())?;
    let out = users
        .into_iter()
        .filter_map(|u| {
            let role = Role::from_db(&u.role)?;
            Some(UserPublic {
                id: u.id,
                email: u.email,
                role,
                is_disabled: u.is_disabled,
                created_at: u.created_at,
                updated_at: u.updated_at,
                last_login_at: u.last_login_at,
            })
        })
        .collect();
    Ok(Json(out))
}

async fn create_user(
    State(state): State<AppState>,
    Extension(actor): Extension<AuthedUser>,
    Json(req): Json<CreateUserRequest>,
) -> Result<Json<CreateUserResponse>, ApiError> {
    ensure_admin(&actor)?;
    let db = state.db.read().await;

    let email = normalize_email(&req.email).ok_or_else(|| ApiError::bad_request("invalid email"))?;
    let (password, temp_password) = match req.initial_password {
        Some(p) => {
            if p.trim().len() < 12 {
                return Err(ApiError::bad_request("password must be at least 12 characters"));
            }
            (p, None)
        }
        None => {
            let t = generate_temp_password();
            (t.clone(), Some(t))
        }
    };

    let password_hash = hash_password(&password);
    let user = db
        .create_local_user(&email, req.role.as_str(), &password_hash)
        .map_err(|_| ApiError::bad_request("user already exists"))?;

    // Automatically assign user to a group based on their role
    // Try to find the appropriate group (created by migration script) by name
    let (group_name, _) = match req.role {
        Role::Admin => ("Admin (Migrated)", "Auto-created from existing admin users"),
        Role::Editor => ("Editor (Migrated)", "Auto-created from existing editor users"),
        Role::Viewer => ("Viewer (Migrated)", "Auto-created from existing viewer users"),
    };
    
    // Find group by name, or create it if it doesn't exist
    let groups = db.list_user_groups().map_err(|_| ApiError::internal())?;
    let group_id = groups
        .iter()
        .find(|g| g.name == group_name)
        .map(|g| g.id.clone())
        .unwrap_or_else(|| {
            // Create new group if not found
            let (name, desc) = match req.role {
                Role::Admin => ("Admin (Migrated)", "Auto-created from existing admin users"),
                Role::Editor => ("Editor (Migrated)", "Auto-created from existing editor users"),
                Role::Viewer => ("Viewer (Migrated)", "Auto-created from existing viewer users"),
            };
            // This will create a new group with a new UUID, which is fine
            // The migration script creates groups with fixed IDs, but new ones can have random IDs
            db.create_user_group(name, Some(desc)).map_err(|_| {
                tracing::warn!("Failed to create group {}", name);
            }).unwrap_or_else(|_| String::new())
        });
    
    // Add user to the group (ignore errors if already in group)
    if !group_id.is_empty() {
        let _ = db.add_user_to_group(&user.id, &group_id).map_err(|e| {
            // Ignore errors if user is already in the group
            tracing::debug!("Note: user {} may already be in group {}: {:?}", user.id, group_id, e);
        });
    }

    let now = crate::time::now_ms();
    let _ = db.insert_audit_log(
        Some(&actor.user_id),
        "USER_CREATED",
        Some(&user.id),
        Some(&serde_json::json!({ "email": email, "role": req.role }).to_string()),
        now,
    );

    Ok(Json(CreateUserResponse {
        user: UserPublic {
            id: user.id,
            email: user.email,
            role: req.role,
            is_disabled: user.is_disabled,
            created_at: user.created_at,
            updated_at: user.updated_at,
            last_login_at: user.last_login_at,
        },
        temp_password,
    }))
}

async fn patch_user(
    State(state): State<AppState>,
    Extension(actor): Extension<AuthedUser>,
    Path(user_id): Path<String>,
    Json(req): Json<PatchUserRequest>,
) -> Result<StatusCode, ApiError> {
    ensure_admin(&actor)?;
    let db = state.db.read().await;
    db.update_user_role_disabled(
            &user_id,
            req.role.as_ref().map(|r| r.as_str()),
            req.is_disabled,
        )
        .map_err(|_| ApiError::internal())?;

    let now = crate::time::now_ms();
    let _ = db.insert_audit_log(
        Some(&actor.user_id),
        "USER_UPDATED",
        Some(&user_id),
        Some(&serde_json::json!({ "role": req.role, "isDisabled": req.is_disabled }).to_string()),
        now,
    );

    Ok(StatusCode::NO_CONTENT)
}

async fn delete_user(
    State(state): State<AppState>,
    Extension(actor): Extension<AuthedUser>,
    Path(user_id): Path<String>,
) -> Result<StatusCode, ApiError> {
    ensure_admin(&actor)?;
    let db = state.db.read().await;

    let user = db
        .get_user_by_id(&user_id)
        .map_err(|_| ApiError::internal())?
        .ok_or_else(|| ApiError::not_found("user not found"))?;

    // Keep at least one enabled admin account.
    if user.role == "admin" && !user.is_disabled {
        let admin_count = db
            .count_admin_users()
            .map_err(|_| ApiError::internal())?;
        if admin_count <= 1 {
            return Err(ApiError::bad_request("cannot delete the last admin user"));
        }
    }

    db
        .delete_user_and_clear_assignee_references(&user_id)
        .map_err(|_| ApiError::internal())?;

    let now = crate::time::now_ms();
    let _ = db.insert_audit_log(
        Some(&actor.user_id),
        "USER_DELETED",
        Some(&user_id),
        Some(&serde_json::json!({ "email": user.email, "role": user.role }).to_string()),
        now,
    );

    Ok(StatusCode::NO_CONTENT)
}

async fn reset_password(
    State(state): State<AppState>,
    Extension(actor): Extension<AuthedUser>,
    Path(user_id): Path<String>,
    Json(req): Json<ResetPasswordRequest>,
) -> Result<Json<ResetPasswordResponse>, ApiError> {
    ensure_admin(&actor)?;
    let db = state.db.read().await;

    let (new_pw, temp_pw) = if req.generate_temp.unwrap_or(false) {
        let t = generate_temp_password();
        (t.clone(), Some(t))
    } else if let Some(p) = req.new_password {
        if p.trim().len() < 12 {
            return Err(ApiError::bad_request("password must be at least 12 characters"));
        }
        (p, None)
    } else {
        return Err(ApiError::bad_request("newPassword or generateTemp required"));
    };

    let new_hash = hash_password(&new_pw);
    db
        .set_user_password_hash(&user_id, &new_hash)
        .map_err(|_| ApiError::internal())?;

    let now = crate::time::now_ms();
    let _ = db.insert_audit_log(
        Some(&actor.user_id),
        "PASSWORD_RESET",
        Some(&user_id),
        Some(&serde_json::json!({ "generateTemp": req.generate_temp.unwrap_or(false) }).to_string()),
        now,
    );

    Ok(Json(ResetPasswordResponse { temp_password: temp_pw }))
}

async fn list_audit_logs(
    State(state): State<AppState>,
    Extension(actor): Extension<AuthedUser>,
    Query(q): Query<AuditLogsQuery>,
) -> Result<Json<Vec<AuditLogRow>>, ApiError> {
    ensure_admin(&actor)?;
    let db = state.db.read().await;
    let limit = q.limit.unwrap_or(50).min(200) as i64;
    let offset = q.offset.unwrap_or(0) as i64;
    let rows = db
        .list_audit_logs(limit, offset, q.since, q.until, q.is_activity)
        .map_err(|_| ApiError::internal())?;

    let ids: std::collections::HashSet<String> = rows
        .iter()
        .filter_map(|r| r.actor_user_id.clone())
        .chain(rows.iter().filter_map(|r| r.target_user_id.clone()))
        .filter(|s| !s.is_empty())
        .collect();
    let ids_vec: Vec<String> = ids.into_iter().collect();
    let email_by_id = db
        .get_emails_by_user_ids(&ids_vec)
        .map_err(|_| ApiError::internal())?;

    Ok(Json(
        rows.into_iter()
            .map(|r| AuditLogRow {
                id: r.id,
                actor_user_id: r.actor_user_id.clone(),
                actor_user_email: r.actor_user_id.as_ref().and_then(|id| email_by_id.get(id).cloned()),
                action: r.action,
                target_user_id: r.target_user_id.clone(),
                target_user_email: r.target_user_id.as_ref().and_then(|id| email_by_id.get(id).cloned()),
                meta_json: r.meta_json,
                created_at: r.created_at,
                is_activity: r.is_activity,
            })
            .collect(),
    ))
}

async fn export_database(
    State(state): State<AppState>,
    Extension(actor): Extension<AuthedUser>,
) -> Result<Response, ApiError> {
    ensure_admin(&actor)?;

    // SQLite DBファイルを読み込む
    let db_bytes = tokio::fs::read(&state.db_path)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, path = %state.db_path, "failed to read database file");
            ApiError::internal()
        })?;

    // ZIPファイルを作成
    let mut zip_buffer = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut zip_buffer));
        let options = zip::write::FileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .compression_level(Some(6));

        // DBファイル名を取得（パスから）
        let db_filename = std::path::Path::new(&state.db_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("keel.sqlite3");
        zip.start_file(db_filename, options)
            .map_err(|e| {
                tracing::error!(error = %e, "failed to start zip file");
                ApiError::internal()
            })?;
        zip.write_all(&db_bytes).map_err(|e| {
            tracing::error!(error = %e, "failed to write to zip");
            ApiError::internal()
        })?;
        zip.finish().map_err(|e| {
            tracing::error!(error = %e, "failed to finish zip");
            ApiError::internal()
        })?;
    }
    // ZIPファイル名を生成（タイムスタンプ付き）
    let timestamp = crate::time::now_ms();
    let zip_filename = format!("keel-db-{}.zip", timestamp);
    // レスポンスを作成
    let response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/zip")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", zip_filename),
        )
        .body(axum::body::Body::from(zip_buffer))
        .map_err(|_| ApiError::internal())?;
    Ok(response)
}

#[cfg(test)]
mod tests;