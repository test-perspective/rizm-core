//! Decide which tasks a move covers: the selected roots plus every descendant.
//!
//! Parent links are stored as task-key strings (`parentTaskKey`), not entity ids,
//! so the walk goes through a key index rather than the id graph used by the wiki
//! mover.

use std::collections::{HashMap, HashSet};

use crate::models::Entity;
use crate::task_key::parse_task_key_and_project;

/// Guard against a mis-clicked bulk selection dragging a whole project along.
pub(super) const MOVE_TASKS_MAX: usize = 500;

pub(super) const PARENT_PROP: &str = "parentTaskKey";

/// `task` is the current entity type; `item` is the legacy alias still recognised
/// across the codebase. Both are moved, and both must carry a `taskKey`.
pub(super) fn is_task_entity(e: &Entity) -> bool {
    matches!(e.entity_id.as_str(), "task" | "item")
}

pub(super) fn task_key_of(e: &Entity) -> Option<String> {
    let raw = e.properties.get("taskKey")?.as_str()?;
    parse_task_key_and_project(raw).ok().map(|(_, k)| k)
}

/// Read `parentTaskKey`, tolerating both the string and the single-element array
/// form that the MCP writers accept.
pub(super) fn parent_key_of(e: &Entity) -> Option<String> {
    let v = e.properties.get(PARENT_PROP)?;
    let raw = match v {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(a) => a.first()?.as_str()?.to_string(),
        _ => return None,
    };
    parse_task_key_and_project(&raw).ok().map(|(_, k)| k)
}

#[derive(Debug)]
pub(super) struct MoveSet {
    /// Entity ids in key-assignment order: roots in request order, then their
    /// descendants breadth-first, siblings by ascending task number.
    pub ordered_ids: Vec<String>,
    pub id_set: HashSet<String>,
    pub old_key_by_id: HashMap<String, String>,
    pub old_keys: HashSet<String>,
}

/// Collect the roots and their descendants. Cycles in broken data terminate
/// because a node is only expanded the first time it is seen.
pub(super) fn collect_move_set(
    root_ids: &[String],
    source_entities: &[Entity],
) -> anyhow::Result<MoveSet> {
    if root_ids.is_empty() {
        anyhow::bail!("no tasks selected");
    }

    let mut by_id: HashMap<&str, &Entity> = HashMap::new();
    let mut key_by_id: HashMap<String, String> = HashMap::new();
    let mut children_by_parent: HashMap<String, Vec<&Entity>> = HashMap::new();

    for e in source_entities.iter().filter(|e| is_task_entity(e)) {
        by_id.insert(e.id.as_str(), e);
        if let Some(key) = task_key_of(e) {
            key_by_id.insert(e.id.clone(), key);
        }
        if let Some(parent) = parent_key_of(e) {
            children_by_parent.entry(parent).or_default().push(e);
        }
    }
    for children in children_by_parent.values_mut() {
        children.sort_by_key(|e| (task_seq(&key_by_id, e), e.created_at, e.id.clone()));
    }

    let mut ordered_ids: Vec<String> = vec![];
    let mut id_set: HashSet<String> = HashSet::new();

    for root_id in root_ids {
        let Some(root) = by_id.get(root_id.as_str()) else {
            anyhow::bail!("task not found in source project: {root_id}");
        };
        if !key_by_id.contains_key(root_id) {
            anyhow::bail!("task has no taskKey: {root_id}");
        }
        let mut queue: Vec<&Entity> = vec![root];
        while let Some(cur) = queue.first().copied() {
            queue.remove(0);
            if !id_set.insert(cur.id.clone()) {
                continue;
            }
            ordered_ids.push(cur.id.clone());
            if ordered_ids.len() > MOVE_TASKS_MAX {
                anyhow::bail!("too many tasks to move (limit {MOVE_TASKS_MAX})");
            }
            if let Some(key) = key_by_id.get(&cur.id) {
                if let Some(children) = children_by_parent.get(key) {
                    queue.extend(children.iter().copied());
                }
            }
        }
    }

    // Descendants may lack a taskKey in legacy data; they cannot be re-keyed.
    for id in &ordered_ids {
        if !key_by_id.contains_key(id) {
            anyhow::bail!("task has no taskKey: {id}");
        }
    }

    let old_key_by_id: HashMap<String, String> = ordered_ids
        .iter()
        .map(|id| (id.clone(), key_by_id[id].clone()))
        .collect();
    let old_keys: HashSet<String> = old_key_by_id.values().cloned().collect();

    Ok(MoveSet {
        ordered_ids,
        id_set,
        old_key_by_id,
        old_keys,
    })
}

fn task_seq(key_by_id: &HashMap<String, String>, e: &Entity) -> i64 {
    key_by_id
        .get(&e.id)
        .and_then(|k| k.rsplit_once('-'))
        .and_then(|(_, n)| n.parse::<i64>().ok())
        .unwrap_or(i64::MAX)
}
