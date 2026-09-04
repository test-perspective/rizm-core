//! MCP dispatch for wiki page tools (list / search / get / create / update).

use anyhow::Context;
use serde_json::Value;

use crate::app_state::AppState;
use crate::auth::AuthedUser;

use super::jsonrpc::read_string_arg;

/// Handle a wiki tool call. `name` must be one of the wiki tool names.
pub fn wiki_tool_call(
    state: &AppState,
    user: &AuthedUser,
    name: &str,
    args: &Value,
) -> anyhow::Result<Value> {
    match name {
        "list_wiki_pages" => {
            let pk = read_string_arg(args, &["projectKey", "project_key"]);
            let pid = read_string_arg(args, &["projectId", "project_id"]);
            let limit = args
                .get("limit")
                .and_then(Value::as_i64)
                .unwrap_or(50)
                .clamp(1, 100) as usize;
            let text = super::task_wiki::list_wiki_pages_for_user(
                state,
                user,
                pk.as_deref(),
                pid.as_deref(),
                limit,
            )?;
            Ok(super::jsonrpc::tool_text_result(text))
        }
        "search_wiki" => {
            let query = read_string_arg(args, &["query", "q"])
                .context("missing required argument: query")?;
            let pk = read_string_arg(args, &["projectKey", "project_key"]);
            let pid = read_string_arg(args, &["projectId", "project_id"]);
            let limit = args
                .get("limit")
                .and_then(Value::as_i64)
                .unwrap_or(10)
                .clamp(1, 20) as usize;
            let text = super::task_wiki::search_wiki_for_user(
                state,
                user,
                &query,
                pk.as_deref(),
                pid.as_deref(),
                limit,
            )?;
            Ok(super::jsonrpc::tool_text_result(text))
        }
        "get_wiki_page" => {
            let pk = read_string_arg(args, &["projectKey", "project_key"]);
            let pid = read_string_arg(args, &["projectId", "project_id"]);
            let page_id = read_string_arg(args, &["pageId", "page_id"]);
            let title = read_string_arg(args, &["wikiPageTitle", "wiki_page_title", "title"]);
            let text = super::task_wiki::get_wiki_page_for_user(
                state,
                user,
                pk.as_deref(),
                pid.as_deref(),
                page_id.as_deref(),
                title.as_deref(),
            )?;
            Ok(super::jsonrpc::tool_text_result(text))
        }
        "create_wiki_page" => {
            let pk = read_string_arg(args, &["projectKey", "project_key"]);
            let pid = read_string_arg(args, &["projectId", "project_id"]);
            let title =
                read_string_arg(args, &["title"]).context("missing required argument: title")?;
            let content = read_string_arg(args, &["content", "body"]);
            let text = super::task_wiki::create_wiki_page_for_user(
                state,
                user,
                pk.as_deref(),
                pid.as_deref(),
                &title,
                content.as_deref(),
            )?;
            Ok(super::jsonrpc::tool_text_result(text))
        }
        "update_wiki_page" => {
            let pk = read_string_arg(args, &["projectKey", "project_key"]);
            let pid = read_string_arg(args, &["projectId", "project_id"]);
            let page_id = read_string_arg(args, &["pageId", "page_id", "wikiPageId", "wiki_page_id"]);
            let title = read_string_arg(args, &["wikiPageTitle", "wiki_page_title", "title"]);
            let content = read_string_arg(args, &["content", "body"])
                .context("missing required argument: content")?;
            let mode = read_string_arg(args, &["mode"]);
            let text = super::task_wiki::update_wiki_page_for_user(
                state,
                user,
                pk.as_deref(),
                pid.as_deref(),
                page_id.as_deref(),
                title.as_deref(),
                &content,
                mode.as_deref(),
            )?;
            Ok(super::jsonrpc::tool_text_result(text))
        }
        _ => anyhow::bail!("unknown wiki tool: {name}"),
    }
}
