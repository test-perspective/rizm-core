use anyhow::Context;
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

use crate::defaults::default_manifest;
use crate::models::{ManifestVersionSummary, ProjectManifest};

use super::{Db, ManifestWriteError};

mod visibility;

impl Db {
    pub fn get_manifest_with_etag(
        &self,
        project_id: &str,
    ) -> anyhow::Result<Option<(ProjectManifest, String)>> {
        let mut conn = self.pool.get().context("get sqlite conn")?;

        // Ensure project exists.
        let project_exists: Option<String> = conn
            .query_row(
                "SELECT id FROM projects WHERE id = ?1",
                params![project_id],
                |r| r.get(0),
            )
            .optional()
            .context("check project exists")?;
        if project_exists.is_none() {
            return Ok(None);
        }

        let manifest = Self::get_manifest_for_project_conn(&mut conn, project_id)?
            .unwrap_or_else(|| default_manifest());
        // Try to get ETag from manifest_versions first (for history entries)
        let etag: Option<String> = conn
            .query_row(
                "SELECT id FROM manifest_versions WHERE project_id = ?1 ORDER BY created_at DESC LIMIT 1",
                params![project_id],
                |r| r.get(0),
            )
            .optional()
            .context("select manifest etag from versions")?;
        // If no history entry exists, use project updated_at as ETag
        let etag = if let Some(id) = etag {
            id
        } else {
            let updated_at: Option<i64> = conn
                .query_row(
                    "SELECT updated_at FROM projects WHERE id = ?1",
                    params![project_id],
                    |r| r.get(0),
                )
                .optional()
                .context("select project updated_at for etag")?;
            updated_at
                .map(|t| t.to_string())
                .unwrap_or_else(|| "0".to_string())
        };
        Ok(Some((manifest, etag)))
    }

    pub fn put_manifest_if_match(
        &self,
        project_id: &str,
        expected_etag: &str,
        manifest: ProjectManifest,
        source: Option<&str>,
        message: Option<&str>,
        actor_user_id: Option<&str>,
    ) -> Result<String, ManifestWriteError> {
        let mut conn = match self.pool.get() {
            Ok(c) => c,
            Err(_) => return Err(ManifestWriteError::NotFound),
        };
        let tx = conn
            .transaction()
            .map_err(|_| ManifestWriteError::NotFound)?;

        // Ensure project exists.
        let project_exists: Option<String> = tx
            .query_row(
                "SELECT id FROM projects WHERE id = ?1",
                params![project_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| ManifestWriteError::NotFound)?;
        if project_exists.is_none() {
            return Err(ManifestWriteError::NotFound);
        }

        // Get current ETag (from manifest_versions or projects.updated_at)
        let current_etag: Option<String> = tx
            .query_row(
                "SELECT id FROM manifest_versions WHERE project_id = ?1 ORDER BY created_at DESC LIMIT 1",
                params![project_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| ManifestWriteError::NotFound)?;
        let current_etag = if let Some(id) = current_etag {
            id
        } else {
            let updated_at: Option<i64> = tx
                .query_row(
                    "SELECT updated_at FROM projects WHERE id = ?1",
                    params![project_id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|_| ManifestWriteError::NotFound)?;
            updated_at
                .map(|t| t.to_string())
                .unwrap_or_else(|| "0".to_string())
        };
        if current_etag != expected_etag {
            return Err(ManifestWriteError::Conflict { current_etag });
        }

        let now_ms = crate::time::now_ms();
        let previous_manifest_json: String = tx
            .query_row(
                "SELECT json FROM manifests WHERE project_id = ?1",
                params![project_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| ManifestWriteError::NotFound)?
            .unwrap_or_else(|| {
                serde_json::to_string(&default_manifest()).unwrap_or_else(|_| "{}".to_string())
            });
        let json = serde_json::to_string(&manifest).map_err(|_| ManifestWriteError::NotFound)?;

        // Apply as current manifest.
        tx.execute(
            "INSERT INTO manifests (project_id, json) VALUES (?1, ?2)
             ON CONFLICT(project_id) DO UPDATE SET json = excluded.json",
            params![project_id, json],
        )
        .map_err(|_| ManifestWriteError::NotFound)?;

        // Update project updated_at
        tx.execute(
            "UPDATE projects SET updated_at = ?1 WHERE id = ?2",
            params![now_ms, project_id],
        )
        .map_err(|_| ManifestWriteError::NotFound)?;

        // Only append history snapshot if source is specified and not "silent"
        let should_record_history = source.is_some() && source != Some("silent");
        let new_etag = if should_record_history {
            // Ensure first visible history item has a restorable baseline snapshot.
            let visible_history_count: i64 = tx
                .query_row(
                    "SELECT COUNT(1) FROM manifest_versions
                     WHERE project_id = ?1 AND source IN ('ai_transform', 'manifest_editor', 'revert', 'seed')",
                    params![project_id],
                    |r| r.get(0),
                )
                .map_err(|_| ManifestWriteError::NotFound)?;
            if visible_history_count == 0 {
                let seed_id = Uuid::new_v4().to_string();
                tx.execute(
                    "INSERT INTO manifest_versions (id, project_id, created_at, actor_user_id, source, message, parent_id, json)
                     VALUES (?1, ?2, ?3, NULL, ?4, ?5, NULL, ?6)",
                    params![
                        seed_id,
                        project_id,
                        now_ms.saturating_sub(1),
                        "seed",
                        Some("initial".to_string()),
                        previous_manifest_json
                    ],
                )
                .map_err(|_| ManifestWriteError::NotFound)?;
            }

            let new_id = Uuid::new_v4().to_string();
            let source_str = source.unwrap_or("manifest_put");
            tx.execute(
                "INSERT INTO manifest_versions (id, project_id, created_at, actor_user_id, source, message, parent_id, json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    new_id,
                    project_id,
                    now_ms,
                    actor_user_id,
                    source_str,
                    message,
                    if expected_etag == "0" { Option::<String>::None } else { Some(expected_etag.to_string()) },
                    json,
                ],
            )
            .map_err(|_| ManifestWriteError::NotFound)?;
            new_id
        } else {
            // Use updated_at as ETag when not recording history
            now_ms.to_string()
        };

        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('version', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![now_ms.to_string()],
        )
        .map_err(|_| ManifestWriteError::NotFound)?;

        tx.commit().map_err(|_| ManifestWriteError::NotFound)?;
        Ok(new_etag)
    }

    pub fn list_manifest_versions(
        &self,
        project_id: &str,
        limit: i64,
        offset: i64,
    ) -> anyhow::Result<Vec<ManifestVersionSummary>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        // Only show history entries with visible sources: ai_transform, manifest_editor, revert
        // Hidden sources: silent, manifest_put, hidden
        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, created_at, actor_user_id, source, message, parent_id
                 FROM manifest_versions
                 WHERE project_id = ?1 AND source IN ('ai_transform', 'manifest_editor', 'revert', 'seed')
                 ORDER BY created_at DESC
                 LIMIT ?2 OFFSET ?3",
            )
            .context("prepare list manifest_versions")?;
        let rows = stmt
            .query_map(params![project_id, limit, offset], |row| {
                Ok(ManifestVersionSummary {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    created_at: row.get(2)?,
                    actor_user_id: row.get(3)?,
                    source: row.get(4)?,
                    message: row.get(5)?,
                    parent_id: row.get(6)?,
                })
            })
            .context("query list manifest_versions")?;

        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    pub fn get_manifest_version(
        &self,
        project_id: &str,
        version_id: &str,
    ) -> anyhow::Result<Option<(ManifestVersionSummary, ProjectManifest)>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, created_at, actor_user_id, source, message, parent_id, json
                 FROM manifest_versions
                 WHERE project_id = ?1 AND id = ?2",
            )
            .context("prepare select manifest_versions by id")?;
        let row = stmt
            .query_row(params![project_id, version_id], |row| {
                let json: String = row.get(7)?;
                Ok((
                    ManifestVersionSummary {
                        id: row.get(0)?,
                        project_id: row.get(1)?,
                        created_at: row.get(2)?,
                        actor_user_id: row.get(3)?,
                        source: row.get(4)?,
                        message: row.get(5)?,
                        parent_id: row.get(6)?,
                    },
                    json,
                ))
            })
            .optional()
            .context("query manifest_versions by id")?;
        let Some((summary, json)) = row else {
            return Ok(None);
        };
        let manifest =
            serde_json::from_str::<ProjectManifest>(&json).context("deserialize manifest json")?;
        Ok(Some((summary, manifest)))
    }

