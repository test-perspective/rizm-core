//! Re-issue task keys in the destination project and rebuild the moved
//! properties around them.

use std::collections::HashMap;

use serde_json::{Map, Value};

use super::relations::{rewrite_relations_for_moved, RemovedKeys};
use crate::models::Entity;

pub(super) const PREVIOUS_KEYS_PROP: &str = "previousTaskKeys";
pub(super) const ORDER_PROP: &str = "__keelOrder";
pub(super) const ORDER_GAP: f64 = 1000.0;

/// Assign `{DEST_KEY}-{n}` to each task in assignment order.
///
/// Returns the old-key to new-key map plus the value the destination counter has
/// to be bumped to. Counters never move backwards, so the vacated source numbers
/// are never re-issued and the old keys stay unique forever.
pub(super) fn allocate_keys(
    dest_project_key: &str,
    start_seq: i64,
    ordered_ids: &[String],
    old_key_by_id: &HashMap<String, String>,
) -> (HashMap<String, String>, HashMap<String, String>, i64) {
    let mut new_key_by_old: HashMap<String, String> = HashMap::new();
    let mut new_key_by_id: HashMap<String, String> = HashMap::new();
    let mut seq = start_seq;

    for id in ordered_ids {
        let new_key = format!("{dest_project_key}-{seq}");
        if let Some(old) = old_key_by_id.get(id) {
            new_key_by_old.insert(old.clone(), new_key.clone());
        }
        new_key_by_id.insert(id.clone(), new_key);
        seq += 1;
    }

    (new_key_by_old, new_key_by_id, seq)
}

/// Build the properties a moved task gets in the destination project.
pub(super) fn build_moved_properties(
    entity: &Entity,
    new_key: &str,
    old_key: &str,
    new_key_by_old: &HashMap<String, String>,
    order: f64,
    updated_by: &str,
) -> (Map<String, Value>, RemovedKeys) {
    let mut props = entity.properties.clone();

    props.insert("taskKey".to_string(), Value::String(new_key.to_string()));

    let mut previous: Vec<String> = match props.get(PREVIOUS_KEYS_PROP) {
        Some(Value::Array(a)) => a.iter().filter_map(|v| v.as_str()).map(str::to_string).collect(),
        _ => vec![],
    };
    if !previous.iter().any(|k| k == old_key) {
        previous.push(old_key.to_string());
    }
    props.insert(
        PREVIOUS_KEYS_PROP.to_string(),
        Value::Array(previous.into_iter().map(Value::String).collect()),
    );

    let removed = rewrite_relations_for_moved(&mut props, new_key_by_old);

    // Inline taskLink nodes inside rich text keep pointing at the moved set.
    for value in props.values_mut() {
        rewrite_task_links(value, new_key_by_old);
    }

    props.insert(ORDER_PROP.to_string(), Value::from(order));
    props.insert("updatedBy".to_string(), Value::String(updated_by.to_string()));

    (props, removed)
}

/// Re-point BlockNote `taskLink` inline nodes at the moved tasks' new keys.
///
/// Rich text is stored either as a nested JSON value or as a JSON string, so
/// string values that parse as JSON are walked too and re-serialised when they
/// actually changed.
pub(super) fn rewrite_task_links(value: &mut Value, new_key_by_old: &HashMap<String, String>) -> bool {
    match value {
        Value::Object(map) => {
            let mut changed = false;
            let is_task_link = map.get("type").and_then(Value::as_str) == Some("taskLink");
            if is_task_link {
                if let Some(Value::Object(node_props)) = map.get_mut("props") {
                    if let Some(Value::String(key)) = node_props.get_mut("taskKey") {
                        if let Some(next) = new_key_by_old.get(key.as_str()) {
                            *key = next.clone();
                            changed = true;
                        }
                    }
                }
            }
            for v in map.values_mut() {
                changed |= rewrite_task_links(v, new_key_by_old);
            }
            changed
        }
        Value::Array(items) => {
            let mut changed = false;
            for v in items {
                changed |= rewrite_task_links(v, new_key_by_old);
            }
            changed
        }
        Value::String(s) => {
            let trimmed = s.trim();
            if !(trimmed.starts_with('{') || trimmed.starts_with('[')) {
                return false;
            }
            let Ok(mut parsed) = serde_json::from_str::<Value>(trimmed) else {
                return false;
            };
            if !rewrite_task_links(&mut parsed, new_key_by_old) {
                return false;
            }
            let Ok(next) = serde_json::to_string(&parsed) else {
                return false;
            };
            *s = next;
            true
        }
        _ => false,
    }
}
