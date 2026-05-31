//! Pure helpers for wiki subtree move: parent-id access, sort keys, URL rewrite, subtree walk.

use serde_json::Map;
use std::collections::{HashMap, HashSet};

use crate::models::Entity;

pub(super) fn parent_id_from_props(props: &Map<String, serde_json::Value>) -> Option<String> {
    props.get("parentId").and_then(|v| {
        if v.is_null() {
            None
        } else {
            v.as_str().map(|s| s.to_string())
        }
    })
}

pub(super) fn wiki_sort_key(e: &Entity) -> (i64, i64, String) {
    let order = e
        .properties
        .get("__keelOrder")
        .and_then(|v| v.as_f64())
        .map(|f| f as i64)
        .unwrap_or(0);
    (order, e.created_at, e.id.clone())
}

pub(super) fn rewrite_project_in_attachment_urls(
    s: &str,
    from_proj: &str,
    to_proj: &str,
) -> String {
    if from_proj == to_proj {
        return s.to_string();
    }
    let from_pat = format!("/api/projects/{}/entities/", from_proj);
    let to_pat = format!("/api/projects/{}/entities/", to_proj);
    s.replace(&from_pat, &to_pat)
}

pub(super) fn collect_subtree_ids(
    root_id: &str,
    wiki_by_id: &HashMap<String, Entity>,
) -> anyhow::Result<Vec<String>> {
    if !wiki_by_id.contains_key(root_id) {
        anyhow::bail!("wiki page not found");
    }
    let mut children_by_parent: HashMap<Option<String>, Vec<String>> = HashMap::new();
    for e in wiki_by_id.values() {
        let pid = parent_id_from_props(&e.properties);
        children_by_parent
            .entry(pid)
            .or_default()
            .push(e.id.clone());
    }
    let mut out = Vec::new();
    let mut queue = vec![root_id.to_string()];
    let mut seen = HashSet::new();
    while let Some(id) = queue.pop() {
        if !seen.insert(id.clone()) {
            continue;
        }
        out.push(id.clone());
        if let Some(children) = children_by_parent.get(&Some(id)) {
            for c in children {
                queue.push(c.clone());
            }
        }
    }
    Ok(out)
}

pub(super) fn insert_root_into_sibling_order(
    mut sibling_ids: Vec<String>,
    root_id: &str,
    before_page_id: Option<&str>,
) -> Vec<String> {
    sibling_ids.retain(|id| id != root_id);
    match before_page_id {
        None => {
            sibling_ids.push(root_id.to_string());
            sibling_ids
        }
        Some(before) => {
            if let Some(idx) = sibling_ids.iter().position(|x| x == before) {
                sibling_ids.insert(idx, root_id.to_string());
            } else {
                sibling_ids.push(root_id.to_string());
            }
            sibling_ids
        }
    }
}
