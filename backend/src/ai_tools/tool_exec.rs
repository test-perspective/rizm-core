use chrono::Local;
use serde_json::{json, Value};

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::permissions::can_read;
use crate::ApiError;

use super::tool_exec_admin;
use super::ToolCall;

pub(super) fn parse_tool_calls(message: &Value) -> Vec<ToolCall> {
    let Some(calls) = message.get("tool_calls").and_then(|c| c.as_array()) else {
        return vec![];
    };
    calls
        .iter()
        .filter_map(|c| {
            let id = c.get("id")?.as_str()?.to_string();
            let func = c.get("function")?;
            let name = func.get("name")?.as_str()?.to_string();
            let args_str = func
                .get("arguments")
                .and_then(|v| v.as_str())
                .unwrap_or("{}");
            let arguments = serde_json::from_str::<Value>(args_str).unwrap_or_else(|_| json!({}));
            Some(ToolCall {
                id,
                name,
                arguments,
            })
        })
        .collect()
}

pub(super) async fn append_tool_calls(
    mut messages: Vec<Value>,
    assistant_message: Value,
    state: &AppState,
    user: &AuthedUser,
    tool_calls: &[ToolCall],
) -> Result<Vec<Value>, ApiError> {
    messages.push(assistant_message);
    for call in tool_calls {
        let content = execute_tool_call(state, user, call).await?;
        messages.push(json!({
            "role": "tool",
            "tool_call_id": call.id,
            "content": content
        }));
    }
    Ok(messages)
}

/// Runs on a blocking thread: all handlers use `db.blocking_read()` or equivalent.
fn execute_tool_call_sync(
    state: &AppState,
    user: &AuthedUser,
    call: &ToolCall,
) -> Result<String, ApiError> {
    const ADMIN_TOOLS: &[&str] = &[
        "list_users",
        "get_user",
        "bulk_delete_users",
        "create_user",
        "update_user",
        "reset_password",
        "list_groups",
        "create_group",
        "update_group",
        "delete_group",
        "add_member_to_group",
        "remove_member_from_group",
        "get_group_members",
        "get_user_groups",
        "get_project_policy",
        "grant_project_user_access",
    ];
    if ADMIN_TOOLS.iter().any(|n| *n == call.name.as_str()) {
        return tool_exec_admin::execute_admin_tool(state, user, call);
    }
    match call.name.as_str() {
        "list_projects" => list_projects(state, user),
        "search_projects" => search_projects(state, user, &call.arguments),
        "get_project_manifest" => get_project_manifest(state, user, &call.arguments),
        "get_current_datetime" => get_current_datetime(),
        "list_tasks" => list_tasks(state, user, &call.arguments),
        "search_tasks" => search_tasks(state, user, &call.arguments),
        "get_task" => get_task(state, user, &call.arguments),
        "add_comment" => add_comment(state, user, &call.arguments),
        "search_wiki" => search_wiki(state, user, &call.arguments),
        "get_wiki_page" => get_wiki_page(state, user, &call.arguments),
        "create_wiki_page" => create_wiki_page(state, user, &call.arguments),
        _ => Ok(json!({ "error": "unknown tool" }).to_string()),
    }
}

async fn execute_tool_call(
    state: &AppState,
    user: &AuthedUser,
    call: &ToolCall,
) -> Result<String, ApiError> {
    if call.name.as_str() == "fetch_url" {
        return fetch_url(&call.arguments).await;
    }
    let state = state.clone();
    let user = user.clone();
    let call = call.clone();
    tokio::task::spawn_blocking(move || execute_tool_call_sync(&state, &user, &call))
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "AI tool spawn_blocking join failed");
            ApiError::internal()
        })?
}

async fn fetch_url(args: &Value) -> Result<String, ApiError> {
    let url_str = args
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    crate::mcp::fetch_url::fetch_url(url_str)
        .await
        .map_err(|e| ApiError::bad_request(format!("{e}")))
}

pub(super) fn get_current_datetime() -> Result<String, ApiError> {
    let now = Local::now();
    let iso = now.to_rfc3339();
    let rfc2822 = now.to_rfc2822();
    Ok(json!({
        "iso8601": iso,
        "rfc2822": rfc2822,
        "timestampMs": now.timestamp_millis()
    })
    .to_string())
}

