//! Cross-project task move (REQ-309): entities, task keys, relations,
//! attachment blobs and external ids.
//!
//! Structure:
//!   - `collect`   : which tasks the move covers (roots + descendants)
//!   - `rekey`     : new key allocation and the rebuilt properties
//!   - `relations` : re-pointing / detaching parentTaskKey, blockedBy, link
//!   - `aliases`   : the old-key lookup table
//!   - `types`     : the outcome returned to the caller
//!
//! The public entry point is `Db::move_tasks_to_project`, defined here.

use anyhow::Context;
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use std::collections::HashMap;

use super::entity_move_common::{
    copy_attachment_files_for_entities, delete_attachment_files_for_project,
    rewrite_project_in_attachment_urls, CopiedAttachmentsGuard,
};
use super::Db;
use crate::models::Entity;

mod aliases;
mod collect;
mod rekey;
mod relations;
mod types;

use collect::{collect_move_set, is_task_entity, task_key_of};
use rekey::{allocate_keys, build_moved_properties, ORDER_GAP, ORDER_PROP};
use relations::strip_relations_to_moved;

pub use types::{DetachedRelation, MoveTasksOutcome, MovedTask};

impl Db {
    /// The tasks a move of `root_ids` would cover, in key-assignment order.
    ///
    /// Lets a caller prepare the destination (backfilling its manifest) against
    /// exactly the set the move will touch, without duplicating the subtree walk.
    pub fn plan_task_move_set(
        &self,
        source_project_id: &str,
        root_ids: &[String],
    ) -> anyhow::Result<Vec<Entity>> {
        let entities = self.list_entities_for_project(source_project_id)?;
        let move_set = collect_move_set(root_ids, &entities)?;
        let by_id: HashMap<&str, &Entity> = entities.iter().map(|e| (e.id.as_str(), e)).collect();
        Ok(move_set
            .ordered_ids
            .iter()
            .filter_map(|id| by_id.get(id.as_str()).map(|e| (*e).clone()))
            .collect())
    }

