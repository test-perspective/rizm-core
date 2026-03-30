//! Shared search logic used by /api/search, MCP tools, and AI tools.

use rusqlite::params;
use serde::Serialize;
use std::collections::HashMap;

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::permissions::can_read;
use crate::search::indexer::{embed_query, enqueue_reindex_project};
use crate::search::text_extract::extract_entity_text;
use crate::ApiError;
use zerocopy::AsBytes;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub kind: String,
    pub project_id: String,
    pub project_name: String,
    pub entity_pk: String,
    pub title: String,
    pub preview: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_key: Option<String>,
    pub distance: f32,
    #[serde(skip_serializing)]
    pub lexical_score: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<i64>,
}

/// Run vector search across tasks and/or wiki pages.
/// - scope: "global" = all readable projects, "project" = single project
/// - types: e.g. ["task", "wikiPage"] or ["task"] or ["wikiPage"]
pub fn run_search(
    state: &AppState,
    user: &AuthedUser,
    q: &str,
    scope: &str,
    project_id: Option<&str>,
    types: &[&'static str],
    limit: usize,
) -> Result<Vec<SearchResult>, ApiError> {
    let q = q.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }
    let vec_k = vector_candidate_k(limit);

    let embedding = embed_query(q).map_err(|_| ApiError::internal())?;
    if embedding.is_empty() {
        return Ok(vec![]);
    }

    let db = state.db.blocking_read();
    let project_meta = db.list_projects_meta().map_err(|_| ApiError::internal())?;
    let mut project_name_by_id = HashMap::new();
    let mut allowed_projects = Vec::new();
    for (id, name, _key, _lifecycle, _created_at, _updated_at) in project_meta {
        if can_read(&db, &id, Some(user)).map_err(|_| ApiError::internal())? {
            project_name_by_id.insert(id.clone(), name);
            allowed_projects.push(id);
        }
    }

    let target_projects: Vec<String> = if scope == "project" {
        let pid = project_id.unwrap_or_default();
        if pid.is_empty() || !allowed_projects.contains(&pid.to_string()) {
            return Ok(vec![]);
        }
        vec![pid.to_string()]
    } else {
        allowed_projects
    };

    let mut candidates: HashMap<(String, String), SearchResult> = HashMap::new();
    let conn = db.pool.get().map_err(|_| ApiError::internal())?;
    let embedding_bytes = embedding.as_bytes().to_vec();

    for project_id in target_projects {
        if !has_project_index(&conn, &project_id) {
            enqueue_reindex_project(state.clone(), project_id.clone());
        }
        let project_name = project_name_by_id
            .get(&project_id)
            .cloned()
            .unwrap_or_else(|| project_id.clone());
        let mut sql = String::from(
            "SELECT project_id, entity_kind, entity_pk, title, content, distance
             FROM vec_entities
             WHERE embedding MATCH vec_f32(?1) AND k = ?2 AND project_id = ?3",
        );
        let mut params_vec: Vec<&dyn rusqlite::ToSql> = Vec::new();
        params_vec.push(&embedding_bytes);
        let k_i64 = vec_k;
        params_vec.push(&k_i64);
        params_vec.push(&project_id);

        match types {
            [single] => {
                sql.push_str(" AND entity_kind = ?4");
                params_vec.push(single);
            }
            [first, second] => {
                sql.push_str(" AND (entity_kind = ?4 OR entity_kind = ?5)");
                params_vec.push(first);
                params_vec.push(second);
            }
            _ => {}
        }

        let mut stmt = conn.prepare(&sql).map_err(|_| ApiError::internal())?;
        let rows = stmt
            .query_map(params_vec.as_slice(), |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, f32>(5)?,
                ))
            })
            .map_err(|_| ApiError::internal())?;

        for r in rows {
            let (pid, kind, entity_pk, title, content, distance) = r.map_err(|_| ApiError::internal())?;
            let key = (pid.clone(), entity_pk.clone());
            let existing = candidates.get(&key);
            if existing.map(|e| e.distance <= distance).unwrap_or(false) {
                continue;
            }
            let preview = truncate_preview(&content);
            candidates.insert(
                key,
                SearchResult {
                    kind,
                    project_id: pid,
                    project_name: project_name.clone(),
                    entity_pk,
                    title,
                    preview,
                    task_key: None,
                    distance,
                    lexical_score: 0,
                    updated_at: None,
                },
            );
        }
    }

    let mut results: Vec<SearchResult> = Vec::new();
    for mut r in candidates.into_values() {
        if !can_read(&db, &r.project_id, Some(user)).map_err(|_| ApiError::internal())? {
            continue;
        }
        let semantic_ok = score_from_distance(r.distance) >= 0.5;
        let entity = db
            .get_entity_for_project(&r.project_id, &r.entity_pk)
            .map_err(|_| ApiError::internal())?;
        if let Some(e) = entity {
            let content = extract_entity_text(&e).content;
            r.updated_at = Some(e.updated_at);
            if e.entity_id == "task" || e.entity_id == "item" {
                let task_key = e
                    .properties
                    .get("taskKey")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let title = e
                    .properties
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or(&r.title)
                    .to_string();
                r.title = title;
                r.preview = truncate_preview(&content);
                r.task_key = task_key;
                r.kind = "task".to_string();
                r.lexical_score = lexical_score(q, &r.title, &content);
                if r.lexical_score == 0 && !semantic_ok {
                    continue;
                }
            } else if e.entity_id == "wikiPage" {
                let title = e
                    .properties
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or(&r.title)
                    .to_string();
                r.title = title;
                r.preview = truncate_preview(&content);
                r.kind = "page".to_string();
                r.lexical_score = lexical_score(q, &r.title, &content);
                if r.lexical_score == 0 && !semantic_ok {
                    continue;
                }
            }
            results.push(r);
        }
    }

    results.sort_by(|a, b| {
        let lexical_order = b.lexical_score.cmp(&a.lexical_score);
        if lexical_order != std::cmp::Ordering::Equal {
            return lexical_order;
        }
        a.distance
            .partial_cmp(&b.distance)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    results.truncate(limit);
    Ok(results)
}

pub fn parse_types(raw: Option<&str>) -> Vec<&'static str> {
    let mut out = Vec::new();
    if let Some(s) = raw {
        let normalized = s.to_lowercase();
        for t in normalized.split(',').map(|v| v.trim()) {
            if t == "task" {
                out.push("task");
            } else if t == "page" {
                out.push("wikiPage");
            }
        }
    }
    if out.is_empty() {
        out.push("task");
        out.push("wikiPage");
    }
    if out.len() > 2 {
        out.truncate(2);
    }
    out
}