pub(super) fn list_projects(state: &AppState, user: &AuthedUser) -> Result<String, ApiError> {
    let db = state.db.blocking_read();
    let rows = db.list_projects_meta().map_err(|_| ApiError::internal())?;
    let mut projects = Vec::new();
    for (id, name, project_key, _lifecycle, _created_at, updated_at) in rows {
        if can_read(&db, &id, Some(user)).map_err(|_| ApiError::internal())? {
            projects.push(json!({
                "id": id,
                "name": name,
                "projectKey": project_key,
                "updatedAt": updated_at
            }));
        }
    }
    Ok(json!({ "projects": projects }).to_string())
}

pub(super) fn search_projects(
    state: &AppState,
    user: &AuthedUser,
    args: &Value,
) -> Result<String, ApiError> {
    let query = args
        .get("query")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_lowercase();
    if query.is_empty() {
        return Ok(json!({ "projects": [] }).to_string());
    }

    let db = state.db.blocking_read();
    let rows = db.list_projects_meta().map_err(|_| ApiError::internal())?;
    let mut projects = Vec::new();
    for (id, name, project_key, _lifecycle, _created_at, updated_at) in rows {
        if !can_read(&db, &id, Some(user)).map_err(|_| ApiError::internal())? {
            continue;
        }
        let key = project_key.clone().unwrap_or_default();
        let haystack = format!("{} {}", name, key).to_lowercase();
        if haystack.contains(&query) {
            projects.push(json!({
                "id": id,
                "name": name,
                "projectKey": project_key,
                "updatedAt": updated_at
            }));
        }
    }

    Ok(json!({ "projects": projects }).to_string())
}

pub(super) fn list_tasks(
    state: &AppState,
    user: &AuthedUser,
    args: &Value,
) -> Result<String, ApiError> {
    let pk = args
        .get("projectKey")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let pid = args
        .get("projectId")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let limit = args
        .get("limit")
        .and_then(|v| v.as_i64())
        .unwrap_or(50)
        .clamp(1, 100) as usize;
    crate::mcp::task_wiki::list_tasks_for_user(
        state,
        user,
        pk.as_deref().filter(|s| !s.is_empty()),
        pid.as_deref().filter(|s| !s.is_empty()),
        limit,
    )
    .map_err(|e| ApiError::bad_request(format!("{e:#}")))
}

pub(super) fn search_tasks(
    state: &AppState,
    user: &AuthedUser,
    args: &Value,
) -> Result<String, ApiError> {
    let query = args
        .get("query")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let pk = args
        .get("projectKey")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let pid = args
        .get("projectId")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let labels = args
        .get("labels")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect::<Vec<String>>()
        })
        .filter(|v| !v.is_empty());
    let status = args
        .get("status")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let priority = args
        .get("priority")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let has_property_filters = labels.as_ref().map(|v| !v.is_empty()).unwrap_or(false)
        || status.is_some()
        || priority.is_some();
    if query.is_none() && !has_property_filters {
        return Ok(json!({
            "error": "query or property filters (labels, status, priority) required"
        })
        .to_string());
    }
    let max_i = if has_property_filters { 100i64 } else { 20i64 };
    let limit = args
        .get("limit")
        .and_then(|v| v.as_i64())
        .unwrap_or(10)
        .clamp(1, max_i) as usize;
    crate::mcp::task_wiki::search_tasks_for_user(
        state,
        user,
        query.as_deref(),
        pk.as_deref().filter(|s| !s.is_empty()),
        pid.as_deref().filter(|s| !s.is_empty()),
        labels.as_deref(),
        status.as_deref(),
        priority.as_deref(),
        limit,
    )
    .map_err(|e| ApiError::bad_request(format!("{e:#}")))
}

