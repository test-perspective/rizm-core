use anyhow::Context;
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

use crate::defaults::default_manifest;
use crate::models::{Project, ProjectConfig, StorageData};

use super::Db;

impl Db {
    pub fn get_state(&self) -> anyhow::Result<StorageData> {
        let mut conn = self.pool.get().context("get sqlite conn")?;

        let rows = Self::list_projects_conn(&mut conn)?;
        let mut projects: Vec<Project> = Vec::new();
        for (id, name, project_key, lifecycle_status, created_at, updated_at) in rows {
            let manifest = Self::get_manifest_for_project_conn(&mut conn, &id)?
                .unwrap_or_else(|| default_manifest());
            let entities = Self::list_entities_for_project_conn(&mut conn, &id)?;
            projects.push(Project {
                id,
                name,
                project_key,
                lifecycle_status: Some(lifecycle_status),
                created_at,
                updated_at,
                entities,
                config: ProjectConfig { manifest },
            });
        }

        // If the DB is in a weird state, ensure we still return a valid default.
        if projects.is_empty() {
            self.seed_if_empty()?;
            return self.get_state();
        }

        let version = Self::get_version_conn(&mut conn)?.unwrap_or(0);
        let active = Self::get_active_project_id_conn(&mut conn)?
            .filter(|id| projects.iter().any(|p| p.id == *id))
            .unwrap_or_else(|| projects[0].id.clone());

        Ok(StorageData {
            projects,
            active_project_id: active,
            version,
        })
    }

    pub fn replace_state(&self, data: StorageData) -> anyhow::Result<()> {
        let mut conn = self.pool.get().context("get sqlite conn")?;
        let tx = conn.transaction().context("begin transaction")?;

        // --- Manifest version history ---
        // Keep manifest_versions across saves, but clean up versions for projects removed by replace.
        let incoming_ids: std::collections::HashSet<String> = data.projects.iter().map(|p| p.id.clone()).collect();
        let mut existing_project_ids: Vec<String> = Vec::new();
        {
            let mut stmt = tx.prepare("SELECT id FROM projects").context("prepare select projects ids")?;
            let rows = stmt
                .query_map([], |row| row.get::<_, String>(0))
                .context("query select projects ids")?;
            for r in rows {
                existing_project_ids.push(r?);
            }
        }
        for pid in existing_project_ids {
            if !incoming_ids.contains(&pid) {
                tx.execute(
                    "DELETE FROM manifest_versions WHERE project_id = ?1",
                    params![pid],
                )
                .with_context(|| format!("delete manifest_versions for removed project {}", pid))?;
            }
        }

        // Snapshot current manifests to detect changes.
        let mut old_manifest_json: std::collections::HashMap<String, String> = std::collections::HashMap::new();
        {
            let mut stmt = tx
                .prepare("SELECT project_id, json FROM manifests")
                .context("prepare select manifests")?;
            let rows = stmt
                .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
                .context("query select manifests")?;
            for r in rows {
                let (pid, json) = r?;
                old_manifest_json.insert(pid, json);
            }
        }

        let now_ms = crate::time::now_ms();
        for p in &data.projects {
            let new_json = serde_json::to_string(&p.config.manifest).context("serialize incoming manifest for history")?;
            let unchanged = old_manifest_json.get(&p.id).map(|s| s == &new_json).unwrap_or(false);
            if unchanged {
                continue;
            }

            let parent_id: Option<String> = tx
                .query_row(
                    "SELECT id FROM manifest_versions WHERE project_id = ?1 ORDER BY created_at DESC LIMIT 1",
                    params![p.id],
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
                    p.id,
                    now_ms,
                    Option::<String>::None,
                    "state_put",
                    Option::<String>::None,
                    parent_id,
                    new_json
                ],
            )
            .with_context(|| format!("insert manifest_versions for project {}", p.id))?;
        }

        // Replace semantics (simple prototype)
        tx.execute("DELETE FROM entities", []).context("delete entities")?;
        tx.execute("DELETE FROM manifests", []).context("delete manifests")?;
        tx.execute("DELETE FROM projects", []).context("delete projects")?;

        // Projects + manifests + entities
        {
            let mut insert_project = tx
                .prepare("INSERT INTO projects (id, name, project_key, lifecycle_status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
                .context("prepare insert project")?;
            let mut upsert_manifest = tx
                .prepare(
                    "INSERT INTO manifests (project_id, json) VALUES (?1, ?2)
                     ON CONFLICT(project_id) DO UPDATE SET json = excluded.json",
                )
                .context("prepare upsert manifest")?;
            let mut insert_entity = tx
                .prepare(
                    "INSERT INTO entities (id, project_id, entity_id, created_at, updated_at, properties_json)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                )
                .context("prepare insert entity")?;

            for p in &data.projects {
                let lifecycle = p.lifecycle_status.as_deref().unwrap_or("ready");
                insert_project
                    .execute(params![p.id, p.name, p.project_key, lifecycle, p.created_at, p.updated_at])
                    .with_context(|| format!("insert project {}", p.id))?;

                let manifest_json = serde_json::to_string(&p.config.manifest).context("serialize manifest")?;
                upsert_manifest
                    .execute(params![p.id, manifest_json])
                    .with_context(|| format!("upsert manifest {}", p.id))?;

                for e in &p.entities {
                    let props_json = serde_json::to_string(&e.properties).context("serialize entity props")?;
                    insert_entity
                        .execute(params![e.id, p.id, e.entity_id, e.created_at, e.updated_at, props_json])
                        .with_context(|| format!("insert entity {}", e.id))?;
                }
            }
        }

        // Version
        let version_str = data.version.to_string();
        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('version', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![version_str],
        )
        .context("update version")?;

        // Active project id
        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('active_project_id', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![data.active_project_id],
        )
        .context("update active_project_id")?;

        tx.commit().context("commit transaction")?;
        Ok(())
    }
}

