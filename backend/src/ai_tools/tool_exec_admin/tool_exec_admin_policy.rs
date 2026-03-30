//! Admin tool handlers for project access policy (per-project user permissions).

use serde_json::{json, Value};
use std::collections::HashMap;

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::mcp::task_wiki::resolve_project;
use crate::models::{Permission, PolicyDefaults, ProjectPolicy};
use crate::ApiError;

fn validate_policy(policy: &ProjectPolicy) -> Result<(), String> {
    if policy.project_defaults.anonymous == Permission::Write {
        return Err("anonymous users cannot have write permission on project defaults".to_string());
    }
    Ok(())
}

fn parse_permission(s: &str) -> Result<Permission, String> {
    match s.trim().to_ascii_lowercase().as_str() {
        "read" => Ok(Permission::Read),
        "write" => Ok(Permission::Write),
        "none" => Ok(Permission::None),
        _ => Err(
            "permission must be \"read\", \"write\", or \"none\" (none removes the user from project defaults)"
                .to_string(),
        ),
    }
}

fn resolve_target_user_id(state: &AppState, args: &Value) -> Result<String, String> {
    let user_id = args
        .get("userId")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let email = args
        .get("email")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let db = state.db.blocking_read();
    if let Some(uid) = user_id {
        if db.get_user_by_id(&uid).map_err(|e| e.to_string())?.is_none() {
            return Err("user not found".to_string());
        }
        return Ok(uid);
    }
    if let Some(em) = email {
        let u = db
            .get_user_by_email_case_insensitive(&em)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| {
                "user not found for email; create the user with create_user first, then grant access".to_string()
            })?;
        return Ok(u.id);
    }
    Err("userId or email is required".to_string())
}

pub fn get_project_policy(state: &AppState, user: &AuthedUser, args: &Value) -> Result<String, ApiError> {
    let project_key = args.get("projectKey").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty());
    let project_id = args.get("projectId").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty());
    if project_key.is_none() && project_id.is_none() {
        return Ok(json!({ "error": "projectKey or projectId is required" }).to_string());
    }

    let project = match resolve_project(state, user, project_key, project_id) {
        Ok(p) => p,
        Err(e) => return Ok(json!({ "error": format!("{e:#}") }).to_string()),
    };

    let db = state.db.blocking_read();
    let policy = match db.get_project_policy(&project.id).map_err(|_| ApiError::internal())? {
        Some(p) => p,
        None => ProjectPolicy {
            project_defaults: PolicyDefaults {
                groups: HashMap::new(),
                users: HashMap::new(),
                anonymous: Permission::None,
            },
        },
    };

    serde_json::to_string(&policy).map_err(|_| ApiError::internal())
}

pub fn grant_project_user_access(state: &AppState, user: &AuthedUser, args: &Value) -> Result<String, ApiError> {
    let project_key = args.get("projectKey").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty());
    let project_id = args.get("projectId").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty());
    if project_key.is_none() && project_id.is_none() {
        return Ok(json!({ "error": "projectKey or projectId is required" }).to_string());
    }

    let perm_str = args
        .get("permission")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if perm_str.is_empty() {
        return Ok(json!({ "error": "permission is required (read, write, or none)" }).to_string());
    }
    let permission = match parse_permission(perm_str) {
        Ok(p) => p,
        Err(msg) => return Ok(json!({ "error": msg }).to_string()),
    };

    let target_user_id = match resolve_target_user_id(state, args) {
        Ok(id) => id,
        Err(msg) => return Ok(json!({ "error": msg }).to_string()),
    };

    let project = match resolve_project(state, user, project_key, project_id) {
        Ok(p) => p,
        Err(e) => return Ok(json!({ "error": format!("{e:#}") }).to_string()),
    };

    let db = state.db.blocking_read();
    let mut policy = match db.get_project_policy(&project.id).map_err(|_| ApiError::internal())? {
        Some(p) => p,
        None => ProjectPolicy {
            project_defaults: PolicyDefaults {
                groups: HashMap::new(),
                users: HashMap::new(),
                anonymous: Permission::None,
            },
        },
    };

    if permission == Permission::None {
        policy.project_defaults.users.remove(&target_user_id);
    } else {
        policy
            .project_defaults
            .users
            .insert(target_user_id.clone(), permission);
    }

    if let Err(msg) = validate_policy(&policy) {
        return Ok(json!({ "error": msg }).to_string());
    }

    db.set_project_policy(&project.id, policy)
        .map_err(|_| ApiError::internal())?;

    Ok(json!({ "ok": true, "projectId": project.id, "userId": target_user_id }).to_string())
}
