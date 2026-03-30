use anyhow::Context;
use serde_json::{json, Value};

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::models::Entity;
use crate::task_key::parse_task_key_and_project;

use super::jsonrpc::read_string_arg;
use super::markdown::markdown_to_blocknote_doc;

pub async fn tools_call(state: &AppState, user: &AuthedUser, params: Value) -> anyhow::Result<Value> {
    let obj = params
        .as_object()
        .context("tools/call params must be an object")?;

    let name = obj
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    let args = obj
        .get("arguments")
        .or_else(|| obj.get("args"))
        .cloned()
        .unwrap_or_else(|| Value::Object(Default::default()));

    // `tokio::sync::RwLock::blocking_read` must not run on the async runtime worker; run DB-heavy tools on the blocking pool.
    if name == "fetch_url" {
        let url_str = read_string_arg(&args, &["url"]).unwrap_or_default();
        let text = super::fetch_url::fetch_url(&url_str).await?;
        return Ok(super::jsonrpc::tool_text_result(text));
    }

    let state = state.clone();
    let user = user.clone();
    tokio::task::spawn_blocking(move || tools_call_blocking(&state, &user, &name, &args))
        .await
        .map_err(|e| anyhow::anyhow!("tools_call worker: {e}"))?
}

fn tools_call_blocking(state: &AppState, user: &AuthedUser, name: &str, args: &Value) -> anyhow::Result<Value> {
    match name {
        "read_entity" => {
            let entity_id = read_string_arg(args, &["entity_id", "entityId"])
                .context("missing required argument: entity_id")?;
            let props = read_entity_by_task_key_for_user(state, user, &entity_id)?;
            let text = serde_json::to_string_pretty(&props).context("serialize entity properties")?;
            Ok(super::jsonrpc::tool_text_result(text))
        }
        "add_comment" => {
            let text = add_comment_for_target(state, user, args)?;
            Ok(super::jsonrpc::tool_text_result(text))
        }
        "list_tasks" => {
            let pk = read_string_arg(args, &["projectKey", "project_key"]);
            let pid = read_string_arg(args, &["projectId", "project_id"]);
            let limit = args
                .get("limit")
                .and_then(Value::as_i64)
                .unwrap_or(50)
                .clamp(1, 100) as usize;
            let text = super::task_wiki::list_tasks_for_user(
                state, user, pk.as_deref(), pid.as_deref(), limit,
            )?;
            Ok(super::jsonrpc::tool_text_result(text))
        }
        "search_tasks" => {
            let query = read_string_arg(args, &["query", "q"]);
            let pk = read_string_arg(args, &["projectKey", "project_key"]);
            let pid = read_string_arg(args, &["projectId", "project_id"]);
            let labels = super::jsonrpc::read_string_array_arg(args, &["labels"]);
            let status = read_string_arg(args, &["status"]);
            let priority = read_string_arg(args, &["priority"]);
            let has_property_filters = labels.as_ref().map(|v| !v.is_empty()).unwrap_or(false)
                || status.is_some()
                || priority.is_some();
            let max_i = if has_property_filters { 100i64 } else { 20i64 };
            let limit = args
                .get("limit")
                .and_then(Value::as_i64)
                .unwrap_or(10)
                .clamp(1, max_i) as usize;
            if query.is_none() && !has_property_filters {
                anyhow::bail!("query or property filters (labels, status, priority) required");
            }
            let text = super::task_wiki::search_tasks_for_user(
                state,
                user,
                query.as_deref(),
                pk.as_deref(),
                pid.as_deref(),
                labels.as_deref(),
                status.as_deref(),
                priority.as_deref(),
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
                state, user, &query, pk.as_deref(), pid.as_deref(), limit,
            )?;
            Ok(super::jsonrpc::tool_text_result(text))
        }
        "get_wiki_page" => {
            let pk = read_string_arg(args, &["projectKey", "project_key"]);
            let pid = read_string_arg(args, &["projectId", "project_id"]);
            let page_id = read_string_arg(args, &["pageId", "page_id"]);
            let title = read_string_arg(args, &["wikiPageTitle", "wiki_page_title", "title"]);
            let text = super::task_wiki::get_wiki_page_for_user(
                state, user, pk.as_deref(), pid.as_deref(),
                page_id.as_deref(), title.as_deref(),
            )?;
            Ok(super::jsonrpc::tool_text_result(text))
        }
        "create_wiki_page" => {
            let pk = read_string_arg(args, &["projectKey", "project_key"]);
            let pid = read_string_arg(args, &["projectId", "project_id"]);
            let title = read_string_arg(args, &["title"])
                .context("missing required argument: title")?;
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
        _ => Ok(super::jsonrpc::tool_error_result(format!("unknown tool: {name}"))),
    }
}

pub fn read_entity_by_task_key_for_user(
    state: &AppState,
    user: &AuthedUser,
    task_key: &str,
) -> anyhow::Result<serde_json::Map<String, Value>> {
    let (project_key, canonical_task_key) = parse_task_key_and_project(task_key)
        .with_context(|| format!("invalid entity_id (expected taskKey like PROJ-123): {task_key}"))?;

    let db = state.db.blocking_read();
    let project = db
        .get_project_meta_by_key(&project_key)
        .context("lookup project by projectKey")?
        .ok_or_else(|| anyhow::anyhow!("project not found for projectKey={project_key}"))?;

    let can_read = crate::permissions::can_read(&db, &project.id, Some(user))
        .context("check read permission")?;
    if !can_read {
        anyhow::bail!("insufficient permissions for project {project_key}");
    }

    let entities = db
        .list_entities_for_project(&project.id)
        .with_context(|| format!("list entities for project {}", project.id))?;

    let task = entities
        .iter()
        .find(|e| {
            e.entity_id == "task"
                && e.properties
                    .get("taskKey")
                    .and_then(Value::as_str)
                    .map(|s| s == canonical_task_key.as_str())
                    .unwrap_or(false)
        })
        .ok_or_else(|| anyhow::anyhow!("task not found: {canonical_task_key}"))?;

    Ok(task.properties.clone())
}

pub fn add_comment_for_target(state: &AppState, user: &AuthedUser, args: &Value) -> anyhow::Result<String> {
    let target_type = read_string_arg(args, &["targetType", "target_type"])
        .unwrap_or_else(|| "task".to_string())
        .to_lowercase();
    let text = read_string_arg(args, &["text", "body", "content"])
        .context("missing required argument: text")?;
    let doc = markdown_to_blocknote_doc(&text)?;

    let (project_id, target_label, entity) = match target_type.as_str() {
        "task" => resolve_task_target_for_write(state, user, args)?,
        "wiki" => resolve_wiki_target_for_write(state, user, args)?,
        _ => anyhow::bail!("invalid targetType (expected 'task' or 'wiki')"),
    };

    let now = crate::time::now_ms();
    let comment_id = uuid::Uuid::new_v4().to_string();
    let new_comment = json!({
        "id": comment_id,
        "createdAt": now,
        "author": {
            "id": user.user_id,
            "name": user.email
        },
        "doc": doc
    });

    let updated = append_comment_with_retry(state, &project_id, &entity, user, new_comment)?;
    let count = updated
        .properties
        .get("comments")
        .and_then(Value::as_array)
        .map(|a| a.len())
        .unwrap_or(0);

    Ok(format!(
        "comment added: target={target_label} entityId={} commentId={} createdAt={} totalComments={count}",
        entity.id, comment_id, now
    ))
}

fn resolve_task_target_for_write(
    state: &AppState,
    user: &AuthedUser,
    args: &Value,
) -> anyhow::Result<(String, String, Entity)> {
    let task_key = read_string_arg(args, &["taskKey", "task_key", "entity_id", "entityId"])
        .context("missing required argument: taskKey")?;
    let (project_key, canonical_task_key) = parse_task_key_and_project(&task_key)
        .with_context(|| format!("invalid taskKey (expected PROJ-123): {task_key}"))?;
    let db = state.db.blocking_read();
    let project = db
        .get_project_meta_by_key(&project_key)
        .context("lookup project by projectKey")?
        .ok_or_else(|| anyhow::anyhow!("project not found for projectKey={project_key}"))?;
    ensure_can_write_db(&db, user, &project.id, &project_key)?;

    let entities = db
        .list_entities_for_project(&project.id)
        .with_context(|| format!("list entities for project {}", project.id))?;
    let task = entities
        .into_iter()
        .find(|e| {
            e.entity_id == "task"
                && e.properties
                    .get("taskKey")
                    .and_then(Value::as_str)
                    .map(|s| s == canonical_task_key.as_str())
                    .unwrap_or(false)
        })
        .ok_or_else(|| anyhow::anyhow!("entity not found: {canonical_task_key}"))?;

    Ok((project.id, format!("task:{canonical_task_key}"), task))
}

fn resolve_wiki_target_for_write(
    state: &AppState,
    user: &AuthedUser,
    args: &Value,
) -> anyhow::Result<(String, String, Entity)> {
    let project_key = read_string_arg(args, &["projectKey", "project_key"])
        .context("missing required argument: projectKey")?;
    let db = state.db.blocking_read();
    let project = db
        .get_project_meta_by_key(&project_key)
        .context("lookup project by projectKey")?
        .ok_or_else(|| anyhow::anyhow!("project not found for projectKey={project_key}"))?;
    ensure_can_write_db(&db, user, &project.id, &project.project_key)?;

    let entities = db
        .list_entities_for_project(&project.id)
        .with_context(|| format!("list entities for project {}", project.id))?;
    let wiki_entities: Vec<Entity> = entities
        .into_iter()
        .filter(|e| e.entity_id == "wikiPage")
        .collect();
    if wiki_entities.is_empty() {
        anyhow::bail!("wiki page not found");
    }

    if let Some(page_id) = read_string_arg(args, &["wikiPageId", "wiki_page_id", "pageId", "page_id"]) {
        let wiki = wiki_entities
            .into_iter()
            .find(|e| e.id == page_id)
            .ok_or_else(|| anyhow::anyhow!("wiki page not found for wikiPageId={page_id}"))?;
        return Ok((project.id, format!("wiki:id:{page_id}"), wiki));
    }

    let title = read_string_arg(args, &["wikiPageTitle", "wiki_page_title", "title"])
        .context("missing required argument: wikiPageTitle or wikiPageId")?;
    let mut matches = wiki_entities.into_iter().filter(|e| {
        e.properties
            .get("title")
            .and_then(Value::as_str)
            .map(|s| s == title.as_str())
            .unwrap_or(false)
    });
    let first = matches.next().ok_or_else(|| anyhow::anyhow!("wiki page not found for title={title}"))?;
    if matches.next().is_some() {
        anyhow::bail!("wiki page title is ambiguous: {title}");
    }
    Ok((project.id, format!("wiki:title:{title}"), first))
}

fn ensure_can_write_db(
    db: &crate::db::Db,
    user: &AuthedUser,
    project_id: &str,
    project_key: &str,
) -> anyhow::Result<()> {
    let can_write = crate::permissions::can_write(db, project_id, Some(user))
        .context("check write permission")?;
    if can_write {
        Ok(())
    } else {
        anyhow::bail!("insufficient permissions for project {project_key}")
    }
}

fn append_comment_with_retry(
    state: &AppState,
    project_id: &str,
    entity: &Entity,
    user: &AuthedUser,
    new_comment: Value,
) -> anyhow::Result<Entity> {
    let entity_pk = entity.id.as_str();
    for attempt in 0..2 {
        let db = state.db.blocking_read();
        let current = db
            .get_entity_for_project(project_id, entity_pk)
            .with_context(|| format!("get entity {entity_pk}"))?
            .ok_or_else(|| anyhow::anyhow!("entity not found"))?;

        let existing_comments = current
            .properties
            .get("comments")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let mut next_comments = Vec::with_capacity(existing_comments.len() + 1);
        next_comments.push(new_comment.clone());
        next_comments.extend(existing_comments);

        let mut patch = serde_json::Map::new();
        patch.insert("comments".to_string(), Value::Array(next_comments));
        patch.insert("updatedBy".to_string(), Value::String(user.user_id.clone()));

        match db.patch_entity_for_project(project_id, entity_pk, current.updated_at, patch) {
            Ok(updated) => return Ok(updated),
            Err(crate::db::EntityWriteError::Conflict { .. }) if attempt == 0 => continue,
            Err(crate::db::EntityWriteError::Conflict { current_updated_at }) => {
                anyhow::bail!("conflict while updating comments (current updatedAt={current_updated_at})")
            }
            Err(crate::db::EntityWriteError::NotFound) => anyhow::bail!("entity not found"),
            Err(crate::db::EntityWriteError::ServiceUnavailable) => {
                anyhow::bail!("database temporarily unavailable")
            }
        }
    }
    anyhow::bail!("failed to append comment")
}
