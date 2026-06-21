//! Task write operations for MCP.

use anyhow::Context;
use serde_json::{json, Value};

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::db::ProjectMeta;
use crate::models::Entity;
use crate::permissions::can_write;
use crate::search::indexer::enqueue_entity_upsert;
use crate::task_key::parse_task_key_and_project;

use super::project::resolve_project;

pub fn create_task_for_user(
    state: &AppState,
    user: &AuthedUser,
    project_key: Option<&str>,
    project_id: Option<&str>,
    title: &str,
    description: Option<&str>,
    status: Option<&str>,
    priority: Option<&str>,
    labels: Option<&[String]>,
    task_key: Option<&str>,
) -> anyhow::Result<String> {
    let title = title.trim();
    if title.is_empty() {
        anyhow::bail!("title is required");
    }

    let project = resolve_project(state, user, project_key, project_id)?;
    let db = state.db.blocking_read();
    let can_ok = can_write(&db, &project.id, Some(user)).context("check write permission")?;
    if !can_ok {
        anyhow::bail!(
            "insufficient permissions for project {}",
            project.project_key
        );
    }

    let mut properties = serde_json::Map::new();
    properties.insert("title".to_string(), Value::String(title.to_string()));
    insert_optional_string(&mut properties, "status", status);
    insert_optional_string(&mut properties, "priority", priority);
    insert_optional_labels(&mut properties, labels);
    insert_optional_description(&mut properties, description)?;
    insert_optional_string(&mut properties, "taskKey", task_key);
    properties.insert("createdBy".to_string(), Value::String(user.user_id.clone()));
    properties.insert("updatedBy".to_string(), Value::String(user.user_id.clone()));

    let entity = db
        .create_entity_for_project(&project.id, None, "task", properties)
        .with_context(|| format!("create task in project {}", project.id))?;
    enqueue_entity_upsert(state.clone(), project.id.clone(), entity.clone());

    Ok(json!({
        "id": entity.id,
        "taskKey": entity.properties.get("taskKey").and_then(Value::as_str),
        "title": entity.properties.get("title").and_then(Value::as_str).unwrap_or("Untitled"),
        "updatedAt": entity.updated_at
    })
    .to_string())
}

pub fn update_task_for_user(
    state: &AppState,
    user: &AuthedUser,
    task_key: &str,
    title: Option<&str>,
    description: Option<&str>,
    status: Option<&str>,
    priority: Option<&str>,
    labels: Option<&[String]>,
    add_labels: Option<&[String]>,
    remove_labels: Option<&[String]>,
    patch: Option<&serde_json::Map<String, Value>>,
) -> anyhow::Result<String> {
    let (project, entity) = resolve_task_for_write(state, user, task_key)?;
    let patch = build_task_patch(
        user,
        &entity,
        title,
        description,
        status,
        priority,
        labels,
        add_labels,
        remove_labels,
        patch,
    )?;
    let changed_fields: Vec<String> = patch
        .keys()
        .filter(|k| k.as_str() != "updatedBy")
        .cloned()
        .collect();
    if changed_fields.is_empty() {
        anyhow::bail!("no task fields to update");
    }

    let updated = patch_task_with_retry(state, &project.id, &entity, user, patch)?;
    enqueue_entity_upsert(state.clone(), project.id.clone(), updated.clone());

    Ok(json!({
        "id": updated.id,
        "taskKey": updated.properties.get("taskKey").and_then(Value::as_str),
        "updatedAt": updated.updated_at,
        "changedFields": changed_fields
    })
    .to_string())
}

fn build_task_patch(
    user: &AuthedUser,
    entity: &Entity,
    title: Option<&str>,
    description: Option<&str>,
    status: Option<&str>,
    priority: Option<&str>,
    labels: Option<&[String]>,
    add_labels: Option<&[String]>,
    remove_labels: Option<&[String]>,
    raw_patch: Option<&serde_json::Map<String, Value>>,
) -> anyhow::Result<serde_json::Map<String, Value>> {
    let mut patch = raw_patch.cloned().unwrap_or_default();
    patch.remove("createdBy");
    patch.remove("updatedBy");
    patch.remove("taskKey");
    patch.remove("labels");
    patch.remove("addLabels");
    patch.remove("removeLabels");

    insert_optional_string(&mut patch, "title", title);
    insert_optional_string(&mut patch, "status", status);
    insert_optional_string(&mut patch, "priority", priority);
    apply_label_updates(&mut patch, entity, labels, add_labels, remove_labels);
    insert_optional_description(&mut patch, description)?;
    patch.insert("updatedBy".to_string(), Value::String(user.user_id.clone()));
    Ok(patch)
}

