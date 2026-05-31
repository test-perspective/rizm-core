//! Seed default project, manifest, entities, and meta when database is empty.

use anyhow::Context;
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

use crate::defaults::{default_entities, default_manifest};

use super::DEFAULT_PROJECT_ID;

/// Seed database if empty. Idempotent.
pub(crate) fn seed_if_empty(conn: &mut rusqlite::Connection) -> anyhow::Result<()> {
    let project_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
        .context("count projects")?;

    if project_count == 0 {
        let now = crate::time::now_ms();
        conn.execute(
            "INSERT INTO projects (id, name, project_key, lifecycle_status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![DEFAULT_PROJECT_ID, "Default", Some("DEF".to_string()), "ready", now, now],
        )
        .context("insert default project")?;
    }

    let manifest_exists: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM manifests WHERE project_id = ?1",
            params![DEFAULT_PROJECT_ID],
            |row| row.get(0),
        )
        .optional()
        .context("check default manifest exists")?;

    if manifest_exists.is_none() {
        let m = default_manifest();
        let json = serde_json::to_string(&m).context("serialize default manifest")?;
        conn.execute(
            "INSERT INTO manifests (project_id, json) VALUES (?1, ?2)",
            params![DEFAULT_PROJECT_ID, json],
        )
        .context("insert default manifest")?;
    }

    let has_default_manifest_version: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM manifest_versions WHERE project_id = ?1 LIMIT 1",
            params![DEFAULT_PROJECT_ID],
            |row| row.get(0),
        )
        .optional()
        .context("check default manifest_versions exists")?;
    if has_default_manifest_version.is_none() {
        let json: String = conn
            .query_row(
                "SELECT json FROM manifests WHERE project_id = ?1",
                params![DEFAULT_PROJECT_ID],
                |row| row.get(0),
            )
            .context("select default manifest json for initial version")?;
        let id = Uuid::new_v4().to_string();
        let now = crate::time::now_ms();
        conn.execute(
            "INSERT INTO manifest_versions (id, project_id, created_at, actor_user_id, source, message, parent_id, json)
             VALUES (?1, ?2, ?3, NULL, ?4, ?5, NULL, ?6)",
            params![id, DEFAULT_PROJECT_ID, now, "seed", Some("initial".to_string()), json],
        )
        .context("insert default manifest_versions initial")?;
    }

    let entity_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM entities WHERE project_id = ?1",
            params![DEFAULT_PROJECT_ID],
            |row| row.get(0),
        )
        .context("count entities")?;
    if entity_count == 0 {
        let now_ms = crate::time::now_ms();
        let mut entities = default_entities(now_ms);

        let project_key: String = conn
            .query_row(
                "SELECT project_key FROM projects WHERE id = ?1",
                params![DEFAULT_PROJECT_ID],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .context("select default project_key for seed")?
            .flatten()
            .unwrap_or_else(|| "DEF".to_string())
            .trim()
            .to_uppercase();

        let mut seeded_task_count: i64 = 0;
        for e in &mut entities {
            if e.entity_id.trim() != "task" {
                continue;
            }
            seeded_task_count += 1;
            e.properties.insert(
                "taskKey".to_string(),
                serde_json::Value::String(format!("{project_key}-{seeded_task_count}")),
            );
        }

        let next_task_seq = if seeded_task_count <= 0 {
            1_i64
        } else {
            seeded_task_count + 1
        };
        conn.execute(
            "INSERT INTO project_counters (project_id, next_task_seq) VALUES (?1, ?2)
             ON CONFLICT(project_id) DO UPDATE SET next_task_seq = excluded.next_task_seq",
            params![DEFAULT_PROJECT_ID, next_task_seq],
        )
        .context("init project_counters for default seed")?;

        let tx = conn.transaction().context("begin seed tx")?;
        {
            let mut stmt = tx
                .prepare(
                    "INSERT INTO entities (id, project_id, entity_id, created_at, updated_at, properties_json)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                )
                .context("prepare seed insert")?;
            for e in &entities {
                let props_json =
                    serde_json::to_string(&e.properties).context("serialize seed props")?;
                stmt.execute(params![
                    e.id,
                    DEFAULT_PROJECT_ID,
                    e.entity_id,
                    e.created_at,
                    e.updated_at,
                    props_json
                ])
                .with_context(|| format!("insert seed entity {}", e.id))?;
            }
        }
        tx.commit().context("commit seed tx")?;
    }

    let version_exists: Option<String> = conn
        .query_row("SELECT value FROM meta WHERE key = 'version'", [], |row| {
            row.get(0)
        })
        .optional()
        .context("check version exists")?;
    if version_exists.is_none() {
        conn.execute(
            "INSERT INTO meta (key, value) VALUES ('version', ?1)",
            params![crate::time::now_ms().to_string()],
        )
        .context("insert default version")?;
    }

    let active_exists: Option<String> = conn
        .query_row(
            "SELECT value FROM meta WHERE key = 'active_project_id'",
            [],
            |row| row.get(0),
        )
        .optional()
        .context("check active project id exists")?;
    if active_exists.is_none() {
        conn.execute(
            "INSERT INTO meta (key, value) VALUES ('active_project_id', ?1)",
            params![DEFAULT_PROJECT_ID],
        )
        .context("insert default active project id")?;
    }

    Ok(())
}
