//! Task listing and search for MCP and AI Tools.

use anyhow::Context;
use serde_json::{json, Value};

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::db::ProjectMeta;
use crate::search::text_extract::extract_entity_text;
use crate::search::{run_search, SearchResult};

use super::project::resolve_project;

/// List tasks for a project.
pub fn list_tasks_for_user(
    state: &AppState,
    user: &AuthedUser,
    project_key: Option<&str>,
    project_id: Option<&str>,
    limit: usize,
) -> anyhow::Result<String> {
    let project = resolve_project(state, user, project_key, project_id)?;
    let limit = limit.clamp(1, 100);

    let db = state.db.blocking_read();
    let entities = db
        .list_entities_for_project(&project.id)
        .with_context(|| format!("list entities for project {}", project.id))?;

    let mut tasks: Vec<Value> = Vec::new();
    for e in entities.into_iter().filter(|e| e.entity_id == "task" || e.entity_id == "item") {
        let task_key = e
            .properties
            .get("taskKey")
            .and_then(Value::as_str)
            .map(|s| s.to_string());
        let title = e
            .properties
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("Untitled")
            .to_string();
        tasks.push(json!({
            "id": e.id,
            "taskKey": task_key,
            "title": title,
            "updatedAt": e.updated_at,
            "properties": e.properties
        }));
    }

    tasks.sort_by(|a, b| {
        let a_ts = a.get("updatedAt").and_then(|v| v.as_i64()).unwrap_or(0);
        let b_ts = b.get("updatedAt").and_then(|v| v.as_i64()).unwrap_or(0);
        b_ts.cmp(&a_ts)
    });
    let total_count = tasks.len();
    tasks.truncate(limit);

    Ok(json!({
        "projectId": project.id,
        "projectKey": project.project_key,
        "totalCount": total_count,
        "tasks": tasks
    })
    .to_string())
}

/// Search tasks. Supports semantic search and property filters.
pub fn search_tasks_for_user(
    state: &AppState,
    user: &AuthedUser,
    query: Option<&str>,
    project_key: Option<&str>,
    project_id: Option<&str>,
    labels: Option<&[String]>,
    status: Option<&str>,
    priority: Option<&str>,
    limit: usize,
) -> anyhow::Result<String> {
    let has_property_filters = labels.map(|v| !v.is_empty()).unwrap_or(false)
        || status.filter(|s| !s.trim().is_empty()).is_some()
        || priority.filter(|s| !s.trim().is_empty()).is_some();

    if has_property_filters {
        let project = resolve_project(state, user, project_key, project_id)?;
        let results = search_tasks_by_properties(
            state,
            user,
            &project,
            query,
            labels,
            status,
            priority,
            limit,
        )?;
        return Ok(results);
    }

    let query = query.unwrap_or("").trim();
    if query.is_empty() {
        return Ok(json!({ "results": [] }).to_string());
    }

    let (scope, pid) = if project_key.filter(|s| !s.trim().is_empty()).is_some()
        || project_id.filter(|s| !s.trim().is_empty()).is_some()
    {
        let project = resolve_project(state, user, project_key, project_id)?;
        ("project", Some(project.id))
    } else {
        ("global", None)
    };

    let results = run_search(
        state,
        user,
        query,
        scope,
        pid.as_deref(),
        &["task"],
        limit,
    )
    .map_err(|e| anyhow::anyhow!("{e:?}"))?;

    Ok(serialize_search_results(&results))
}

fn search_tasks_by_properties(
    state: &AppState,
    _user: &AuthedUser,
    project: &ProjectMeta,
    query: Option<&str>,
    labels: Option<&[String]>,
    status: Option<&str>,
    priority: Option<&str>,
    limit: usize,
) -> anyhow::Result<String> {
    let db = state.db.blocking_read();
    let entities = db
        .list_entities_for_project(&project.id)
        .with_context(|| format!("list entities for project {}", project.id))?;

    let mut tasks: Vec<&crate::models::Entity> = entities
        .iter()
        .filter(|e| e.entity_id == "task" || e.entity_id == "item")
        .collect();

    if let Some(labels_filter) = labels.filter(|v| !v.is_empty()) {
        let labels_set: std::collections::HashSet<String> = labels_filter
            .iter()
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty())
            .collect();
        if !labels_set.is_empty() {
            tasks.retain(|e| {
                let task_labels = parse_labels_from_property(e.properties.get("labels"));
                task_labels
                    .iter()
                    .any(|l| labels_set.contains(&l.to_lowercase()))
            });
        }
    }

    if let Some(s) = status.filter(|s| !s.trim().is_empty()) {
        let s = s.trim();
        tasks.retain(|e| {
            e.properties
                .get("status")
                .and_then(Value::as_str)
                .map(|v: &str| v.trim().eq_ignore_ascii_case(s))
                .unwrap_or(false)
        });
    }

    if let Some(p) = priority.filter(|s| !s.trim().is_empty()) {
        let p = p.trim();
        tasks.retain(|e| {
            e.properties
                .get("priority")
                .and_then(Value::as_str)
                .map(|v: &str| v.trim().eq_ignore_ascii_case(p))
                .unwrap_or(false)
        });
    }

    if let Some(q) = query.filter(|s| !s.trim().is_empty()) {
        let q_lower = q.trim().to_lowercase();
        tasks.retain(|e| {
            let text = extract_entity_text(e);
            let haystack = format!("{} {}", text.title, text.content).to_lowercase();
            haystack.contains(&q_lower)
        });
    }

    tasks.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    tasks.truncate(limit);

    let items: Vec<Value> = tasks
        .iter()
        .map(|e| {
            let title = e
                .properties
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or("Untitled")
                .to_string();
            let task_key = e
                .properties
                .get("taskKey")
                .and_then(Value::as_str)
                .map(|s| s.to_string());
            json!({
                "kind": "task",
                "projectId": project.id,
                "projectName": project.name,
                "entityPk": e.id,
                "title": title,
                "preview": "",
                "taskKey": task_key,
                "distance": 0.0,
                "updatedAt": e.updated_at
            })
        })
        .collect();

    Ok(json!({ "results": items }).to_string())
}

fn parse_labels_from_property(v: Option<&Value>) -> Vec<String> {
    let Some(v) = v else { return vec![] };
    if let Some(arr) = v.as_array() {
        return arr
            .iter()
            .filter_map(|x| x.as_str())
            .map(|s: &str| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
    }
    if let Some(s) = v.as_str() {
        return s
            .split(|c| c == ',' || c == ';' || c == '\n' || c == '\t')
            .map(|p| p.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
    }
    vec![]
}

pub fn serialize_search_results(results: &[SearchResult]) -> String {
    let items: Vec<Value> = results
        .iter()
        .map(|r| {
            json!({
                "kind": r.kind,
                "projectId": r.project_id,
                "projectName": r.project_name,
                "entityPk": r.entity_pk,
                "title": r.title,
                "preview": r.preview,
                "taskKey": r.task_key,
                "distance": r.distance,
                "updatedAt": r.updated_at
            })
        })
        .collect();
    json!({ "results": items }).to_string()
}
