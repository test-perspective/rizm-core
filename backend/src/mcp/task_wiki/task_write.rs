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
use super::task_relations::{
    keys_to_json, list_project_entities, merge_blocked_by, normalize_relation_keys,
    task_keys_from_property, validate_parent_keys, validate_task_relations, RelationWriteLock,
    BLOCKED_BY_PROP, CREATING_SENTINEL, LINK_PROP, PARENT_PROP,
};
use super::task_relations_view::{ensure_manifest_link_properties, planned_block_patches};
use super::task_write_fields::{
    build_task_patch, insert_optional_description, insert_optional_labels, insert_optional_string,
};
use super::task_write_input::{TaskCreateInput, TaskUpdateInput};

pub fn create_task_for_user(
    state: &AppState,
    user: &AuthedUser,
    input: TaskCreateInput,
) -> anyhow::Result<String> {
    let title = input.title.trim();
    if title.is_empty() {
        anyhow::bail!("title is required");
    }

    let project = resolve_project(
        state,
        user,
        input.project_key.as_deref(),
        input.project_id.as_deref(),
    )?;
    ensure_can_write(state, user, &project)?;

    let parent = normalize_optional_keys(input.parent_task_key.as_deref())?;
    if let Some(ref keys) = parent {
        validate_parent_keys(keys)?;
    }
    let blocked_by = normalize_optional_keys(input.blocked_by.as_deref())?;
    let blocks = normalize_optional_keys(input.blocks.as_deref())?;
    let link = normalize_optional_keys(input.link.as_deref())?;

    let relation_lock =
        (parent.is_some() || blocked_by.is_some() || blocks.is_some() || link.is_some())
            .then(|| RelationWriteLock::for_project_key(&project.project_key));
    let _relation_guard = relation_lock.as_ref().map(RelationWriteLock::acquire);

    let entities = list_project_entities(state, &project.id)?;
    let self_key = match input.task_key.as_deref() {
        Some(raw) => parse_task_key_and_project(raw)?.1,
        None => CREATING_SENTINEL.to_string(),
    };
    validate_task_relations(
        &project.project_key,
        &self_key,
        &entities,
        parent.as_deref(),
        blocked_by.as_deref(),
        blocks.as_deref(),
        link.as_deref(),
    )?;
    if parent.is_some() || blocked_by.is_some() || blocks.as_ref().is_some_and(|k| !k.is_empty()) {
        ensure_manifest_link_properties(state, &project.id, &user.user_id)?;
    }

    let mut properties = serde_json::Map::new();
    properties.insert("title".to_string(), Value::String(title.to_string()));
    insert_optional_string(&mut properties, "status", input.status.as_deref());
    insert_optional_string(&mut properties, "priority", input.priority.as_deref());
    insert_optional_labels(&mut properties, input.labels.as_deref());
    insert_optional_description(&mut properties, input.description.as_deref())?;
    insert_optional_string(&mut properties, "taskKey", input.task_key.as_deref());
    insert_link_property(&mut properties, PARENT_PROP, parent.as_deref());
    insert_link_property(&mut properties, BLOCKED_BY_PROP, blocked_by.as_deref());
    insert_link_property(&mut properties, LINK_PROP, link.as_deref());
    properties.insert("createdBy".to_string(), Value::String(user.user_id.clone()));
    properties.insert("updatedBy".to_string(), Value::String(user.user_id.clone()));

    let db = state.db.blocking_read();
    let entity = db
        .create_entity_for_project(&project.id, None, "task", properties)
        .with_context(|| format!("create task in project {}", project.id))?;
    drop(db);

    let new_key = entity
        .properties
        .get("taskKey")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    if let Some(blocks) = blocks.as_ref().filter(|k| !k.is_empty()) {
        // The task is already persisted, so surface its key: the caller has to
        // retry the inverse links with update_task instead of create_task.
        apply_block_patches(
            state,
            user,
            &project.id,
            &planned_block_patches(&new_key, blocks, &entities),
        )
        .with_context(|| {
            format!("task {new_key} was created, but writing blocks targets failed")
        })?;
    }
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
    input: TaskUpdateInput,
) -> anyhow::Result<String> {
    let parent = normalize_optional_keys(input.parent_task_key.as_deref())?;
    if let Some(ref keys) = parent {
        validate_parent_keys(keys)?;
    }
    let blocked_by_replace = normalize_optional_keys(input.blocked_by.as_deref())?;
    let add_blocked_by = normalize_optional_keys(input.add_blocked_by.as_deref())?;
    let remove_blocked_by = normalize_optional_keys(input.remove_blocked_by.as_deref())?;
    let blocks = normalize_optional_keys(input.blocks.as_deref())?;
    let link = normalize_optional_keys(input.link.as_deref())?;

    // Taken before the task is loaded so the snapshot used for cycle validation
    // stays valid until the write lands.
    let relation_lock = (parent.is_some()
        || blocked_by_replace.is_some()
        || add_blocked_by.is_some()
        || remove_blocked_by.is_some()
        || blocks.is_some()
        || link.is_some())
    .then(|| {
        let (project_key, _) = parse_task_key_and_project(&input.task_key)
            .unwrap_or_else(|_| (input.task_key.clone(), String::new()));
        RelationWriteLock::for_project_key(&project_key)
    });
    let _relation_guard = relation_lock.as_ref().map(RelationWriteLock::acquire);

    let (project, entity) = resolve_task_for_write(state, user, &input.task_key)?;
    let self_key = entity
        .properties
        .get("taskKey")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    let current_parent = task_keys_from_property(entity.properties.get(PARENT_PROP));
    let current_link = task_keys_from_property(entity.properties.get(LINK_PROP));
    let current_blocked_by = task_keys_from_property(entity.properties.get(BLOCKED_BY_PROP));
    let next_blocked_by = if blocked_by_replace.is_some()
        || add_blocked_by.is_some()
        || remove_blocked_by.is_some()
    {
        Some(merge_blocked_by(
            &current_blocked_by,
            blocked_by_replace.as_deref(),
            add_blocked_by.as_deref(),
            remove_blocked_by.as_deref(),
        ))
    } else {
        None
    };

    let entities = list_project_entities(state, &project.id)?;
    validate_task_relations(
        &project.project_key,
        &self_key,
        &entities,
        parent.as_deref(),
        next_blocked_by.as_deref(),
        blocks.as_deref(),
        link.as_deref(),
    )?;
    if parent.is_some()
        || next_blocked_by.is_some()
        || blocks.as_ref().is_some_and(|k| !k.is_empty())
    {
        ensure_manifest_link_properties(state, &project.id, &user.user_id)?;
    }

    let mut patch = build_task_patch(user, &entity, &input)?;
    insert_changed_link_property(&mut patch, PARENT_PROP, parent.as_deref(), &current_parent);
    insert_changed_link_property(
        &mut patch,
        BLOCKED_BY_PROP,
        next_blocked_by.as_deref(),
        &current_blocked_by,
    );
    insert_changed_link_property(&mut patch, LINK_PROP, link.as_deref(), &current_link);

    let mut changed_fields: Vec<String> = patch
        .keys()
        .filter(|k| k.as_str() != "updatedBy")
        .cloned()
        .collect();
    let block_patches = blocks
        .as_ref()
        .map(|targets| planned_block_patches(&self_key, targets, &entities))
        .unwrap_or_default();
    if !block_patches.is_empty() {
        changed_fields.push("blocks".to_string());
    }
    // Relation arguments are how agents converge on a desired state, so asking for
    // links that already exist succeeds with an empty changedFields instead of
    // failing. Without any relation argument an empty patch is still a caller bug.
    let relations_requested =
        parent.is_some() || next_blocked_by.is_some() || blocks.is_some() || link.is_some();
    if changed_fields.is_empty() && !relations_requested {
        anyhow::bail!("no task fields to update");
    }

    let updated = if patch.keys().any(|k| k.as_str() != "updatedBy") {
        patch_entity_with_retry(state, &project.id, &entity.id, user, patch)?
    } else {
        entity
    };
    apply_block_patches(state, user, &project.id, &block_patches)?;
    enqueue_entity_upsert(state.clone(), project.id.clone(), updated.clone());

    Ok(json!({
        "id": updated.id,
        "taskKey": updated.properties.get("taskKey").and_then(Value::as_str),
        "updatedAt": updated.updated_at,
        "changedFields": changed_fields
    })
    .to_string())
}