fn truncate_preview(s: &str) -> String {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let max_len = 200usize;
    let chars: Vec<char> = trimmed.chars().collect();
    if chars.len() <= max_len {
        return trimmed.to_string();
    }
    chars[..max_len].iter().collect()
}

fn score_from_distance(distance: f32) -> f32 {
    if !distance.is_finite() {
        return 0.0;
    }
    1.0 / (1.0 + distance.max(0.0))
}

fn lexical_score(query: &str, title: &str, content: &str) -> u32 {
    let query_phrase = query.trim().to_lowercase();
    if query_phrase.is_empty() {
        return 0;
    }
    let title_lc = title.to_lowercase();
    let content_lc = content.to_lowercase();
    let mut score = 0u32;
    if title_lc.contains(&query_phrase) {
        score += 120;
    }
    if content_lc.contains(&query_phrase) {
        score += 60;
    }
    let tokens = query
        .split_whitespace()
        .map(|t| t.trim().to_lowercase())
        .filter(|t| t.len() >= 2)
        .collect::<Vec<_>>();
    for token in tokens.iter().take(8) {
        if title_lc.contains(token) {
            score += 20;
        }
        if content_lc.contains(token) {
            score += 8;
        }
    }
    score
}

fn vector_candidate_k(limit: usize) -> i64 {
    let expanded = limit.saturating_mul(8);
    expanded.clamp(50, 200) as i64
}

fn has_project_index(conn: &rusqlite::Connection, project_id: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM vec_entities WHERE project_id = ?1 LIMIT 1",
        params![project_id],
        |_| Ok(()),
    )
    .is_ok()
}