fn labels_from_entity(entity: &Entity) -> Vec<String> {
    entity
        .properties
        .get("labels")
        .and_then(Value::as_array)
        .map(|arr| normalize_label_list(
            &arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect::<Vec<_>>(),
        ))
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
        let remove_set: std::collections::HashSet<String> = normalize_label_list(remove)
            .into_iter()
            .collect();
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

fn insert_optional_string(
    properties: &mut serde_json::Map<String, Value>,
    key: &str,
    value: Option<&str>,
) {
    if let Some(value) = value.map(str::trim).filter(|s| !s.is_empty()) {
        properties.insert(key.to_string(), Value::String(value.to_string()));
    }
}

fn insert_optional_labels(
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

fn insert_optional_description(
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

fn resolve_task_for_write(
    state: &AppState,
    user: &AuthedUser,
    task_key: &str,
) -> anyhow::Result<(ProjectMeta, Entity)> {
    let (project_key, canonical_task_key) = parse_task_key_and_project(task_key)
        .with_context(|| format!("invalid taskKey (expected PROJ-123): {task_key}"))?;
    let db = state.db.blocking_read();
    let project = db
        .get_project_meta_by_key(&project_key)
        .context("lookup project by projectKey")?
        .ok_or_else(|| anyhow::anyhow!("project not found for projectKey={project_key}"))?;
    let can_ok = can_write(&db, &project.id, Some(user)).context("check write permission")?;
    if !can_ok {
        anyhow::bail!("insufficient permissions for project {project_key}");
    }
    let task = find_task_by_key(&db, &project.id, &canonical_task_key)?;
    Ok((project, task))
}

fn find_task_by_key(
    db: &crate::db::Db,
    project_id: &str,
    task_key: &str,
) -> anyhow::Result<Entity> {
    let entities = db
        .list_entities_for_project(project_id)
        .with_context(|| format!("list entities for project {project_id}"))?;
    entities
        .into_iter()
        .find(|e| {
            e.entity_id == "task"
                && e.properties
                    .get("taskKey")
                    .and_then(Value::as_str)
                    .map(|s| s == task_key)
                    .unwrap_or(false)
        })
        .ok_or_else(|| anyhow::anyhow!("task not found: {task_key}"))
}

fn patch_task_with_retry(
    state: &AppState,
    project_id: &str,
    entity: &Entity,
    user: &AuthedUser,
    mut patch: serde_json::Map<String, Value>,
) -> anyhow::Result<Entity> {
    patch.insert("updatedBy".to_string(), Value::String(user.user_id.clone()));
    for attempt in 0..2 {
        let db = state.db.blocking_read();
        let current = db
            .get_entity_for_project(project_id, &entity.id)
            .with_context(|| format!("get entity {}", entity.id))?
            .ok_or_else(|| anyhow::anyhow!("task not found"))?;
        match db.patch_entity_for_project(project_id, &entity.id, current.updated_at, patch.clone())
        {
            Ok(updated) => return Ok(updated),
            Err(crate::db::EntityWriteError::Conflict { .. }) if attempt == 0 => continue,
            Err(crate::db::EntityWriteError::Conflict { current_updated_at }) => {
                anyhow::bail!(
                    "conflict while updating task (current updatedAt={current_updated_at})"
                )
            }
            Err(crate::db::EntityWriteError::NotFound) => anyhow::bail!("task not found"),
            Err(crate::db::EntityWriteError::ServiceUnavailable) => {
                anyhow::bail!("database temporarily unavailable")
            }
        }
    }
    anyhow::bail!("failed to update task")
}
