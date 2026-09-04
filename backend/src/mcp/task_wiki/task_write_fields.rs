//! Field patch helpers for MCP task writes.

use serde_json::Value;

use crate::auth::AuthedUser;
use crate::models::Entity;

use super::task_relations::{BLOCKED_BY_PROP, LINK_PROP, PARENT_PROP};
use super::task_write_input::TaskUpdateInput;

/// Keys that must never come from the raw `patch` object: they either are owned by
/// the server (`createdBy`/`taskKey`) or have dedicated arguments that run
/// validation, which `patch` would bypass. Snake_case aliases are dropped too so
/// they cannot land as look-alike properties.
const RESERVED_PATCH_KEYS: &[&str] = &[
    "createdBy",
    "created_by",
    "updatedBy",
    "updated_by",
    "taskKey",
    "task_key",
    "labels",
    "addLabels",
    "add_labels",
    "removeLabels",
    "remove_labels",
    PARENT_PROP,
    "parent_task_key",
    BLOCKED_BY_PROP,
    "blocked_by",
    "addBlockedBy",
    "add_blocked_by",
    "removeBlockedBy",
    "remove_blocked_by",
    "blocks",
    LINK_PROP,
];

pub(super) fn build_task_patch(
    user: &AuthedUser,
    entity: &Entity,
    input: &TaskUpdateInput,
) -> anyhow::Result<serde_json::Map<String, Value>> {
    let mut patch = input.patch.clone().unwrap_or_default();
    for key in RESERVED_PATCH_KEYS {
        patch.remove(*key);
    }

    insert_optional_string(&mut patch, "title", input.title.as_deref());
    insert_optional_string(&mut patch, "status", input.status.as_deref());
    insert_optional_string(&mut patch, "priority", input.priority.as_deref());
    apply_label_updates(
        &mut patch,
        entity,
        input.labels.as_deref(),
        input.add_labels.as_deref(),
        input.remove_labels.as_deref(),
    );
    insert_optional_description(&mut patch, input.description.as_deref())?;
    patch.insert("updatedBy".to_string(), Value::String(user.user_id.clone()));
    Ok(patch)
}

pub(super) fn insert_optional_string(
    properties: &mut serde_json::Map<String, Value>,
    key: &str,
    value: Option<&str>,
) {
    if let Some(value) = value.map(str::trim).filter(|s| !s.is_empty()) {
        properties.insert(key.to_string(), Value::String(value.to_string()));
    }
}

pub(super) fn insert_optional_labels(
    properties: &mut serde_json::Map<String, Value>,
    labels: Option<&[String]>,
) {
    let Some(labels) = labels else { return };
    let values: Vec<Value> = labels
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| Value::String(s.to_string()))
        .collect();
    if !values.is_empty() {
        properties.insert("labels".to_string(), Value::Array(values));
    }
}

pub(super) fn insert_optional_description(
    properties: &mut serde_json::Map<String, Value>,
    description: Option<&str>,
) -> anyhow::Result<()> {
    let Some(description) = description.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(());
    };
    let doc = crate::mcp::markdown::markdown_to_blocknote_doc(description)?;
    properties.insert("Description".to_string(), Value::String(doc));
    Ok(())
}

fn labels_from_entity(entity: &Entity) -> Vec<String> {
    entity
        .properties
        .get("labels")
        .and_then(Value::as_array)
        .map(|arr| {
            normalize_label_list(
                &arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect::<Vec<_>>(),
            )
        })
        .unwrap_or_default()
}

fn normalize_label_list(labels: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    for label in labels {
        let trimmed = label.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !out.iter().any(|existing| existing == trimmed) {
            out.push(trimmed.to_string());
        }
    }
    out
}

fn merge_labels(
    current: &[String],
    replace: Option<&[String]>,
    add: Option<&[String]>,
    remove: Option<&[String]>,
) -> Vec<String> {
    let mut merged = if let Some(replace) = replace {
        normalize_label_list(replace)
    } else {
        current.to_vec()
    };

    if let Some(add) = add {
        for label in normalize_label_list(add) {
            if !merged.contains(&label) {
                merged.push(label);
            }
        }
    }

    if let Some(remove) = remove {
        let remove_set: std::collections::HashSet<String> =
            normalize_label_list(remove).into_iter().collect();
        merged.retain(|label| !remove_set.contains(label));
    }

    merged
}

fn apply_label_updates(
    patch: &mut serde_json::Map<String, Value>,
    entity: &Entity,
    labels: Option<&[String]>,
    add_labels: Option<&[String]>,
    remove_labels: Option<&[String]>,
) {
    if labels.is_none() && add_labels.is_none() && remove_labels.is_none() {
        return;
    }

    let current = labels_from_entity(entity);
    let merged = merge_labels(&current, labels, add_labels, remove_labels);
    if merged == current {
        return;
    }

    let values: Vec<Value> = merged.into_iter().map(Value::String).collect();
    patch.insert("labels".to_string(), Value::Array(values));
}
