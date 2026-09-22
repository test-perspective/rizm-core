//! Cross-project task move, shared by the HTTP API, MCP and the AI assistant.
//!
//! Wraps `Db::move_tasks_to_project` with everything the DB layer deliberately
//! stays out of: permission checks, destination manifest backfill, search
//! re-indexing and activity logging.

use anyhow::Context;
use serde::Serialize;
use serde_json::{json, Value};

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::db::{DetachedRelation, MovedTask, ProjectMeta};
use crate::permissions::can_write;
use crate::search::indexer::{enqueue_entity_delete, enqueue_entity_upsert};
use crate::task_key::parse_task_key_and_project;

use crate::mcp::jsonrpc::{read_string_arg, read_string_array_arg};

use super::project::resolve_project;
use super::task_move_manifest::plan_task_manifest_merge;
use super::task_relations::RelationWriteLock;
use super::task_relations_view::ensure_manifest_link_properties;

/// Selection of tasks to move. Callers give either entity ids (the UI, which
/// already has them) or task keys (MCP and the AI assistant).
#[derive(Debug, Default, Clone)]
pub struct TaskMoveInput {
    /// Set by the HTTP API from the request path. Derived from the task keys otherwise.
    pub source_project_id: Option<String>,
    pub task_ids: Vec<String>,
    pub task_keys: Vec<String>,
    pub destination_project_key: Option<String>,
    pub destination_project_id: Option<String>,
}

