use anyhow::Context;
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use std::collections::HashMap;
use uuid::Uuid;

use crate::defaults::default_manifest;
use crate::models::{Project, ProjectConfig};

use super::{Db, ProjectMeta};

impl Db {
    pub fn list_projects_meta(
        &self,
    ) -> anyhow::Result<Vec<(String, String, Option<String>, String, i64, i64)>> {
        let mut conn = self.pool.get().context("get sqlite conn")?;
        Self::list_projects_conn(&mut conn)
    }

    pub fn get_active_project_id(&self) -> anyhow::Result<Option<String>> {
        let mut conn = self.pool.get().context("get sqlite conn")?;
        Self::get_active_project_id_conn(&mut conn)
    }

    pub fn set_active_project_id(&self, project_id: &str) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        conn.execute(
            "INSERT INTO meta (key, value) VALUES ('active_project_id', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![project_id],
        )
        .context("update active_project_id")?;
        Ok(())
    }

    pub fn get_project_key_by_id(&self, project_id: &str) -> anyhow::Result<Option<String>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        conn.query_row(
            "SELECT project_key FROM projects WHERE id = ?1",
            params![project_id],
            |r| r.get(0),
        )
        .optional()
        .context("select project_key by id")
    }

    pub fn get_active_project_id_for_user(&self, user_id: &str) -> anyhow::Result<Option<String>> {
        let mut conn = self.pool.get().context("get sqlite conn")?;
        Self::get_active_project_id_for_user_conn(&mut conn, user_id)
    }

    pub fn set_active_project_id_for_user(
        &self,
        project_id: &str,
        user_id: &str,
    ) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let key = format!("active_project_id:{}", user_id);
        conn.execute(
            "INSERT INTO meta (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, project_id],
        )
        .context("update active_project_id for user")?;
        Ok(())
    }

    pub fn get_project_id_by_key(&self, project_key: &str) -> anyhow::Result<Option<String>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let key = Self::normalize_project_key(project_key);
        conn.query_row(
            "SELECT id FROM projects WHERE project_key = ?1",
            params![key],
            |r| r.get(0),
        )
        .optional()
        .context("select project id by project_key")
    }

    pub fn get_project_meta_by_key(
        &self,
        project_key: &str,
    ) -> anyhow::Result<Option<ProjectMeta>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let key = Self::normalize_project_key(project_key);
        let row: Option<(String, String, Option<String>, String)> = conn
            .query_row(
                "SELECT id, name, project_key, lifecycle_status FROM projects WHERE project_key = ?1",
                params![key],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()
            .context("select project meta by project_key")?;
        Ok(row.map(|(id, name, pk, lifecycle_status)| ProjectMeta {
            id,
            name,
            project_key: pk.unwrap_or_default(),
            lifecycle_status,
        }))
    }

    pub fn get_project_meta_by_id(&self, project_id: &str) -> anyhow::Result<Option<ProjectMeta>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let row: Option<(String, String, Option<String>, String)> = conn
            .query_row(
                "SELECT id, name, project_key, lifecycle_status FROM projects WHERE id = ?1",
                params![project_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()
            .context("select project meta by id")?;
        Ok(row.map(|(id, name, pk, lifecycle_status)| ProjectMeta {
            id,
            name,
            project_key: pk.unwrap_or_default(),
            lifecycle_status,
        }))
    }

    pub fn set_project_lifecycle_status(
        &self,
        project_id: &str,
        lifecycle_status: &str,
    ) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let now = crate::time::now_ms();
        conn.execute(
            "UPDATE projects SET lifecycle_status = ?1, updated_at = ?2 WHERE id = ?3",
            params![lifecycle_status, now, project_id],
        )
        .context("update project lifecycle_status")?;
        Ok(())
    }

    pub fn list_entities_for_project(
        &self,
        project_id: &str,
    ) -> anyhow::Result<Vec<crate::models::Entity>> {
        let mut conn = self.pool.get().context("get sqlite conn")?;
        Self::list_entities_for_project_conn(&mut conn, project_id)
    }

    pub fn get_project_state(&self, project_id: &str) -> anyhow::Result<Option<Project>> {
        let mut conn = self.pool.get().context("get sqlite conn")?;

        let row: Option<(String, String, Option<String>, String, i64, i64)> = conn
            .query_row(
                "SELECT id, name, project_key, lifecycle_status, created_at, updated_at FROM projects WHERE id = ?1",
                params![project_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
            )
            .optional()
            .context("select project")?;

        let Some((id, name, project_key, lifecycle_status, created_at, updated_at)) = row else {
            return Ok(None);
        };

        let manifest = Self::get_manifest_for_project_conn(&mut conn, &id)?
            .unwrap_or_else(|| default_manifest());
        let entities = Self::list_entities_for_project_conn(&mut conn, &id)?;
        Ok(Some(Project {
            id,
            name,
            project_key,
            lifecycle_status: Some(lifecycle_status),
            created_at,
            updated_at,
            entities,
            config: ProjectConfig { manifest },
        }))
    }

    pub fn replace_project_state(&self, project: Project) -> anyhow::Result<()> {
        let mut conn = self.pool.get().context("get sqlite conn")?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .context("begin transaction")?;

        // Preserve wiki docs if the client omits them.
        // Client fetches wiki docs on-demand, so project state payload may not include `properties.doc`.
        let mut existing_wiki_doc_by_entity_id: HashMap<String, String> = HashMap::new();
        {
            let mut stmt = tx
                .prepare(
                    "SELECT id, properties_json
                     FROM entities
                     WHERE project_id = ?1 AND entity_id = 'wikiPage'",
                )
                .context("prepare select existing wiki entities")?;
            let rows = stmt
                .query_map(params![project.id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .context("query existing wiki entities")?;
            for r in rows {
                let (id, props_json) = r?;
                let v: serde_json::Value = match serde_json::from_str(&props_json) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let doc = v.get("doc").and_then(|d| d.as_str()).map(|s| s.to_string());
                if let Some(doc) = doc {
                    existing_wiki_doc_by_entity_id.insert(id, doc);
                }
            }
        }

        // --- Manifest version history (per project) ---
        let old_manifest_json: Option<String> = tx
            .query_row(
                "SELECT json FROM manifests WHERE project_id = ?1",
                params![project.id],
                |row| row.get(0),
            )
            .optional()
            .context("select existing manifest json")?;

        let new_json = serde_json::to_string(&project.config.manifest)
            .context("serialize incoming manifest for history")?;
        let unchanged = old_manifest_json
            .as_ref()
            .map(|s| s == &new_json)
            .unwrap_or(false);
        let now_ms = crate::time::now_ms();
        if !unchanged {
            let parent_id: Option<String> = tx
                .query_row(
                    "SELECT id FROM manifest_versions WHERE project_id = ?1 ORDER BY created_at DESC LIMIT 1",
                    params![project.id],
                    |row| row.get(0),
                )
                .optional()
                .context("select parent manifest version")?;

            let id = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO manifest_versions (id, project_id, created_at, actor_user_id, source, message, parent_id, json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    id,
                    project.id,
                    now_ms,
                    Option::<String>::None,
                    "project_state_put",
                    Option::<String>::None,
                    parent_id,
                    new_json
                ],
            )
            .with_context(|| format!("insert manifest_versions for project {}", project.id))?;
        }

        // Upsert project row
        let lifecycle = project.lifecycle_status.as_deref().unwrap_or("ready");
        tx.execute(
            "INSERT INTO projects (id, name, project_key, lifecycle_status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, project_key = excluded.project_key, lifecycle_status = excluded.lifecycle_status, created_at = excluded.created_at, updated_at = excluded.updated_at",
            params![project.id, project.name, project.project_key, lifecycle, project.created_at, project.updated_at],
        )
        .with_context(|| format!("upsert project {}", project.id))?;

        // Upsert manifest
        let manifest_json =
            serde_json::to_string(&project.config.manifest).context("serialize manifest")?;
        tx.execute(
            "INSERT INTO manifests (project_id, json) VALUES (?1, ?2)
             ON CONFLICT(project_id) DO UPDATE SET json = excluded.json",
            params![project.id, manifest_json],
        )
        .with_context(|| format!("upsert manifest {}", project.id))?;

        // Replace entities for this project only
        tx.execute(
            "DELETE FROM entities WHERE project_id = ?1",
            params![project.id],
        )
        .with_context(|| format!("delete entities for project {}", project.id))?;

        {
            let mut insert_entity = tx
                .prepare(
                    "INSERT INTO entities (id, project_id, entity_id, created_at, updated_at, properties_json)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                )
                .context("prepare insert entity")?;

            for e in &project.entities {
                let mut props = e.properties.clone();
                if e.entity_id == "wikiPage" && !props.contains_key("doc") {
                    if let Some(doc) = existing_wiki_doc_by_entity_id.get(&e.id) {
                        props.insert("doc".to_string(), serde_json::Value::String(doc.clone()));
                    }
                }
                let props_json = serde_json::to_string(&props).context("serialize entity props")?;
                insert_entity
                    .execute(params![
                        e.id,
                        project.id,
                        e.entity_id,
                        e.created_at,
                        e.updated_at,
                        props_json
                    ])
                    .with_context(|| format!("insert entity {}", e.id))?;
            }
        }

        // Bump global version marker
        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('version', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![now_ms.to_string()],
        )
        .context("update version")?;

        tx.commit().context("commit transaction")?;
        Ok(())
    }

    pub fn delete_project(&self, project_id: &str) -> anyhow::Result<()> {
        let mut conn = self.pool.get().context("get sqlite conn")?;
        let tx = conn.transaction().context("begin transaction")?;

        // Check if project exists
        let exists: Option<i64> = tx
            .query_row(
                "SELECT 1 FROM projects WHERE id = ?1",
                params![project_id],
                |row| row.get(0),
            )
            .optional()
            .context("check project exists")?;
        if exists.is_none() {
            anyhow::bail!("project not found");
        }

        // Delete related data (FK cascade should handle some, but we delete explicitly for clarity)
        tx.execute(
            "DELETE FROM manifest_versions WHERE project_id = ?1",
            params![project_id],
        )
        .context("delete manifest_versions")?;
        tx.execute(
            "DELETE FROM manifests WHERE project_id = ?1",
            params![project_id],
        )
        .context("delete manifests")?;
        tx.execute(
            "DELETE FROM project_counters WHERE project_id = ?1",
            params![project_id],
        )
        .context("delete project_counters")?;
        // entities and project_policies should be deleted by FK cascade, but delete explicitly
        tx.execute(
            "DELETE FROM entities WHERE project_id = ?1",
            params![project_id],
        )
        .context("delete entities")?;
        tx.execute(
            "DELETE FROM project_policies WHERE project_id = ?1",
            params![project_id],
        )
        .context("delete project_policies")?;
        // Finally delete the project
        tx.execute("DELETE FROM projects WHERE id = ?1", params![project_id])
            .context("delete project")?;

        // If deleted project was active, switch to another project
        let current_active: Option<String> = tx
            .query_row(
                "SELECT value FROM meta WHERE key = 'active_project_id'",
                [],
                |row| row.get(0),
            )
            .optional()
            .context("get active_project_id")?;
        if current_active.as_deref() == Some(project_id) {
            // Find another project
            let alternative: Option<String> = tx
                .query_row("SELECT id FROM projects LIMIT 1", [], |row| row.get(0))
                .optional()
                .context("select alternative project")?;
            if let Some(alt_id) = alternative {
                tx.execute(
                    "INSERT INTO meta (key, value) VALUES ('active_project_id', ?1)
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    params![alt_id],
                )
                .context("update active_project_id")?;
            } else {
                // No projects left, clear active_project_id
                tx.execute("DELETE FROM meta WHERE key = 'active_project_id'", [])
                    .context("clear active_project_id")?;
            }
        }

        tx.commit().context("commit transaction")?;
        Ok(())
    }
}
