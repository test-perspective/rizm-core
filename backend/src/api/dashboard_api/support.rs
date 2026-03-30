use std::collections::{HashMap, HashSet};

use crate::auth::AuthedUser;
use crate::db::Db;
use crate::models::Entity;
use crate::ApiError;

use super::{DashboardParentNode, SectionFilter};

pub(super) fn filter_self_updates(user_id: &str, mut parents: Vec<DashboardParentNode>) -> Vec<DashboardParentNode> {
    for parent in parents.iter_mut() {
        parent
            .children
            .retain(|c| c.actor_user_id.as_deref() != Some(user_id));
    }
    parents
        .into_iter()
        .filter(|p| !p.children.is_empty())
        .collect()
}

pub(super) fn mark_seen_if_new(seen: &mut HashSet<String>, key: &str) -> bool {
    if seen.contains(key) {
        return false;
    }
    seen.insert(key.to_string());
    true
}

pub(super) fn normalize_section_title(id: &str, title: String) -> String {
    if id == "all" {
        "Other Updates".to_string()
    } else {
        title
    }
}

/// Uses the caller's DB handle (e.g. `read().await` guard). Do not call `blocking_read` here from an async worker.
pub(super) fn section_matches(
    db: &Db,
    user: &AuthedUser,
    entity_cache: &mut HashMap<(String, String), Option<Entity>>,
    parent: &DashboardParentNode,
    filter: Option<&SectionFilter>,
) -> Result<bool, ApiError> {
    let Some(filter) = filter else {
        return Ok(true);
    };

    if let Some(types) = &filter.entity_types {
        if !types.iter().any(|t| t == &parent.entity_type) {
            return Ok(false);
        }
    }

    if let Some(actions) = &filter.actions {
        let mut any = false;
        for c in &parent.children {
            if actions.iter().any(|pat| action_matches(pat, &c.action)) {
                any = true;
                break;
            }
        }
        if !any {
            return Ok(false);
        }
    }

    if let Some(rel) = &filter.relation {
        if rel.match_.as_deref() != Some("userId") {
            return Ok(false);
        }

        let mut keys = rel
            .task_property_keys
            .as_ref()
            .map(|v| v.iter().cloned().collect::<Vec<_>>())
            .unwrap_or_else(|| vec!["assigneeId".to_string(), "owner".to_string()]);
        if !keys.iter().any(|k| k == "createdBy") {
            keys.push("createdBy".to_string());
        }

        let cache_key = (parent.project_id.clone(), parent.entity_id.clone());
        let entity_opt = if let Some(cached) = entity_cache.get(&cache_key) {
            cached.clone()
        } else {
            let fetched = db
                .get_entity_for_project(&parent.project_id, &parent.entity_id)
                .map_err(|_| ApiError::internal())?;
            entity_cache.insert(cache_key.clone(), fetched.clone());
            fetched
        };
        let Some(entity) = entity_opt else {
            return Ok(false);
        };
        for k in keys {
            if let Some(v) = entity.properties.get(&k).and_then(|v| v.as_str()) {
                if v == user.user_id {
                    return Ok(true);
                }
            }
        }
        return Ok(false);
    }

    Ok(true)
}

fn action_matches(pattern: &str, action: &str) -> bool {
    let pat = pattern.trim();
    if pat == "*" {
        return true;
    }
    if let Some(prefix) = pat.strip_suffix('*') {
        return action.starts_with(prefix);
    }
    action == pat
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use crate::api::dashboard_api::{DashboardChildNode, DashboardParentNode};

    use super::{filter_self_updates, mark_seen_if_new, normalize_section_title};

    fn make_child(id: &str, actor_user_id: Option<&str>) -> DashboardChildNode {
        DashboardChildNode {
            id: id.to_string(),
            action: "TASK_UPDATED".to_string(),
            created_at: 1,
            actor_user_id: actor_user_id.map(|s| s.to_string()),
            actor_user_email: None,
            changes: None,
        }
    }

    fn make_parent(key: &str, children: Vec<DashboardChildNode>) -> DashboardParentNode {
        DashboardParentNode {
            key: key.to_string(),
            project_id: "p1".to_string(),
            project_name: "Project".to_string(),
            entity_type: "TASK".to_string(),
            entity_id: "t1".to_string(),
            entity_title: "Task".to_string(),
            children,
        }
    }

    #[test]
    fn filter_self_updates_removes_self_children_and_empty_parents() {
        let parents = vec![
            make_parent(
                "p1:task:1",
                vec![make_child("c1", Some("u1")), make_child("c2", Some("u2"))],
            ),
            make_parent("p1:task:2", vec![make_child("c3", Some("u1"))]),
        ];

        let filtered = filter_self_updates("u1", parents);

        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].children.len(), 1);
        assert_eq!(filtered[0].children[0].actor_user_id.as_deref(), Some("u2"));
    }

    #[test]
    fn mark_seen_if_new_dedupes_keys() {
        let mut seen: HashSet<String> = HashSet::new();
        assert!(mark_seen_if_new(&mut seen, "k1"));
        assert!(!mark_seen_if_new(&mut seen, "k1"));
        assert!(mark_seen_if_new(&mut seen, "k2"));
    }

    #[test]
    fn normalize_section_title_overrides_all() {
        assert_eq!(
            normalize_section_title("all", "All Updates".to_string()),
            "Other Updates"
        );
        assert_eq!(
            normalize_section_title("related", "Updates Related to Me".to_string()),
            "Updates Related to Me"
        );
    }
}
