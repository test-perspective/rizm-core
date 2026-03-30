use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde_json::Value;

use crate::app_state::AppState;
use crate::ApiError;

mod protocol;

#[cfg(test)]
mod tests;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/mcp", get(get_mcp).post(post_mcp))
}

async fn get_mcp() -> impl IntoResponse {
    (StatusCode::METHOD_NOT_ALLOWED, "GET is not enabled on this MCP endpoint")
}

async fn post_mcp(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(req): Json<Value>,
) -> Result<impl IntoResponse, ApiError> {
    crate::mcp::auth::enforce_mcp_protocol_header(&headers)?;
    crate::mcp::auth::enforce_origin_allow_list(&headers)?;

    let user = crate::mcp::auth::authenticate_bearer(&state, &headers).await?;
    let now = crate::time::now_ms();
    let _ = (state.db.read().await).touch_user_mcp_api_key_last_used(&user.user_id, now);

    let (id, method, params) =
        crate::mcp::jsonrpc::parse_jsonrpc_request(&req).map_err(|_| ApiError::bad_request("invalid json-rpc request"))?;

    let Some(id) = id else {
        return Ok(StatusCode::ACCEPTED.into_response());
    };

    let response = match method.as_str() {
        "initialize" => crate::mcp::jsonrpc::ok_response(id.clone(), protocol::initialize_result()),
        "tools/list" => crate::mcp::jsonrpc::ok_response(id.clone(), protocol::tools_list_result()),
        "tools/call" => {
            let result = match crate::mcp::tools::tools_call(&state, &user, params).await {
                Ok(r) => r,
                Err(err) => crate::mcp::jsonrpc::tool_error_result(format!("{err:#}")),
            };
            crate::mcp::jsonrpc::ok_response(id, result)
        }
        _ => crate::mcp::jsonrpc::error_response(id, -32601, "Method not found"),
    };

    Ok((StatusCode::OK, Json(response)).into_response())
}
