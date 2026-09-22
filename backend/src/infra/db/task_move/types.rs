//! Result types for `Db::move_tasks_to_project` (REQ-309).

use serde::Serialize;

use crate::models::Entity;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MovedTask {
    pub id: String,
    /// Key the task had in the source project. Stays resolvable via `task_key_aliases`.
    pub previous_task_key: String,
    /// Key re-issued from the destination project's counter.
    pub task_key: String,
    pub title: String,
}

/// A cross-project reference that had to be dropped because only one side moved.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetachedRelation {
    /// Current key of the task that was cleaned up (the new key when it moved).
    pub task_key: String,
    pub project_id: String,
    /// `parentTaskKey`, `blockedBy` or `link`.
    pub property: String,
    pub removed_keys: Vec<String>,
}

#[derive(Debug)]
pub struct MoveTasksOutcome {
    pub source_project_id: String,
    pub dest_project_id: String,
    pub moved: Vec<MovedTask>,
    pub detached: Vec<DetachedRelation>,
    /// Search indexer: delete these `(project_id, entity_pk)` first.
    pub index_deletes: Vec<(String, String)>,
    /// Search indexer: upsert `(project_id, entity)`.
    pub index_upserts: Vec<(String, Entity)>,
}