pub(super) fn get_task(
    state: &AppState,
    user: &AuthedUser,
    args: &Value,
) -> Result<String, ApiError> {
    let from_task_key = args
        .get("taskKey")
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let from_entity_id = args
        .get("entity_id")
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let from_entity_id_camel = args
        .get("entityId")
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let task_key = if let Some(k) = from_task_key {
        k
    } else if let Some(k) = from_entity_id {
        k
    } else if let Some(k) = from_entity_id_camel {
        k
    } else {
        String::new()
    };
    if task_key.is_empty() {
        return Ok(json!({ "error": "taskKey, entity_id, or entityId is required (same task key as MCP read_entity)" }).to_string());
    }
    let props = crate::mcp::tools::read_entity_by_task_key_for_user(state, user, &task_key)
        .map_err(|e| ApiError::bad_request(format!("{e:#}")))?;
    Ok(json!({ "task": props }).to_string())
}

pub(super) fn add_comment(
    state: &AppState,
    user: &AuthedUser,
    args: &Value,
) -> Result<String, ApiError> {
    crate::mcp::tools::add_comment_for_target(state, user, args)
        .map_err(|e| ApiError::bad_request(format!("{e:#}")))
}

pub(super) fn get_project_manifest(
    state: &AppState,
    user: &AuthedUser,
    args: &Value,
) -> Result<String, ApiError> {
    let project_id = args
        .get("projectId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if project_id.is_empty() {
        return Ok(json!({ "error": "projectId is required" }).to_string());
    }
    let db = state.db.blocking_read();
    if !can_read(&db, &project_id, Some(user)).map_err(|_| ApiError::internal())? {
        return Ok(json!({ "error": "forbidden" }).to_string());
    }
    let manifest = db
        .get_manifest_with_etag(&project_id)
        .map_err(|_| ApiError::internal())?
        .map(|(m, _)| m);
    match manifest {
        None => Ok(json!({ "error": "not found" }).to_string()),
        Some(m) => Ok(json!({ "projectId": project_id, "manifest": m }).to_string()),
    }
}

fn search_wiki(state: &AppState, user: &AuthedUser, args: &Value) -> Result<String, ApiError> {
    let query = args
        .get("query")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if query.is_empty() {
        return Ok(json!({ "pages": [] }).to_string());
    }
    let pk = args
        .get("projectKey")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let pid = args
        .get("projectId")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let limit = args
        .get("limit")
        .and_then(|v| v.as_i64())
        .unwrap_or(5)
        .clamp(1, 20) as usize;

    let text = crate::mcp::task_wiki::search_wiki_for_user(
        state,
        user,
        &query,
        pk.as_deref().filter(|s| !s.is_empty()),
        pid.as_deref().filter(|s| !s.is_empty()),
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

fn get_wiki_page(state: &AppState, user: &AuthedUser, args: &Value) -> Result<String, ApiError> {
    let pk = args
        .get("projectKey")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let pid = args
        .get("projectId")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let page_id = args
        .get("pageId")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let title = args
        .get("title")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let text = crate::mcp::task_wiki::get_wiki_page_for_user(
        state,
        user,
        pk.as_deref().filter(|s| !s.is_empty()),
        pid.as_deref().filter(|s| !s.is_empty()),
        page_id.as_deref().filter(|s| !s.is_empty()),
        title.as_deref().filter(|s| !s.is_empty()),
    )
    .map_err(|e| ApiError::bad_request(format!("{e:#}")))?;
    Ok(text)
}

fn create_wiki_page(state: &AppState, user: &AuthedUser, args: &Value) -> Result<String, ApiError> {
    let pk = args
        .get("projectKey")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let pid = args
        .get("projectId")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());
    let title = args
        .get("title")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let from_body = args.get("body").and_then(|v| v.as_str());
    let from_content = args.get("content").and_then(|v| v.as_str());
    let content = from_content.or(from_body).map(|s| s.to_string());
    let title = title.ok_or_else(|| ApiError::bad_request("title is required"))?;
    let text = crate::mcp::task_wiki::create_wiki_page_for_user(
        state,
        user,
        pk.as_deref().filter(|s| !s.is_empty()),
        pid.as_deref().filter(|s| !s.is_empty()),
        &title,
        content.as_deref(),
    )
    .map_err(|e| ApiError::bad_request(format!("{e:#}")))?;
    Ok(text)
}