    /// Move `root_ids` and their descendants from one project to another.
    ///
    /// Task keys are re-issued from the destination counter; the old keys stay
    /// resolvable through `task_key_aliases`.
    pub fn move_tasks_to_project(
        &self,
        db_path: &str,
        source_project_id: &str,
        root_ids: &[String],
        dest_project_id: &str,
        updated_by: &str,
    ) -> anyhow::Result<MoveTasksOutcome> {
        if source_project_id == dest_project_id {
            anyhow::bail!("destination project must differ from the source project");
        }

        let mut conn = self.pool.get().context("get sqlite conn")?;
        let source_entities = Db::list_entities_for_project_conn(&mut conn, source_project_id)
            .context("list source entities")?;
        let dest_entities = Db::list_entities_for_project_conn(&mut conn, dest_project_id)
            .context("list dest entities")?;

        let dest_project_key: Option<String> = conn
            .query_row(
                "SELECT project_key FROM projects WHERE id = ?1",
                params![dest_project_id],
                |r| r.get(0),
            )
            .optional()
            .context("load destination project")?
            .ok_or_else(|| anyhow::anyhow!("destination project not found"))?;
        let dest_project_key = dest_project_key
            .as_deref()
            .map(Db::normalize_project_key)
            .unwrap_or_default();
        if dest_project_key.is_empty() || !Db::is_valid_project_key(&dest_project_key) {
            anyhow::bail!("destination projectKey not set or invalid");
        }

        let move_set = collect_move_set(root_ids, &source_entities)?;
        let source_by_id: HashMap<String, Entity> = source_entities
            .iter()
            .map(|e| (e.id.clone(), e.clone()))
            .collect();

        // Boards sort each lane by __keelOrder, so a value above everything in the
        // destination puts the moved tasks at the end of whichever lane they land in.
        let dest_order_base = dest_entities
            .iter()
            .filter(|e| is_task_entity(e))
            .filter_map(|e| e.properties.get(ORDER_PROP).and_then(|v| v.as_f64()))
            .fold(0.0_f64, f64::max);

        // Copied before the transaction; rolled back automatically unless committed.
        let mut copied_attachments =
            CopiedAttachmentsGuard::new(copy_attachment_files_for_entities(
                db_path,
                source_project_id,
                dest_project_id,
                &source_by_id,
                &move_set.ordered_ids,
            )?);

        let now = crate::time::now_ms();
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .context("begin tx")?;

        // --- 1) Allocate destination task keys in one counter bump ---
        tx.execute(
            "INSERT INTO project_counters (project_id, next_task_seq) VALUES (?1, 1)
             ON CONFLICT(project_id) DO NOTHING",
            params![dest_project_id],
        )
        .context("init destination project_counters row")?;
        let counter_seq: i64 = tx
            .query_row(
                "SELECT next_task_seq FROM project_counters WHERE project_id = ?1",
                params![dest_project_id],
                |r| r.get(0),
            )
            .context("select destination next_task_seq")?;
        // A project restored through `replace_project_state` keeps its tasks but
        // loses its counter row, so trusting the counter alone could mint a key
        // that an existing task already holds.
        let start_seq = counter_seq.max(highest_task_seq(&dest_entities, &dest_project_key) + 1);
        let (new_key_by_old, new_key_by_id, next_seq) = allocate_keys(
            &dest_project_key,
            start_seq,
            &move_set.ordered_ids,
            &move_set.old_key_by_id,
        );
        tx.execute(
            "UPDATE project_counters SET next_task_seq = ?2 WHERE project_id = ?1",
            params![dest_project_id, next_seq],
        )
        .context("bump destination next_task_seq")?;

        // --- 2) Move the rows ---
        let mut moved: Vec<MovedTask> = vec![];
        let mut detached: Vec<DetachedRelation> = vec![];

        for (i, id) in move_set.ordered_ids.iter().enumerate() {
            let entity = source_by_id.get(id).context("moved entity missing")?;
            let old_key = &move_set.old_key_by_id[id];
            let new_key = &new_key_by_id[id];
            let order = dest_order_base + ORDER_GAP * (i as f64 + 1.0);

            let (props, removed) =
                build_moved_properties(entity, new_key, old_key, &new_key_by_old, order, updated_by);
            let props_json = serde_json::to_string(&props).context("serialize moved props")?;
            // Attachment URLs embed the owning project id at any nesting depth.
            let props_json =
                rewrite_project_in_attachment_urls(&props_json, source_project_id, dest_project_id);

            let updated = tx
                .execute(
                    "UPDATE entities SET project_id = ?1, updated_at = ?2, properties_json = ?3
                     WHERE id = ?4 AND project_id = ?5",
                    params![dest_project_id, now, props_json, id, source_project_id],
                )
                .context("move task row")?;
            if updated != 1 {
                anyhow::bail!("task was modified by someone else: {old_key}");
            }

            aliases::record_alias(&tx, old_key, id, now)?;
            aliases::clear_alias(&tx, new_key)?;
            move_external_ids(&tx, source_project_id, dest_project_id, id)?;

            for (property, removed_keys) in removed {
                detached.push(DetachedRelation {
                    task_key: new_key.clone(),
                    project_id: dest_project_id.to_string(),
                    property,
                    removed_keys,
                });
            }
            moved.push(MovedTask {
                id: id.clone(),
                previous_task_key: old_key.clone(),
                task_key: new_key.clone(),
                title: entity
                    .properties
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
            });
        }

        // --- 3) Drop references from the tasks left behind ---
        let mut touched_source_ids: Vec<String> = vec![];
        for entity in source_entities.iter().filter(|e| is_task_entity(e)) {
            if move_set.id_set.contains(&entity.id) {
                continue;
            }
            let mut props = entity.properties.clone();
            let Some(removed) = strip_relations_to_moved(&mut props, &move_set.old_keys) else {
                continue;
            };
            props.insert(
                "updatedBy".to_string(),
                serde_json::Value::String(updated_by.to_string()),
            );
            let props_json = serde_json::to_string(&props).context("serialize stripped props")?;
            tx.execute(
                "UPDATE entities SET updated_at = ?1, properties_json = ?2
                 WHERE id = ?3 AND project_id = ?4",
                params![now, props_json, entity.id, source_project_id],
            )
            .context("strip relations on remaining task")?;

            let task_key = task_key_of(entity).unwrap_or_else(|| entity.id.clone());
            for (property, removed_keys) in removed {
                detached.push(DetachedRelation {
                    task_key: task_key.clone(),
                    project_id: source_project_id.to_string(),
                    property,
                    removed_keys,
                });
            }
            touched_source_ids.push(entity.id.clone());
        }

        for project_id in [source_project_id, dest_project_id] {
            tx.execute(
                "UPDATE projects SET updated_at = ?1 WHERE id = ?2",
                params![now, project_id],
            )
            .context("touch project")?;
        }
        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('version', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![now.to_string()],
        )
        .context("bump meta version")?;

        tx.commit().context("commit task move tx")?;
        copied_attachments.disarm();

        delete_attachment_files_for_project(
            db_path,
            source_project_id,
            &source_by_id,
            &move_set.ordered_ids,
        );

        // --- 4) Reload for the search indexer ---
        let index_deletes: Vec<(String, String)> = move_set
            .ordered_ids
            .iter()
            .map(|id| (source_project_id.to_string(), id.clone()))
            .collect();
        let mut index_upserts: Vec<(String, Entity)> = vec![];
        for id in &move_set.ordered_ids {
            if let Ok(Some(e)) = self.get_entity_for_project(dest_project_id, id) {
                index_upserts.push((dest_project_id.to_string(), e));
            }
        }
        for id in &touched_source_ids {
            if let Ok(Some(e)) = self.get_entity_for_project(source_project_id, id) {
                index_upserts.push((source_project_id.to_string(), e));
            }
        }

        Ok(MoveTasksOutcome {
            source_project_id: source_project_id.to_string(),
            dest_project_id: dest_project_id.to_string(),
            moved,
            detached,
            index_deletes,
            index_upserts,
        })
    }
}