impl TaskMoveInput {
    pub fn from_mcp_args(args: &Value) -> anyhow::Result<Self> {
        let task_keys = read_string_array_arg(args, &["taskKeys", "task_keys"])
            .or_else(|| read_string_arg(args, &["taskKey", "task_key"]).map(|k| vec![k]))
            .unwrap_or_default();
        if task_keys.is_empty() {
            anyhow::bail!("missing required argument: taskKeys");
        }
        Ok(Self {
            source_project_id: None,
            task_ids: vec![],
            task_keys,
            destination_project_key: read_string_arg(
                args,
                &["destinationProjectKey", "destination_project_key"],
            ),
            destination_project_id: read_string_arg(
                args,
                &["destinationProjectId", "destination_project_id"],
            ),
        })
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskMoveResult {
    pub source_project_id: String,
    pub destination_project_id: String,
    pub destination_project_key: String,
    pub moved: Vec<MovedTask>,
    pub detached_relations: Vec<DetachedRelation>,
    pub manifest_updated: bool,
}

/// MCP / AI assistant entry point: the same move, rendered as JSON text.
pub fn move_tasks_for_user(
    state: &AppState,
    user: &AuthedUser,
    input: TaskMoveInput,
) -> anyhow::Result<String> {
    let result = move_tasks(state, user, input)?;
    serde_json::to_string_pretty(&result).context("serialize move result")
}

pub fn move_tasks(
    state: &AppState,
    user: &AuthedUser,
    input: TaskMoveInput,
) -> anyhow::Result<TaskMoveResult> {
    let dest = resolve_project(
        state,
        user,
        input.destination_project_key.as_deref(),
        input.destination_project_id.as_deref(),
    )?;
    let source = resolve_source_project(state, user, &input)?;
    if source.id == dest.id {
        anyhow::bail!("destination project must differ from the source project");
    }
    ensure_can_write_project(state, user, &source)?;
    ensure_can_write_project(state, user, &dest)?;

    // Relations are validated against a project-wide snapshot, so both sides are
    // locked. Ordering by key keeps two opposite moves from deadlocking.
    let mut lock_keys = [source.project_key.clone(), dest.project_key.clone()];
    lock_keys.sort();
    let locks = [
        RelationWriteLock::for_project_key(&lock_keys[0]),
        RelationWriteLock::for_project_key(&lock_keys[1]),
    ];
    let _guards = (locks[0].acquire(), locks[1].acquire());

    let root_ids = resolve_root_ids(state, &source, &input)?;
    let manifest_updated = merge_destination_manifest(state, user, &source, &dest, &root_ids)?;

    let db_path = state.db_path.clone();
    let outcome = {
        let db = state.db.blocking_read();
        db.move_tasks_to_project(&db_path, &source.id, &root_ids, &dest.id, &user.user_id)?
    };

    let now = crate::time::now_ms();
    {
        let db = state.db.blocking_read();
        for moved in &outcome.moved {
            let meta_json = move_activity_meta(moved, &source, &dest);
            let _ = db.insert_audit_log_with_activity(
                Some(&user.user_id),
                "TASK_MOVED",
                None,
                Some(&meta_json),
                now,
                true,
            );
        }
    }

    for (project_id, entity_pk) in outcome.index_deletes {
        enqueue_entity_delete(state.clone(), project_id, entity_pk);
    }
    for (project_id, entity) in outcome.index_upserts {
        enqueue_entity_upsert(state.clone(), project_id, entity);
    }

    // Backfills the link-type property definitions the relation views rely on.
    let _ = ensure_manifest_link_properties(state, &dest.id, &user.user_id);

    Ok(TaskMoveResult {
        source_project_id: source.id,
        destination_project_id: dest.id,
        destination_project_key: dest.project_key,
        moved: outcome.moved,
        detached_relations: outcome.detached,
        manifest_updated,
    })
}

fn resolve_source_project(
    state: &AppState,
    user: &AuthedUser,
    input: &TaskMoveInput,
) -> anyhow::Result<ProjectMeta> {
    if let Some(id) = input.source_project_id.as_deref().filter(|s| !s.is_empty()) {
        return resolve_project(state, user, None, Some(id));
    }

    let mut project_key: Option<String> = None;
    for raw in &input.task_keys {
        let (prefix, _) = parse_task_key_and_project(raw)
            .with_context(|| format!("invalid taskKey (expected PROJ-123): {raw}"))?;
        match &project_key {
            None => project_key = Some(prefix),
            Some(existing) if existing == &prefix => {}
            Some(existing) => anyhow::bail!(
                "all tasks must be in the same project (found {existing} and {prefix})"
            ),
        }
    }
    let Some(project_key) = project_key else {
        anyhow::bail!("taskKeys or a source project is required");
    };
    resolve_project(state, user, Some(&project_key), None)
}

/// Turn the requested selection into entity ids in the source project.
fn resolve_root_ids(
    state: &AppState,
    source: &ProjectMeta,
    input: &TaskMoveInput,
) -> anyhow::Result<Vec<String>> {
    let db = state.db.blocking_read();
    let entities = db
        .list_entities_for_project(&source.id)
        .with_context(|| format!("list entities for project {}", source.id))?;

    let mut ids: Vec<String> = vec![];
    let mut push = |id: String| {
        if !ids.contains(&id) {
            ids.push(id);
        }
    };

    for id in &input.task_ids {
        if !entities.iter().any(|e| &e.id == id) {
            anyhow::bail!("task not found in project {}: {id}", source.project_key);
        }
        push(id.clone());
    }
    for raw in &input.task_keys {
        let (_, canonical) = parse_task_key_and_project(raw)
            .with_context(|| format!("invalid taskKey (expected PROJ-123): {raw}"))?;
        let found = entities.iter().find(|e| {
            e.properties.get("taskKey").and_then(Value::as_str) == Some(canonical.as_str())
        });
        let Some(entity) = found else {
            anyhow::bail!("task not found: {canonical}");
        };
        push(entity.id.clone());
    }

    if ids.is_empty() {
        anyhow::bail!("no tasks selected");
    }
    Ok(ids)
}

/// Copy the property definitions and select options the moved tasks need into
/// the destination manifest. Runs before the move so the values are never
/// visible without a definition behind them.
fn merge_destination_manifest(
    state: &AppState,
    user: &AuthedUser,
    source: &ProjectMeta,
    dest: &ProjectMeta,
    root_ids: &[String],
) -> anyhow::Result<bool> {
    for attempt in 0..2 {
        let db = state.db.blocking_read();
        let Some(source_manifest) = db
            .get_manifest_with_etag(&source.id)
            .context("get source manifest")?
            .map(|(m, _)| m)
        else {
            return Ok(false);
        };
        let Some((dest_manifest, etag)) = db
            .get_manifest_with_etag(&dest.id)
            .context("get destination manifest")?
        else {
            return Ok(false);
        };

        // Exactly the set the move will touch, walked by the DB layer itself.
        let moved = db
            .plan_task_move_set(&source.id, root_ids)
            .context("plan task move set")?;

        let Some(merged) = plan_task_manifest_merge(&source_manifest, &dest_manifest, &moved) else {
            return Ok(false);
        };
        match db.put_manifest_if_match(
            &dest.id,
            &etag,
            merged,
            Some("silent"),
            None,
            Some(&user.user_id),
        ) {
            Ok(_) => return Ok(true),
            Err(crate::db::ManifestWriteError::Conflict { .. }) if attempt == 0 => continue,
            Err(crate::db::ManifestWriteError::Conflict { current_etag }) => anyhow::bail!(
                "conflict while updating the destination manifest (etag={current_etag})"
            ),
            Err(crate::db::ManifestWriteError::NotFound) => anyhow::bail!("project not found"),
        }
    }
    anyhow::bail!("failed to update the destination manifest")
}

fn ensure_can_write_project(
    state: &AppState,
    user: &AuthedUser,
    project: &ProjectMeta,
) -> anyhow::Result<()> {
    let db = state.db.blocking_read();
    let ok = can_write(&db, &project.id, Some(user)).context("check write permission")?;
    if !ok {
        anyhow::bail!("insufficient permissions for project {}", project.project_key);
    }
    Ok(())
}

/// Same shape the entity API records for tasks, plus where the task came from.
fn move_activity_meta(moved: &MovedTask, source: &ProjectMeta, dest: &ProjectMeta) -> String {
    let meta = json!({
        "entity_type": "TASK",
        "entity_id": moved.id,
        "entity_title": moved.task_key,
        "project_id": dest.id,
        "from_project_id": source.id,
        "from_task_key": moved.previous_task_key,
        "to_task_key": moved.task_key,
    });
    serde_json::to_string(&meta).unwrap_or_default()
}
