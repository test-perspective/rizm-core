//! Rewire the task-key relations touched by a move.
//!
//! `parentTaskKey`, `blockedBy` and `link` all store task keys, and
//! `validate_relation_targets` rejects keys whose prefix is not the owning
//! project. So a move must re-point references that stay inside the moved set
//! and drop the ones that would end up crossing projects.

use std::collections::{HashMap, HashSet};

use serde_json::{Map, Value};

use super::collect::PARENT_PROP;
use crate::task_key::parse_task_key_and_project;

pub(super) const ARRAY_RELATION_PROPS: [&str; 2] = ["blockedBy", "link"];

/// `(property name, keys that were removed)`.
pub(super) type RemovedKeys = Vec<(String, Vec<String>)>;

fn canonical(raw: &str) -> Option<String> {
    parse_task_key_and_project(raw).ok().map(|(_, k)| k)
}

fn read_key_list(v: Option<&Value>) -> Vec<String> {
    match v {
        Some(Value::Array(a)) => a.iter().filter_map(|x| x.as_str()).map(str::to_string).collect(),
        Some(Value::String(s)) if !s.trim().is_empty() => vec![s.clone()],
        _ => vec![],
    }
}

fn write_key_list(props: &mut Map<String, Value>, prop: &str, keys: Vec<String>) {
    props.insert(
        prop.to_string(),
        Value::Array(keys.into_iter().map(Value::String).collect()),
    );
}

/// `parentTaskKey` is a single key everywhere it is validated, but the link input
/// can leave several behind. Write one back as a plain string, keep the array
/// shape when the data really does hold more, and drop the property when nothing
/// is left.
fn write_parent_keys(props: &mut Map<String, Value>, keys: Vec<String>) {
    match keys.len() {
        0 => {
            props.remove(PARENT_PROP);
        }
        1 => {
            props.insert(PARENT_PROP.to_string(), Value::String(keys[0].clone()));
        }
        _ => write_key_list(props, PARENT_PROP, keys),
    }
}

/// Split a relation property into the keys that survive and the ones that do not,
/// preserving order and dropping duplicates.
fn partition_keys(
    raw: Vec<String>,
    keep: impl Fn(&str) -> Option<String>,
) -> (Vec<String>, Vec<String>) {
    let mut kept: Vec<String> = vec![];
    let mut dropped: Vec<String> = vec![];
    for entry in raw {
        let Some(key) = canonical(&entry) else { continue };
        match keep(&key) {
            Some(next) => {
                if !kept.contains(&next) {
                    kept.push(next);
                }
            }
            None => {
                if !dropped.contains(&key) {
                    dropped.push(key);
                }
            }
        }
    }
    (kept, dropped)
}

/// Rewrite the relations of a task that is moving.
///
/// Keys pointing at another moved task are re-pointed at its new key; keys
/// pointing outside the moved set are dropped and reported.
pub(super) fn rewrite_relations_for_moved(
    props: &mut Map<String, Value>,
    new_key_by_old: &HashMap<String, String>,
) -> RemovedKeys {
    let mut removed: RemovedKeys = vec![];

    if props.contains_key(PARENT_PROP) {
        let (kept, dropped) = partition_keys(read_key_list(props.get(PARENT_PROP)), |key| {
            new_key_by_old.get(key).cloned()
        });
        write_parent_keys(props, kept);
        if !dropped.is_empty() {
            removed.push((PARENT_PROP.to_string(), dropped));
        }
    }

    for prop in ARRAY_RELATION_PROPS {
        if !props.contains_key(prop) {
            continue;
        }
        let (kept, dropped) = partition_keys(read_key_list(props.get(prop)), |key| {
            new_key_by_old.get(key).cloned()
        });
        write_key_list(props, prop, kept);
        if !dropped.is_empty() {
            removed.push((prop.to_string(), dropped));
        }
    }

    removed
}

/// Drop references to moved tasks from a task that stays behind.
///
/// Returns `None` when nothing changed, so the caller can skip the write.
pub(super) fn strip_relations_to_moved(
    props: &mut Map<String, Value>,
    moved_old_keys: &HashSet<String>,
) -> Option<RemovedKeys> {
    let mut removed: RemovedKeys = vec![];

    let keep_if_staying = |key: &str| {
        if moved_old_keys.contains(key) {
            None
        } else {
            Some(key.to_string())
        }
    };

    if props.contains_key(PARENT_PROP) {
        let (kept, dropped) = partition_keys(read_key_list(props.get(PARENT_PROP)), keep_if_staying);
        if !dropped.is_empty() {
            write_parent_keys(props, kept);
            removed.push((PARENT_PROP.to_string(), dropped));
        }
    }

    for prop in ARRAY_RELATION_PROPS {
        if !props.contains_key(prop) {
            continue;
        }
        let (kept, dropped) = partition_keys(read_key_list(props.get(prop)), keep_if_staying);
        if dropped.is_empty() {
            continue;
        }
        write_key_list(props, prop, kept);
        removed.push((prop.to_string(), dropped));
    }

    if removed.is_empty() {
        None
    } else {
        Some(removed)
    }
}
