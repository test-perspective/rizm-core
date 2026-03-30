//! Wiki page operations for MCP and AI Tools.

use anyhow::Context;
use serde_json::{json, Value};

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::permissions::can_write;
use crate::search::indexer::enqueue_entity_upsert;

use super::project::resolve_project;

/// Search wiki pages using vector search.
pub fn search_wiki_for_user(
    state: &AppState,
    user: &AuthedUser,
    query: &str,
    project_key: Option<&str>,
    project_id: Option<&str>,
    limit: usize,
) -> anyhow::Result<String> {
    let (scope, pid) = if project_key.filter(|s| !s.trim().is_empty()).is_some()
        || project_id.filter(|s| !s.trim().is_empty()).is_some()
    {
        let project = resolve_project(state, user, project_key, project_id)?;
        ("project", Some(project.id))
    } else {
        ("global", None)
    };

    let results = crate::search::run_search(
        state,
        user,
        query,
        scope,
        pid.as_deref(),
        &["wikiPage"],
        limit,
    )
    .map_err(|e| anyhow::anyhow!("{e:?}"))?;

    Ok(super::tasks::serialize_search_results(&results))
}

/// Get a wiki page by project + pageId or title.
pub fn get_wiki_page_for_user(
    state: &AppState,
    user: &AuthedUser,
    project_key: Option<&str>,
    project_id: Option<&str>,
    page_id: Option<&str>,
    title: Option<&str>,
) -> anyhow::Result<String> {
    let project = resolve_project(state, user, project_key, project_id)?;

    let db = state.db.blocking_read();
    let entities = db
        .list_entities_for_project(&project.id)
        .with_context(|| format!("list entities for project {}", project.id))?;

    let wiki_entities: Vec<_> = entities
        .into_iter()
        .filter(|e| e.entity_id == "wikiPage")
        .collect();

    if wiki_entities.is_empty() {
        anyhow::bail!("wiki page not found");
    }

    if let Some(pid) = page_id.filter(|s| !s.trim().is_empty()) {
        let wiki = wiki_entities
            .into_iter()
            .find(|e| e.id == pid)
            .ok_or_else(|| anyhow::anyhow!("wiki page not found for pageId={pid}"))?;
        return Ok(serialize_wiki_page(&wiki));
    }

    if let Some(t) = title.filter(|s| !s.trim().is_empty()) {
        let mut matches = wiki_entities
            .into_iter()
            .filter(|e| {
                e.properties
                    .get("title")
                    .and_then(Value::as_str)
                    .map(|s| s == t)
                    .unwrap_or(false)
            });
        let first = matches
            .next()
            .ok_or_else(|| anyhow::anyhow!("wiki page not found for title={t}"))?;
        if matches.next().is_some() {
            anyhow::bail!("wiki page title is ambiguous: {t}");
        }
        return Ok(serialize_wiki_page(&first));
    }

    anyhow::bail!("pageId or title is required")
}

fn serialize_wiki_page(e: &crate::models::Entity) -> String {
    let title = e
        .properties
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("Untitled")
        .to_string();
    let doc = e
        .properties
        .get("doc")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    json!({
        "page": {
            "id": e.id,
            "title": title,
            "updatedAt": e.updated_at,
            "doc": doc
        }
    })
    .to_string()
}

const WIKI_ORDER_KEY: &str = "__keelOrder";
const WIKI_ORDER_GAP: i64 = 1000;

/// Create a new wiki page.
pub fn create_wiki_page_for_user(
    state: &AppState,
    user: &AuthedUser,
    project_key: Option<&str>,
    project_id: Option<&str>,
    title: &str,
    content: Option<&str>,
) -> anyhow::Result<String> {
    let title = title.trim();
    if title.is_empty() {
        anyhow::bail!("title is required");
    }

    let project = resolve_project(state, user, project_key, project_id)?;
    let db = state.db.blocking_read();
    let can_ok = can_write(&db, &project.id, Some(user))
        .context("check write permission")?;
    if !can_ok {
        anyhow::bail!("insufficient permissions for project {}", project.project_key);
    }

    let doc = match content.and_then(|c| {
        let t = c.trim();
        if t.is_empty() {
            None
        } else {
            Some(t)
        }
    }) {
        Some(c) => crate::mcp::markdown::markdown_to_blocknote_doc(c)?,
        None => "[]".to_string(),
    };

    let entities = db
        .list_entities_for_project(&project.id)
        .with_context(|| format!("list entities for project {}", project.id))?;
    let wiki_pages: Vec<_> = entities.into_iter().filter(|e| e.entity_id == "wikiPage").collect();
    let max_order = wiki_pages
        .iter()
        .filter_map(|e| {
            e.properties
                .get(WIKI_ORDER_KEY)
                .and_then(Value::as_i64)
        })
        .max()
        .unwrap_or(-WIKI_ORDER_GAP);
    let new_order = max_order + WIKI_ORDER_GAP;

    let mut properties = serde_json::Map::new();
    properties.insert("title".to_string(), Value::String(title.to_string()));
    properties.insert("doc".to_string(), Value::String(doc));
    properties.insert(WIKI_ORDER_KEY.to_string(), Value::Number(serde_json::Number::from(new_order)));

    let entity = db
        .create_entity_for_project(&project.id, None, "wikiPage", properties)
        .with_context(|| format!("create wiki page in project {}", project.id))?;

    enqueue_entity_upsert(state.clone(), project.id.clone(), entity.clone());

    Ok(json!({
        "pageId": entity.id,
        "title": entity.properties.get("title").and_then(Value::as_str).unwrap_or("Untitled"),
        "updatedAt": entity.updated_at
    })
    .to_string())
}
