use axum::http::{header, HeaderMap};

use crate::app_state::AppState;
use crate::auth::{AuthedUser, Role};
use crate::mcp_api_key::hash_api_key;
use crate::ApiError;

pub fn enforce_mcp_protocol_header(headers: &HeaderMap) -> Result<(), ApiError> {
    let Some(v) = headers.get("MCP-Protocol-Version") else {
        return Ok(());
    };
    let Ok(s) = v.to_str() else {
        return Err(ApiError::bad_request("invalid MCP-Protocol-Version"));
    };
    match s {
        "2025-11-25" | "2025-03-26" | "2024-11-05" => Ok(()),
        _ => Err(ApiError::bad_request("unsupported MCP-Protocol-Version")),
    }
}

pub fn enforce_origin_allow_list(headers: &HeaderMap) -> Result<(), ApiError> {
    let Some(origin) = headers.get(header::ORIGIN) else {
        return Ok(());
    };
    let origin = origin
        .to_str()
        .map_err(|_| ApiError::forbidden("invalid origin"))?;
    let allow = std::env::var("KEEL_MCP_ALLOWED_ORIGINS").unwrap_or_default();
    let allow_list: Vec<&str> = allow
        .split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    if allow_list.iter().any(|v| *v == origin) {
        return Ok(());
    }
    Err(ApiError::forbidden("forbidden origin"))
}

pub async fn authenticate_bearer(state: &AppState, headers: &HeaderMap) -> Result<AuthedUser, ApiError> {
    let auth = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| ApiError::unauthorized("missing Authorization header"))?;
    let token = auth
        .strip_prefix("Bearer ")
        .ok_or_else(|| ApiError::unauthorized("invalid Authorization header"))?;
    if token.trim().is_empty() {
        return Err(ApiError::unauthorized("empty bearer token"));
    }

    let token_hash = hash_api_key(token.trim());
    let db = state.db.read().await;
    let user = db
        .get_user_by_mcp_api_key_hash(&token_hash)
        .map_err(|_| ApiError::internal())?
        .ok_or_else(|| ApiError::unauthorized("invalid bearer token"))?;
    if user.is_disabled {
        return Err(ApiError::unauthorized("user disabled"));
    }
    let role = Role::from_db(&user.role).ok_or_else(ApiError::internal)?;

    Ok(AuthedUser {
        user_id: user.id,
        email: user.email,
        role,
        last_login_at: user.last_login_at,
        session_id: "__mcp__".to_string(),
    })
}
