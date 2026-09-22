//! Old-task-key lookup for tasks that were moved between projects.
//!
//! `taskKey` prefixes identify the owning project everywhere else in the app, so
//! a moved task gets a fresh key. The keys it used before are recorded here to
//! keep existing links, branch names and bookmarks resolvable.

use anyhow::Context;
use rusqlite::{params, OptionalExtension, Transaction};

use super::super::{Db, ProjectMeta};
use crate::models::Entity;
use crate::task_key::parse_task_key_and_project;

/// Record `alias_key` as a former key of `entity_pk`. Last move wins.
pub(super) fn record_alias(
    tx: &Transaction<'_>,
    alias_key: &str,
    entity_pk: &str,
    now: i64,
) -> anyhow::Result<()> {
    tx.execute(
        "INSERT INTO task_key_aliases (alias_key, entity_pk, created_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(alias_key) DO UPDATE SET
           entity_pk = excluded.entity_pk,
           created_at = excluded.created_at",
        params![alias_key, entity_pk, now],
    )
    .context("record task key alias")?;
    Ok(())
}

/// Drop an alias that a newly issued live key would shadow, so an alias never
/// points somewhere other than the task actually holding that key.
pub(super) fn clear_alias(tx: &Transaction<'_>, alias_key: &str) -> anyhow::Result<()> {
    tx.execute(
        "DELETE FROM task_key_aliases WHERE alias_key = ?1",
        params![alias_key],
    )
    .context("clear shadowed task key alias")?;
    Ok(())
}

impl Db {
    /// Resolve a task by a key it used to have. Returns the project that owns it now.
    pub fn resolve_task_by_alias(
        &self,
        alias_key: &str,
    ) -> anyhow::Result<Option<(ProjectMeta, Entity)>> {
        let Ok((_, canonical)) = parse_task_key_and_project(alias_key) else {
            return Ok(None);
        };
        let conn = self.pool.get().context("get sqlite conn")?;
        let entity_pk: Option<String> = conn
            .query_row(
                "SELECT entity_pk FROM task_key_aliases WHERE alias_key = ?1",
                params![canonical],
                |r| r.get(0),
            )
            .optional()
            .context("select task key alias")?;
        let Some(entity_pk) = entity_pk else {
            return Ok(None);
        };
        let project_id: Option<String> = conn
            .query_row(
                "SELECT project_id FROM entities WHERE id = ?1",
                params![entity_pk],
                |r| r.get(0),
            )
            .optional()
            .context("select entity project for alias")?;
        let Some(project_id) = project_id else {
            return Ok(None);
        };
        drop(conn);

        let Some(project) = self.get_project_meta_by_id(&project_id)? else {
            return Ok(None);
        };
        let Some(entity) = self.get_entity_for_project(&project_id, &entity_pk)? else {
            return Ok(None);
        };
        Ok(Some((project, entity)))
    }
}
