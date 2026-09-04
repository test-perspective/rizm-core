//! Parent and dependency relations for MCP task create/update.

use anyhow::Context;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, LazyLock, Mutex, MutexGuard};

use crate::app_state::AppState;
use crate::models::Entity;
use crate::task_key::parse_task_key_and_project;

pub const PARENT_PROP: &str = "parentTaskKey";
pub const BLOCKED_BY_PROP: &str = "blockedBy";
pub const LINK_PROP: &str = "link";
pub const CREATING_SENTINEL: &str = "__creating__";

static PROJECT_RELATION_LOCKS: LazyLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> =
    LazyLock::new(Mutex::default);

/// Serializes relation-mutating task writes per project, so the entity snapshot
/// used for cycle validation cannot change before the write lands. Entity writes
/// outside MCP/AIA (the REST entity API) bypass this and are not validated at all.
pub struct RelationWriteLock(Arc<Mutex<()>>);

impl RelationWriteLock {
    pub fn for_project_key(project_key: &str) -> Self {
        let mut locks = PROJECT_RELATION_LOCKS
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        Self(
            locks
                .entry(project_key.to_ascii_uppercase())
                .or_default()
                .clone(),
        )
    }

    pub fn acquire(&self) -> MutexGuard<'_, ()> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }
}

pub fn task_key_of(entity: &Entity) -> Option<&str> {
    entity.properties.get("taskKey").and_then(Value::as_str)
}

pub fn task_keys_from_property(v: Option<&Value>) -> Vec<String> {
    let Some(v) = v else {
        return vec![];
    };
    if let Some(arr) = v.as_array() {
        return dedupe_nonempty(arr.iter().filter_map(Value::as_str));
    }
    if let Some(s) = v.as_str() {
        return dedupe_nonempty(std::iter::once(s));
    }
    vec![]
}

fn dedupe_nonempty<'a, I>(keys: I) -> Vec<String>
where
    I: Iterator<Item = &'a str>,
{
    let mut out = Vec::new();
    for key in keys {
        let trimmed = key.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !out.iter().any(|existing| existing == trimmed) {
            out.push(trimmed.to_string());
        }
    }
    out
}

pub fn normalize_relation_keys(keys: &[String]) -> anyhow::Result<Vec<String>> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for key in keys {
        let trimmed = key.trim();
        if trimmed.is_empty() {
            continue;
        }
        let (_, canonical) = parse_task_key_and_project(trimmed)
            .with_context(|| format!("invalid taskKey: {trimmed}"))?;
        if seen.insert(canonical.clone()) {
            out.push(canonical);
        }
    }
    Ok(out)
}

pub fn keys_to_json(keys: &[String]) -> Value {
    Value::Array(keys.iter().cloned().map(Value::String).collect())
}

pub fn validate_parent_keys(keys: &[String]) -> anyhow::Result<()> {
    if keys.len() > 1 {
        anyhow::bail!("parentTaskKey must be a single task key");
    }
    Ok(())
}

pub(super) fn project_tasks(entities: &[Entity]) -> Vec<&Entity> {
    entities.iter().filter(|e| e.entity_id == "task").collect()
}

pub(super) fn task_by_key<'a>(tasks: &[&'a Entity], key: &str) -> Option<&'a Entity> {
    tasks.iter().copied().find(|e| task_key_of(e) == Some(key))
}

pub(super) fn parent_of(entity: &Entity) -> Option<String> {
    task_keys_from_property(entity.properties.get(PARENT_PROP))
        .into_iter()
        .next()
}

pub(super) fn blocked_by_of(entity: &Entity) -> Vec<String> {
    task_keys_from_property(entity.properties.get(BLOCKED_BY_PROP))
}

pub fn validate_relation_targets(
    project_key: &str,
    self_key: &str,
    keys: &[String],
    entities: &[Entity],
    field: &str,
) -> anyhow::Result<()> {
    let tasks = project_tasks(entities);
    for key in keys {
        if key == self_key {
            anyhow::bail!("{field} cannot reference the same task ({key})");
        }
        let (prefix, _) = parse_task_key_and_project(key)
            .with_context(|| format!("invalid taskKey in {field}: {key}"))?;
        if prefix != project_key {
            anyhow::bail!("{field} target {key} is not in project {project_key}");
        }
        if task_by_key(&tasks, key).is_none() {
            anyhow::bail!("{field} target not found: {key}");
        }
    }
    Ok(())
}

fn parent_map(tasks: &[&Entity]) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for task in tasks {
        let Some(key) = task_key_of(task) else {
            continue;
        };
        if let Some(parent) = parent_of(task) {
            map.insert(key.to_string(), parent);
        }
    }
    map
}

