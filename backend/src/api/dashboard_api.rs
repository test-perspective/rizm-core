use std::collections::{HashMap, HashSet};

use axum::{
    extract::{Query, State},
    routing::get,
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::permissions::can_read;
use crate::ApiError;
use support::{filter_self_updates, mark_seen_if_new, normalize_section_title, section_matches};

// NOTE: This should match the default in me_api.rs for a smooth UX.
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FeedQuery {
    #[serde(default)]
    limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DashboardPolicy {
    #[serde(default)]
    #[allow(dead_code)]
    version: Option<u32>,
    #[serde(default)]
    sections: Vec<DashboardSection>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DashboardSection {
    id: String,
    title: String,
    #[serde(default)]
    filter: Option<SectionFilter>,
    #[serde(default)]
    limits: Option<SectionLimits>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SectionFilter {
    #[serde(default)]
    entity_types: Option<Vec<String>>,
    #[serde(default)]
    actions: Option<Vec<String>>,
    #[serde(default)]
    relation: Option<RelationFilter>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RelationFilter {
    #[serde(default)]
    task_property_keys: Option<Vec<String>>,
    #[serde(default, rename = "match")]
    match_: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SectionLimits {
    #[serde(default)]
    parents: Option<u32>,
    #[serde(default)]
    children_per_parent: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct ActivityMeta {
    entity_type: String,
    entity_id: String,
    entity_title: String,
    project_id: String,
    #[serde(default)]
    changes: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardFeedResponse {
    sections: Vec<DashboardSectionResponse>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSectionResponse {
    id: String,
    title: String,
    items: Vec<DashboardParentNode>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DashboardParentNode {
    key: String,
    project_id: String,
    project_name: String,
    entity_type: String,
    entity_id: String,
    entity_title: String,
    children: Vec<DashboardChildNode>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DashboardChildNode {
    id: String,
    action: String,
    created_at: i64,
    actor_user_id: Option<String>,
    actor_user_email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    changes: Option<Value>,
}

mod support;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/dashboard/feed", get(get_dashboard_feed))
}

async fn get_dashboard_feed(
    State(state): State<AppState>,
    Extension(user): Extension<AuthedUser>,
    Query(q): Query<FeedQuery>,
) -> Result<Json<DashboardFeedResponse>, ApiError> {
    let limit = q.limit.unwrap_or(500).min(2000) as i64;

    let db = state.db.read().await;

    // Determine which projects this user can read (global dashboard spans projects).
    let projects = db.list_projects_meta().map_err(|_| ApiError::internal())?;
    let mut project_name_by_id: HashMap<String, String> = HashMap::new();
    let mut readable_project_ids: HashSet<String> = HashSet::new();
    for (pid, name, _key, _lifecycle, _created_at, _updated_at) in projects {
        project_name_by_id.insert(pid.clone(), name);
        let ok = can_read(&db, &pid, Some(&user)).map_err(|_| ApiError::internal())?;
        if ok {
            readable_project_ids.insert(pid);
        }
    }

    // Load the user's policy (or default).
    let policy_json = db
        .get_user_dashboard_policy_json(&user.user_id)
        .map_err(|_| ApiError::internal())?
        .unwrap_or_else(|| DEFAULT_DASHBOARD_POLICY_JSON.to_string());
    let policy: DashboardPolicy = serde_json::from_str(&policy_json).unwrap_or(DashboardPolicy { version: Some(1), sections: vec![] });

    // Fetch activity logs.
    let logs = db
        .list_audit_logs(limit, 0, None, None, Some(true))
        .map_err(|_| ApiError::internal())?;

    // Group by (project_id, entity_type, entity_id).
    let mut grouped: HashMap<(String, String, String), (ActivityMeta, Vec<(crate::db::AuditLogRecord, Option<Value>)>)> = HashMap::new();
    for log in logs {
        let Some(meta_raw) = log.meta_json.clone() else {
            continue;
        };
        let meta: ActivityMeta = match serde_json::from_str(&meta_raw) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if !readable_project_ids.contains(&meta.project_id) {
            continue;
        }
        let changes = meta.changes.clone();
        let key = (meta.project_id.clone(), meta.entity_type.clone(), meta.entity_id.clone());
        grouped.entry(key).or_insert_with(|| (meta, vec![])).1.push((log, changes));
    }

    let actor_ids: Vec<String> = grouped
        .values()
        .flat_map(|(_, rows)| rows.iter().filter_map(|(r, _)| r.actor_user_id.clone()))
        .filter(|s| !s.is_empty())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    let email_by_id = db
        .get_emails_by_user_ids(&actor_ids)
        .map_err(|_| ApiError::internal())?;

    // Convert to parent nodes (children sorted by created_at desc already from query).
    let mut parents: Vec<DashboardParentNode> = Vec::new();
    for ((_pid, _etype, _eid), (meta, rows)) in grouped {
        let project_name = project_name_by_id.get(&meta.project_id).cloned().unwrap_or_else(|| meta.project_id.clone());
        let key = format!("{}:{}:{}", meta.project_id, meta.entity_type, meta.entity_id);
        let children = rows
            .into_iter()
            .map(|(r, changes)| DashboardChildNode {
                id: r.id,
                action: r.action,
                created_at: r.created_at,
                actor_user_id: r.actor_user_id.clone(),
                actor_user_email: r.actor_user_id.as_ref().and_then(|id| email_by_id.get(id).cloned()),
                changes,
            })
            .collect::<Vec<_>>();
        parents.push(DashboardParentNode {
            key,
            project_id: meta.project_id,
            project_name,
            entity_type: meta.entity_type,
            entity_id: meta.entity_id,
            entity_title: meta.entity_title,
            children,
        });
    }

    // Remove self-authored updates (children), and drop empty parents.
    let mut parents = filter_self_updates(&user.user_id, parents);

    // Sort parents by most recent child update.
    parents.sort_by_key(|p| std::cmp::Reverse(p.children.first().map(|c| c.created_at).unwrap_or(0)));

    // Evaluate per-section filtering + limits.
    let mut entity_cache: HashMap<(String, String), Option<crate::models::Entity>> = HashMap::new();
    let mut out_sections: Vec<DashboardSectionResponse> = Vec::new();
    let mut seen_parent_keys: HashSet<String> = HashSet::new();
    for s in policy.sections {
        let limits = s.limits.unwrap_or(SectionLimits { parents: None, children_per_parent: None });
        let max_parents = limits.parents.unwrap_or(50) as usize;
        let max_children = limits.children_per_parent.unwrap_or(10) as usize;

        let mut items: Vec<DashboardParentNode> = Vec::new();
        for p in &parents {
            if !section_matches(&*db, &user, &mut entity_cache, p, s.filter.as_ref())? {
                continue;
            }
            if !mark_seen_if_new(&mut seen_parent_keys, &p.key) {
                continue;
            }
            let mut node = p.clone();
            if node.children.len() > max_children {
                node.children.truncate(max_children);
            }
            items.push(node);
            if items.len() >= max_parents {
                break;
            }
        }

        let title = normalize_section_title(&s.id, s.title);
        out_sections.push(DashboardSectionResponse { id: s.id, title, items });
    }

    Ok(Json(DashboardFeedResponse { sections: out_sections }))
}


