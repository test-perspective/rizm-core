//! Wiki tool handlers for the AI Assistant, delegating to the shared MCP logic.

use serde_json::{json, Value};

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::ApiError;

fn trimmed_string_arg(args: &Value, key: &str) -> Option<String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub(super) fn list_wiki_pages(
    state: &AppState,
    user: &AuthedUser,
    args: &Value,
) -> Result<String, ApiError> {
    let pk = trimmed_string_arg(args, "projectKey");
    let pid = trimmed_string_arg(args, "projectId");
    let limit = args
        .get("limit")
        .and_then(|v| v.as_i64())
        .unwrap_or(50)
        .clamp(1, 100) as usize;
    crate::mcp::task_wiki::list_wiki_pages_for_user(
        state,
        user,
        pk.as_deref(),
        pid.as_deref(),
        limit,
    )
    .map_err(|e| ApiError::bad_request(format!("{e:#}")))
}

pub(super) fn search_wiki(
    state: &AppState,
    user: &AuthedUser,
    args: &Value,
) -> Result<String, ApiError> {
    let query = args
        .get("query")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if query.is_empty() {
        return Ok(json!({ "pages": [] }).to_string());
    }
    let pk = trimmed_string_arg(args, "projectKey");
    let pid = trimmed_string_arg(args, "projectId");
    let limit = args
        .get("limit")
        .and_then(|v| v.as_i64())
        .unwrap_or(5)
        .clamp(1, 20) as usize;

    let text = crate::mcp::task_wiki::search_wiki_for_user(
        state,
        user,
        &query,
        pk.as_deref(),
        pid.as_deref(),
        limit,
    )
    .map_err(|e| ApiError::bad_request(format!("{e:#}")))?;

    let parsed: Value = serde_json::from_str(&text).map_err(|_| ApiError::internal())?;
    let empty: Vec<Value> = vec![];
    let results = parsed
        .get("results")
        .and_then(|v| v.as_array())
        .unwrap_or(&empty);
    let pages: Vec<Value> = results
        .iter()
        .map(|r| {
            json!({
                "id": r.get("entityPk").and_then(|v| v.as_str()).unwrap_or(""),
                "title": r.get("title").and_then(|v| v.as_str()).unwrap_or("Untitled"),
                "updatedAt": r.get("updatedAt").unwrap_or(&json!(0)),
                "snippet": r.get("preview").and_then(|v| v.as_str()).unwrap_or("")
            })
        })
        .collect();
    Ok(json!({ "pages": pages }).to_string())
}

pub(super) fn get_wiki_page(
    state: &AppState,
    user: &AuthedUser,
    args: &Value,
) -> Result<String, ApiError> {
    let pk = trimmed_string_arg(args, "projectKey");
    let pid = trimmed_string_arg(args, "projectId");
    let page_id = trimmed_string_arg(args, "pageId");
    let title = trimmed_string_arg(args, "title");
    let text = crate::mcp::task_wiki::get_wiki_page_for_user(
        state,
        user,
        pk.as_deref(),
        pid.as_deref(),
        page_id.as_deref(),
        title.as_deref(),
    )
    .map_err(|e| ApiError::bad_request(format!("{e:#}")))?;
    Ok(text)
}

pub(super) fn create_wiki_page(
    state: &AppState,
    user: &AuthedUser,
    args: &Value,
) -> Result<String, ApiError> {
    let pk = trimmed_string_arg(args, "projectKey");
    let pid = trimmed_string_arg(args, "projectId");
    let title = trimmed_string_arg(args, "title");
    let from_body = args.get("body").and_then(|v| v.as_str());
    let from_content = args.get("content").and_then(|v| v.as_str());
    let content = from_content.or(from_body).map(|s| s.to_string());
    let title = title.ok_or_else(|| ApiError::bad_request("title is required"))?;
    let text = crate::mcp::task_wiki::create_wiki_page_for_user(
        state,
        user,
        pk.as_deref(),
        pid.as_deref(),
        &title,
        content.as_deref(),
    )
    .map_err(|e| ApiError::bad_request(format!("{e:#}")))?;
    Ok(text)
}

pub(super) fn update_wiki_page(
    state: &AppState,
    user: &AuthedUser,
    args: &Value,
) -> Result<String, ApiError> {
    let pk = trimmed_string_arg(args, "projectKey");
    let pid = trimmed_string_arg(args, "projectId");
    let page_id = trimmed_string_arg(args, "pageId").or_else(|| trimmed_string_arg(args, "wikiPageId"));
    let title =
        trimmed_string_arg(args, "wikiPageTitle").or_else(|| trimmed_string_arg(args, "title"));
    let from_body = args.get("body").and_then(|v| v.as_str());
    let from_content = args.get("content").and_then(|v| v.as_str());
    let content = from_content
        .or(from_body)
        .map(|s| s.to_string())
        .ok_or_else(|| ApiError::bad_request("content is required"))?;
    let mode = trimmed_string_arg(args, "mode");
    let text = crate::mcp::task_wiki::update_wiki_page_for_user(
        state,
        user,
        pk.as_deref(),
        pid.as_deref(),
        page_id.as_deref(),
        title.as_deref(),
        &content,
        mode.as_deref(),
    )
    .map_err(|e| ApiError::bad_request(format!("{e:#}")))?;
    Ok(text)
}
