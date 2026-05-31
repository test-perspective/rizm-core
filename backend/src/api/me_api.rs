use axum::{routing::get, Extension, Json, Router};
use serde::{Deserialize, Serialize};

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::mcp_api_key::{generate_plaintext_api_key, hash_api_key};
use crate::ApiError;

const DEFAULT_DASHBOARD_POLICY_JSON: &str = r#"{
  "version": 1,
  "sections": [
    {
      "id": "related",
      "title": "Updates Related to Me",
      "filter": {
        "entityTypes": ["TASK", "WIKI"],
        "actions": ["TASK_*", "WIKI_*"],
        "relation": {
          "taskPropertyKeys": ["assigneeId", "owner", "createdBy"],
          "match": "userId"
        }
      },
      "limits": { "parents": 30, "childrenPerParent": 10 }
    },
    {
      "id": "all",
      "title": "Other Updates",
      "filter": { "entityTypes": ["TASK", "WIKI"], "actions": ["TASK_*", "WIKI_*"] },
      "limits": { "parents": 50, "childrenPerParent": 10 }
    }
  ]
}"#;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DashboardPolicyResponse {
    policy_json: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PutDashboardPolicyRequest {
    policy_json: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct McpApiKeyStatusResponse {
    has_key: bool,
    last_used_at: Option<i64>,
    updated_at: Option<i64>,
    revoked_at: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateMcpApiKeyResponse {
    token: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/me/dashboard-policy",
            get(get_dashboard_policy).put(put_dashboard_policy),
        )
        .route(
            "/api/me/mcp-api-key",
            get(get_mcp_api_key_status)
                .post(post_mcp_api_key)
                .delete(delete_mcp_api_key),
        )
}

async fn get_dashboard_policy(
    axum::extract::State(state): axum::extract::State<AppState>,
    Extension(user): Extension<AuthedUser>,
) -> Result<Json<DashboardPolicyResponse>, ApiError> {
    let db = state.db.read().await;
    let existing = db
        .get_user_dashboard_policy_json(&user.user_id)
        .map_err(|_| ApiError::internal())?;

    let policy_json = existing.unwrap_or_else(|| DEFAULT_DASHBOARD_POLICY_JSON.to_string());
    Ok(Json(DashboardPolicyResponse { policy_json }))
}

async fn put_dashboard_policy(
    axum::extract::State(state): axum::extract::State<AppState>,
    Extension(user): Extension<AuthedUser>,
    Json(req): Json<PutDashboardPolicyRequest>,
) -> Result<(), ApiError> {
    let raw = req.policy_json.trim();
    if raw.is_empty() {
        return Err(ApiError::bad_request("policyJson is required"));
    }

    // Validate + normalize (store as pretty JSON).
    let v: serde_json::Value = serde_json::from_str(raw)
        .map_err(|_| ApiError::bad_request("policyJson must be valid JSON"))?;
    if !v.is_object() {
        return Err(ApiError::bad_request("policyJson must be a JSON object"));
    }
    let normalized = serde_json::to_string_pretty(&v)
        .map_err(|_| ApiError::bad_request("policyJson must be serializable JSON"))?;

    let db = state.db.read().await;
    db.set_user_dashboard_policy_json(&user.user_id, &normalized)
        .map_err(|_| ApiError::internal())?;

    Ok(())
}

async fn get_mcp_api_key_status(
    axum::extract::State(state): axum::extract::State<AppState>,
    Extension(user): Extension<AuthedUser>,
) -> Result<Json<McpApiKeyStatusResponse>, ApiError> {
    let db = state.db.read().await;
    let key = db
        .get_user_mcp_api_key(&user.user_id)
        .map_err(|_| ApiError::internal())?;

    let res = match key {
        Some(k) => McpApiKeyStatusResponse {
            has_key: k.revoked_at.is_none(),
            last_used_at: k.last_used_at,
            updated_at: Some(k.updated_at),
            revoked_at: k.revoked_at,
        },
        None => McpApiKeyStatusResponse {
            has_key: false,
            last_used_at: None,
            updated_at: None,
            revoked_at: None,
        },
    };
    Ok(Json(res))
}

async fn post_mcp_api_key(
    axum::extract::State(state): axum::extract::State<AppState>,
    Extension(user): Extension<AuthedUser>,
) -> Result<Json<CreateMcpApiKeyResponse>, ApiError> {
    let token = generate_plaintext_api_key();
    let token_hash = hash_api_key(&token);
    let db = state.db.read().await;
    db.upsert_user_mcp_api_key_hash(&user.user_id, &token_hash)
        .map_err(|_| ApiError::internal())?;
    Ok(Json(CreateMcpApiKeyResponse { token }))
}

async fn delete_mcp_api_key(
    axum::extract::State(state): axum::extract::State<AppState>,
    Extension(user): Extension<AuthedUser>,
) -> Result<(), ApiError> {
    let db = state.db.read().await;
    db.revoke_user_mcp_api_key(&user.user_id)
        .map_err(|_| ApiError::internal())?;
    Ok(())
}
