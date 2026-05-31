//! Admin tool handlers for user management.

use serde_json::{json, Value};

use crate::admin::{generate_temp_password, hash_password, normalize_email};
use crate::app_state::AppState;
use crate::auth::{AuthedUser, Role};
use crate::time;
use crate::ApiError;

pub fn list_users(state: &AppState, args: &Value) -> Result<String, ApiError> {
    let inactive_only = args
        .get("inactiveOnly")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let include_disabled = args
        .get("includeDisabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let users = state
        .db
        .blocking_read()
        .list_users()
        .map_err(|_| ApiError::internal())?;
    let filtered: Vec<_> = users
        .into_iter()
        .filter(|u| {
            if inactive_only {
                u.is_disabled
            } else if include_disabled {
                true
            } else {
                !u.is_disabled
            }
        })
        .filter_map(|u| {
            let role = Role::from_db(&u.role)?;
            Some(json!({
                "id": u.id,
                "email": u.email,
                "role": role.as_str(),
                "isDisabled": u.is_disabled,
                "createdAt": u.created_at,
                "lastLoginAt": u.last_login_at
            }))
        })
        .collect();

    Ok(json!({ "users": filtered }).to_string())
}

pub fn get_user(state: &AppState, args: &Value) -> Result<String, ApiError> {
    let user_id = args
        .get("userId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if user_id.is_empty() {
        return Ok(json!({ "error": "userId is required" }).to_string());
    }

    let user = match state
        .db
        .blocking_read()
        .get_user_by_id(user_id)
        .map_err(|_| ApiError::internal())?
    {
        Some(u) => u,
        None => return Ok(json!({ "error": "user not found" }).to_string()),
    };

    let role = match Role::from_db(&user.role) {
        Some(r) => r,
        None => return Ok(json!({ "error": "invalid role" }).to_string()),
    };

    Ok(json!({
        "user": {
            "id": user.id,
            "email": user.email,
            "role": role.as_str(),
            "isDisabled": user.is_disabled,
            "createdAt": user.created_at,
            "lastLoginAt": user.last_login_at
        }
    })
    .to_string())
}

pub fn bulk_delete_users(
    state: &AppState,
    actor: &AuthedUser,
    args: &Value,
) -> Result<String, ApiError> {
    let ids = args
        .get("userIds")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if ids.is_empty() {
        return Ok(json!({ "error": "userIds is required and must be non-empty" }).to_string());
    }

    let mut deleted = Vec::new();
    let mut errors = Vec::new();

    for user_id in ids {
        let user = match state
            .db
            .blocking_read()
            .get_user_by_id(&user_id)
            .map_err(|_| ApiError::internal())?
        {
            Some(u) => u,
            None => {
                errors.push(format!("user {} not found", user_id));
                continue;
            }
        };

        if user.role == "admin" && !user.is_disabled {
            let count = state
                .db
                .blocking_read()
                .count_admin_users()
                .map_err(|_| ApiError::internal())?;
            if count <= 1 {
                errors.push(format!("cannot delete the last admin user ({})", user_id));
                continue;
            }
        }

        if let Err(e) = state
            .db
            .blocking_read()
            .delete_user_and_clear_assignee_references(&user_id)
        {
            errors.push(format!("{user_id}: {}", e));
            continue;
        }

        let now = time::now_ms();
        let _ = state.db.blocking_read().insert_audit_log(
            Some(&actor.user_id),
            "USER_DELETED",
            Some(&user_id),
            Some(&serde_json::json!({ "email": user.email, "role": user.role }).to_string()),
            now,
        );
        deleted.push(user_id);
    }

    Ok(json!({
        "deleted": deleted,
        "errors": errors
    })
    .to_string())
}

pub fn create_user(state: &AppState, actor: &AuthedUser, args: &Value) -> Result<String, ApiError> {
    let email = args
        .get("email")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let email = normalize_email(email).ok_or_else(|| ApiError::bad_request("invalid email"))?;

    let role_str = args
        .get("role")
        .and_then(|v| v.as_str())
        .unwrap_or("viewer")
        .trim()
        .to_lowercase();
    let role = match role_str.as_str() {
        "admin" => Role::Admin,
        "editor" => Role::Editor,
        "viewer" => Role::Viewer,
        _ => return Ok(json!({ "error": "role must be admin, editor, or viewer" }).to_string()),
    };

    let (password, temp_password) = match args.get("initialPassword").and_then(|v| v.as_str()) {
        Some(p) if p.trim().len() >= 12 => (p.trim().to_string(), None),
        Some(_) => {
            return Ok(json!({ "error": "password must be at least 12 characters" }).to_string())
        }
        _ => {
            let t = generate_temp_password();
            (t.clone(), Some(t))
        }
    };

    let password_hash = hash_password(&password);
    let user = state
        .db
        .blocking_read()
        .create_local_user(&email, role.as_str(), &password_hash)
        .map_err(|_| ApiError::bad_request("user already exists"))?;

    let now = time::now_ms();
    let _ = state.db.blocking_read().insert_audit_log(
        Some(&actor.user_id),
        "USER_CREATED",
        Some(&user.id),
        Some(&serde_json::json!({ "email": email, "role": role.as_str() }).to_string()),
        now,
    );

    let mut out = json!({
        "user": {
            "id": user.id,
            "email": user.email,
            "role": role.as_str(),
            "isDisabled": user.is_disabled
        }
    });
    if let Some(t) = temp_password {
        out["tempPassword"] = json!(t);
    }
    Ok(out.to_string())
}

pub fn update_user(state: &AppState, actor: &AuthedUser, args: &Value) -> Result<String, ApiError> {
    let user_id = args
        .get("userId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if user_id.is_empty() {
        return Ok(json!({ "error": "userId is required" }).to_string());
    }

    if state
        .db
        .blocking_read()
        .get_user_by_id(user_id)
        .map_err(|_| ApiError::internal())?
        .is_none()
    {
        return Ok(json!({ "error": "user not found" }).to_string());
    }

    let role = args
        .get("role")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_lowercase());
    let role = role.as_ref().and_then(|r| match r.as_str() {
        "admin" => Some(Role::Admin),
        "editor" => Some(Role::Editor),
        "viewer" => Some(Role::Viewer),
        _ => None,
    });
    let is_disabled = args.get("isDisabled").and_then(|v| v.as_bool());

    if role.is_none() && is_disabled.is_none() {
        return Ok(
            json!({ "error": "at least one of role or isDisabled is required" }).to_string(),
        );
    }

    if let Err(e) = state.db.blocking_read().update_user_role_disabled(
        user_id,
        role.as_ref().map(|r| r.as_str()),
        is_disabled,
    ) {
        return Ok(json!({ "error": format!("update failed: {}", e) }).to_string());
    }

    let now = time::now_ms();
    let meta = serde_json::json!({
        "role": role.as_ref().map(|r| r.as_str()),
        "isDisabled": is_disabled
    });
    let _ = state.db.blocking_read().insert_audit_log(
        Some(&actor.user_id),
        "USER_UPDATED",
        Some(user_id),
        Some(&meta.to_string()),
        now,
    );

    Ok(json!({ "ok": true }).to_string())
}