/// Carry the entity's external ids over to the destination project.
///
/// `entity_external_ids` is keyed by project, and the destination may already
/// hold a row for the same provider/external id (the same issue imported twice);
/// that row is dropped so the move is not blocked by the unique index.
fn move_external_ids(
    tx: &rusqlite::Transaction<'_>,
    source_project_id: &str,
    dest_project_id: &str,
    entity_pk: &str,
) -> anyhow::Result<()> {
    tx.execute(
        "DELETE FROM entity_external_ids
         WHERE project_id = ?1
           AND (provider, external_id) IN (
             SELECT provider, external_id FROM entity_external_ids
             WHERE project_id = ?2 AND entity_id = ?3
           )",
        params![dest_project_id, source_project_id, entity_pk],
    )
    .context("clear conflicting external ids")?;
    tx.execute(
        "UPDATE entity_external_ids SET project_id = ?1
         WHERE project_id = ?2 AND entity_id = ?3",
        params![dest_project_id, source_project_id, entity_pk],
    )
    .context("move external ids")?;
    Ok(())
}

/// Highest sequence number already handed out in `project_key`, judged from the
/// task keys actually present rather than from the counter row.
fn highest_task_seq(entities: &[Entity], project_key: &str) -> i64 {
    let prefix = format!("{project_key}-");
    entities
        .iter()
        .filter(|e| is_task_entity(e))
        .filter_map(|e| e.properties.get("taskKey").and_then(|v| v.as_str()))
        .filter_map(|key| key.strip_prefix(&prefix))
        .filter_map(|n| n.parse::<i64>().ok())
        .max()
        .unwrap_or(0)
}