    pub fn revert_manifest_to_version(
        &self,
        project_id: &str,
        version_id: &str,
        actor_user_id: Option<&str>,
        message: Option<&str>,
    ) -> anyhow::Result<()> {
        let mut conn = self.pool.get().context("get sqlite conn")?;
        let tx = conn.transaction().context("begin tx")?;

        // Ensure project exists.
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

        // Load target manifest JSON from history.
        let target_json: String = tx
            .query_row(
                "SELECT json FROM manifest_versions WHERE project_id = ?1 AND id = ?2",
                params![project_id, version_id],
                |row| row.get(0),
            )
            .optional()
            .context("select target manifest_version json")?
            .ok_or_else(|| anyhow::anyhow!("version not found"))?;

        // Validate it still matches current ProjectManifest shape.
        let _: ProjectManifest =
            serde_json::from_str(&target_json).context("deserialize target manifest")?;

        let parent_id: Option<String> = tx
            .query_row(
                "SELECT id FROM manifest_versions WHERE project_id = ?1 ORDER BY created_at DESC LIMIT 1",
                params![project_id],
                |row| row.get(0),
            )
            .optional()
            .context("select parent manifest version")?;

        let now = crate::time::now_ms();

        // Apply as current manifest.
        tx.execute(
            "INSERT INTO manifests (project_id, json) VALUES (?1, ?2)
             ON CONFLICT(project_id) DO UPDATE SET json = excluded.json",
            params![project_id, target_json],
        )
        .context("upsert manifests for revert")?;

        // Bump project updated_at.
        tx.execute(
            "UPDATE projects SET updated_at = ?2 WHERE id = ?1",
            params![project_id, now],
        )
        .context("update project updated_at")?;

        // Record the revert as a new version so history stays linear.
        let id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO manifest_versions (id, project_id, created_at, actor_user_id, source, message, parent_id, json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                id,
                project_id,
                now,
                actor_user_id,
                "revert",
                message.map(|s| s.to_string()),
                parent_id,
                target_json
            ],
        )
        .context("insert manifest_versions revert")?;

        // Also bump global version so other clients can observe change if they poll /state.
        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('version', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![now.to_string()],
        )
        .context("update meta version")?;

        tx.commit().context("commit tx")?;
        Ok(())
    }
}