pub fn reset_password(
    state: &AppState,
    actor: &AuthedUser,
    args: &Value,
) -> Result<String, ApiError> {
    let user_id = args
        .get("userId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if user_id.is_empty() {
        return Ok(json!({ "error": "userId is required" }).to_string());
    }

    let generate_temp = args
        .get("generateTemp")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let new_password = args
        .get("newPassword")
        .and_then(|v| v.as_str())
        .map(|s| s.trim());

    let (password, temp_password) = if generate_temp {
        let t = generate_temp_password();
        (t.clone(), Some(t))
    } else if let Some(p) = new_password {
        if p.len() < 12 {
            return Ok(json!({ "error": "password must be at least 12 characters" }).to_string());
        }
        (p.to_string(), None)
    } else {
        return Ok(
            json!({ "error": "either generateTemp or newPassword is required" }).to_string(),
        );
    };

    let password_hash = hash_password(&password);
    state
        .db
        .blocking_read()
        .set_user_password_hash(user_id, &password_hash)
        .map_err(|_| ApiError::internal())?;

    let now = time::now_ms();
    let _ = state.db.blocking_read().insert_audit_log(
        Some(&actor.user_id),
        "USER_PASSWORD_RESET",
        Some(user_id),
        Some(&serde_json::json!({ "generateTemp": generate_temp }).to_string()),
        now,
    );

    let mut out = json!({ "ok": true });
    if let Some(t) = temp_password {
        out["tempPassword"] = json!(t);
    }
    Ok(out.to_string())
}
