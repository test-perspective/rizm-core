//! Admin tool handlers for group management.

use serde_json::{json, Value};

use crate::app_state::AppState;
use crate::ApiError;

pub fn list_groups(state: &AppState, _args: &Value) -> Result<String, ApiError> {
    let groups = state.db.blocking_read().list_user_groups().map_err(|_| ApiError::internal())?;
    let out: Vec<Value> = groups
        .into_iter()
        .map(|g| {
            json!({
                "id": g.id,
                "name": g.name,
                "description": g.description,
                "createdAt": g.created_at,
                "updatedAt": g.updated_at
            })
        })
        .collect();
    Ok(json!({ "groups": out }).to_string())
}

pub fn create_group(state: &AppState, args: &Value) -> Result<String, ApiError> {
    let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
    if name.is_empty() {
        return Ok(json!({ "error": "name is required" }).to_string());
    }
    let description = args.get("description").and_then(|v| v.as_str()).map(|s| s.trim());

    let id = state
        .db
        .blocking_read()
        .create_user_group(name, description)
        .map_err(|_| ApiError::internal())?;
    let group = state
        .db
        .blocking_read()
        .get_user_group(&id)
        .map_err(|_| ApiError::internal())?
        .unwrap();

    Ok(json!({
        "group": {
            "id": group.id,
            "name": group.name,
            "description": group.description,
            "createdAt": group.created_at,
            "updatedAt": group.updated_at
        }
    })
    .to_string())
}

pub fn update_group(state: &AppState, args: &Value) -> Result<String, ApiError> {
    let group_id = args
        .get("groupId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
    if group_id.is_empty() || name.is_empty() {
        return Ok(json!({ "error": "groupId and name are required" }).to_string());
    }
    let description = args.get("description").and_then(|v| v.as_str()).map(|s| s.trim());

    state
        .db
        .blocking_read()
        .update_user_group(group_id, name, description)
        .map_err(|_| ApiError::internal())?;

    Ok(json!({ "ok": true }).to_string())
}

pub fn delete_group(state: &AppState, args: &Value) -> Result<String, ApiError> {
    let group_id = args
        .get("groupId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if group_id.is_empty() {
        return Ok(json!({ "error": "groupId is required" }).to_string());
    }

    state
        .db
        .blocking_read()
        .delete_user_group(group_id)
        .map_err(|_| ApiError::internal())?;

    Ok(json!({ "ok": true }).to_string())
}

pub fn add_member_to_group(state: &AppState, args: &Value) -> Result<String, ApiError> {
    let group_id = args
        .get("groupId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let user_id = args
        .get("userId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if group_id.is_empty() || user_id.is_empty() {
        return Ok(json!({ "error": "groupId and userId are required" }).to_string());
    }

    if state.db.blocking_read().get_user_by_id(user_id).map_err(|_| ApiError::internal())?.is_none() {
        return Ok(json!({ "error": "user not found" }).to_string());
    }
    if state.db.blocking_read().get_user_group(group_id).map_err(|_| ApiError::internal())?.is_none() {
        return Ok(json!({ "error": "group not found" }).to_string());
    }

    if let Err(e) = state.db.blocking_read().add_user_to_group(user_id, group_id) {
        let msg = e.to_string();
        if msg.contains("UNIQUE") || msg.contains("unique") {
            return Ok(json!({ "error": "user is already in group" }).to_string());
        }
        if msg.contains("FOREIGN KEY") || msg.contains("foreign key") {
            return Ok(json!({ "error": "user or group not found" }).to_string());
        }
        return Ok(json!({ "error": format!("add member failed: {}", msg) }).to_string());
    }
    Ok(json!({ "ok": true }).to_string())
}

pub fn remove_member_from_group(state: &AppState, args: &Value) -> Result<String, ApiError> {
    let group_id = args
        .get("groupId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let user_id = args
        .get("userId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if group_id.is_empty() || user_id.is_empty() {
        return Ok(json!({ "error": "groupId and userId are required" }).to_string());
    }

    state
        .db
        .blocking_read()
        .remove_user_from_group(user_id, group_id)
        .map_err(|_| ApiError::internal())?;

    Ok(json!({ "ok": true }).to_string())
}

pub fn get_group_members(state: &AppState, args: &Value) -> Result<String, ApiError> {
    let group_id = args
        .get("groupId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if group_id.is_empty() {
        return Ok(json!({ "error": "groupId is required" }).to_string());
    }

    let user_ids = state
        .db
        .blocking_read()
        .get_group_members(group_id)
        .map_err(|_| ApiError::internal())?;

    Ok(json!({ "userIds": user_ids }).to_string())
}

pub fn get_user_groups(state: &AppState, args: &Value) -> Result<String, ApiError> {
    let user_id = args
        .get("userId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if user_id.is_empty() {
        return Ok(json!({ "error": "userId is required" }).to_string());
    }

    let group_ids = state
        .db
        .blocking_read()
        .get_user_groups(user_id)
        .map_err(|_| ApiError::internal())?;

    Ok(json!({ "groupIds": group_ids }).to_string())
}