fn normalize_optional_keys(keys: Option<&[String]>) -> anyhow::Result<Option<Vec<String>>> {
    match keys {
        None => Ok(None),
        Some(keys) => Ok(Some(normalize_relation_keys(keys)?)),
    }
}

fn insert_link_property(
    properties: &mut serde_json::Map<String, Value>,
    key: &str,
    value: Option<&[String]>,
) {
    let Some(keys) = value else { return };
    if keys.is_empty() {
        return;
    }
    properties.insert(key.to_string(), keys_to_json(keys));
}

fn insert_changed_link_property(
    patch: &mut serde_json::Map<String, Value>,
    key: &str,
    value: Option<&[String]>,
    current: &[String],
) {
    let Some(keys) = value else { return };
    if keys == current {
        return;
    }
    patch.insert(key.to_string(), keys_to_json(keys));
}

fn apply_block_patches(
    state: &AppState,
    user: &AuthedUser,
    project_id: &str,
    patches: &[(String, Vec<String>)],
) -> anyhow::Result<()> {
    for (entity_id, blocked_by) in patches {
        let mut patch = serde_json::Map::new();
        patch.insert(BLOCKED_BY_PROP.to_string(), keys_to_json(blocked_by));
        let updated = patch_entity_with_retry(state, project_id, entity_id, user, patch)?;
        enqueue_entity_upsert(state.clone(), project_id.to_string(), updated);
    }
    Ok(())
}

fn ensure_can_write(
    state: &AppState,
    user: &AuthedUser,
    project: &ProjectMeta,
) -> anyhow::Result<()> {
    let db = state.db.blocking_read();
    let can_ok = can_write(&db, &project.id, Some(user)).context("check write permission")?;
    if !can_ok {
        anyhow::bail!(
            "insufficient permissions for project {}",
            project.project_key
        );
    }
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
    let entities = db
        .list_entities_for_project(&project.id)
        .with_context(|| format!("list entities for project {}", project.id))?;
    let task = entities
        .into_iter()
        .find(|e| {
            e.entity_id == "task"
                && e.properties
                    .get("taskKey")
                    .and_then(Value::as_str)
                    .map(|s| s == canonical_task_key)
                    .unwrap_or(false)
        })
        .ok_or_else(|| anyhow::anyhow!("task not found: {canonical_task_key}"))?;
    Ok((project, task))
}

fn patch_entity_with_retry(
    state: &AppState,
    project_id: &str,
    entity_id: &str,
    user: &AuthedUser,
    mut patch: serde_json::Map<String, Value>,
) -> anyhow::Result<Entity> {
    patch.insert("updatedBy".to_string(), Value::String(user.user_id.clone()));
    for attempt in 0..2 {
        let db = state.db.blocking_read();
        let current = db
            .get_entity_for_project(project_id, entity_id)
            .with_context(|| format!("get entity {entity_id}"))?
            .ok_or_else(|| anyhow::anyhow!("task not found"))?;
        match db.patch_entity_for_project(project_id, entity_id, current.updated_at, patch.clone())
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