fn blocked_by_map(tasks: &[&Entity]) -> HashMap<String, Vec<String>> {
    let mut map = HashMap::new();
    for task in tasks {
        let Some(key) = task_key_of(task) else {
            continue;
        };
        map.insert(key.to_string(), blocked_by_of(task));
    }
    map
}

fn parent_would_cycle(
    self_key: &str,
    parent: &str,
    parent_of_map: &HashMap<String, String>,
) -> bool {
    if self_key == parent {
        return true;
    }
    let mut current = parent;
    let mut seen = HashSet::new();
    seen.insert(self_key.to_string());
    while let Some(next) = parent_of_map.get(current) {
        if next == self_key {
            return true;
        }
        // A loop that does not pass through this task already exists in the data;
        // it is not this edit's fault, so stop walking instead of rejecting.
        if !seen.insert(next.clone()) {
            break;
        }
        current = next;
    }
    false
}

/// Whether `target` is reachable from `from` by following blockedBy edges. The
/// visited set keeps pre-existing loops in unrelated tasks from spinning forever.
fn reaches(graph: &HashMap<String, Vec<String>>, from: &str, target: &str) -> bool {
    let mut stack = vec![from.to_string()];
    let mut seen: HashSet<String> = HashSet::new();
    while let Some(node) = stack.pop() {
        if node == target {
            return true;
        }
        if !seen.insert(node.clone()) {
            continue;
        }
        if let Some(nexts) = graph.get(&node) {
            stack.extend(nexts.iter().cloned());
        }
    }
    false
}

pub fn merge_blocked_by(
    current: &[String],
    replace: Option<&[String]>,
    add: Option<&[String]>,
    remove: Option<&[String]>,
) -> Vec<String> {
    let mut merged = if let Some(replace) = replace {
        replace.to_vec()
    } else {
        current.to_vec()
    };
    if let Some(add) = add {
        for key in add {
            if !merged.iter().any(|existing| existing == key) {
                merged.push(key.clone());
            }
        }
    }
    if let Some(remove) = remove {
        let remove_set: HashSet<&str> = remove.iter().map(String::as_str).collect();
        merged.retain(|key| !remove_set.contains(key.as_str()));
    }
    merged
}

pub fn validate_task_relations(
    project_key: &str,
    self_key: &str,
    entities: &[Entity],
    parent: Option<&[String]>,
    next_blocked_by: Option<&[String]>,
    blocks: Option<&[String]>,
    link: Option<&[String]>,
) -> anyhow::Result<()> {
    if let Some(parent) = parent {
        validate_parent_keys(parent)?;
        validate_relation_targets(project_key, self_key, parent, entities, PARENT_PROP)?;
        if let Some(parent_key) = parent.first() {
            let tasks = project_tasks(entities);
            let mut map = parent_map(&tasks);
            map.remove(self_key);
            if parent_would_cycle(self_key, parent_key, &map) {
                anyhow::bail!("parentTaskKey would create a cycle");
            }
        }
    }

    if let Some(keys) = next_blocked_by {
        validate_relation_targets(project_key, self_key, keys, entities, BLOCKED_BY_PROP)?;
    }
    if let Some(keys) = blocks {
        validate_relation_targets(project_key, self_key, keys, entities, "blocks")?;
    }
    if let Some(keys) = link {
        validate_relation_targets(project_key, self_key, keys, entities, LINK_PROP)?;
    }

    if next_blocked_by.is_some() || blocks.is_some() {
        let tasks = project_tasks(entities);
        let mut graph = blocked_by_map(&tasks);
        // Only edges this edit adds can introduce a cycle. Cycles already present
        // in the data (the raw patch escape hatch has no validation) must not make
        // unrelated relation edits fail.
        let mut added_edges: Vec<(String, String)> = Vec::new();
        if let Some(keys) = next_blocked_by {
            let current = graph.get(self_key).cloned().unwrap_or_default();
            for key in keys {
                if !current.iter().any(|existing| existing == key) {
                    added_edges.push((self_key.to_string(), key.clone()));
                }
            }
            graph.insert(self_key.to_string(), keys.to_vec());
        } else {
            graph.entry(self_key.to_string()).or_default();
        }
        if let Some(targets) = blocks {
            for target in targets {
                let entry = graph.entry(target.clone()).or_default();
                if !entry.iter().any(|existing| existing == self_key) {
                    entry.push(self_key.to_string());
                    added_edges.push((target.clone(), self_key.to_string()));
                }
            }
        }
        for (from, to) in &added_edges {
            if from == to || reaches(&graph, to, from) {
                anyhow::bail!("blockedBy/blocks would create a cycle");
            }
        }
    }
    Ok(())
}

pub fn list_project_entities(state: &AppState, project_id: &str) -> anyhow::Result<Vec<Entity>> {
    let db = state.db.blocking_read();
    db.list_entities_for_project(project_id)
        .with_context(|| format!("list entities for project {project_id}"))
}
