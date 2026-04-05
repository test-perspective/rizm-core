use anyhow::Context;
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

use super::Db;

#[derive(Debug, Clone)]
pub struct ImportSessionRecord {
    pub id: String,
    pub provider: String,
    pub project_id: Option<String>,
    pub created_by_user_id: String,
    pub connection_config_json: String,
    pub metadata_json: Option<String>,
    pub mapping_config_json: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone)]
pub struct ImportJobRecord {
    pub id: String,
    pub session_id: String,
    pub project_id: String,
    pub status: String,
    pub progress_percent: i64,
    pub processed_count: i64,
    pub total_count: Option<i64>,
    pub error_message: Option<String>,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct EntityExternalIdRecord {
    pub project_id: String,
    pub entity_id: String,
    pub provider: String,
    pub external_id: String,
    pub external_key: Option<String>,
    pub created_at: i64,
}

impl Db {
    pub fn create_import_session(
        &self,
        provider: &str,
        created_by_user_id: &str,
        connection_config_json: &str,
    ) -> anyhow::Result<ImportSessionRecord> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let id = Uuid::new_v4().to_string();
        let now = crate::time::now_ms();
        conn.execute(
            "INSERT INTO import_sessions (id, provider, project_id, created_by_user_id, connection_config_json, metadata_json, mapping_config_json, created_at, updated_at)
             VALUES (?1, ?2, NULL, ?3, ?4, NULL, NULL, ?5, ?6)",
            params![id, provider, created_by_user_id, connection_config_json, now, now],
        )
        .context("insert import_session")?;
        Ok(ImportSessionRecord {
            id: id.clone(),
            provider: provider.to_string(),
            project_id: None,
            created_by_user_id: created_by_user_id.to_string(),
            connection_config_json: connection_config_json.to_string(),
            metadata_json: None,
            mapping_config_json: None,
            created_at: now,
            updated_at: now,
        })
    }

    pub fn get_import_session(&self, session_id: &str) -> anyhow::Result<Option<ImportSessionRecord>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let row: Option<(String, String, Option<String>, String, String, Option<String>, Option<String>, i64, i64)> = conn
            .query_row(
                "SELECT id, provider, project_id, created_by_user_id, connection_config_json, metadata_json, mapping_config_json, created_at, updated_at
                 FROM import_sessions WHERE id = ?1",
                params![session_id],
                |r| {
                    Ok((
                        r.get(0)?,
                        r.get(1)?,
                        r.get(2)?,
                        r.get(3)?,
                        r.get(4)?,
                        r.get(5)?,
                        r.get(6)?,
                        r.get(7)?,
                        r.get(8)?,
                    ))
                },
            )
            .optional()
            .context("select import_session")?;
        Ok(row.map(
            |(id, provider, project_id, created_by_user_id, connection_config_json, metadata_json, mapping_config_json, created_at, updated_at)| {
                ImportSessionRecord {
                    id,
                    provider,
                    project_id,
                    created_by_user_id,
                    connection_config_json,
                    metadata_json,
                    mapping_config_json,
                    created_at,
                    updated_at,
                }
            },
        ))
    }

    pub fn update_import_session_metadata(
        &self,
        session_id: &str,
        metadata_json: &str,
    ) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let now = crate::time::now_ms();
        conn.execute(
            "UPDATE import_sessions SET metadata_json = ?1, updated_at = ?2 WHERE id = ?3",
            params![metadata_json, now, session_id],
        )
        .context("update import_session metadata")?;
        Ok(())
    }

    pub fn update_import_session_mapping(
        &self,
        session_id: &str,
        mapping_config_json: &str,
    ) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let now = crate::time::now_ms();
        conn.execute(
            "UPDATE import_sessions SET mapping_config_json = ?1, updated_at = ?2 WHERE id = ?3",
            params![mapping_config_json, now, session_id],
        )
        .context("update import_session mapping")?;
        Ok(())
    }

    pub fn update_import_session_project(
        &self,
        session_id: &str,
        project_id: &str,
    ) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let now = crate::time::now_ms();
        conn.execute(
            "UPDATE import_sessions SET project_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![project_id, now, session_id],
        )
        .context("update import_session project_id")?;
        Ok(())
    }

    pub fn create_import_job(
        &self,
        session_id: &str,
        project_id: &str,
    ) -> anyhow::Result<ImportJobRecord> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let id = Uuid::new_v4().to_string();
        let now = crate::time::now_ms();
        conn.execute(
            "INSERT INTO import_jobs (id, session_id, project_id, status, progress_percent, processed_count, total_count, error_message, started_at, completed_at, created_at)
             VALUES (?1, ?2, ?3, 'pending', 0, 0, NULL, NULL, NULL, NULL, ?4)",
            params![id, session_id, project_id, now],
        )
        .context("insert import_job")?;
        Ok(ImportJobRecord {
            id: id.clone(),
            session_id: session_id.to_string(),
            project_id: project_id.to_string(),
            status: "pending".to_string(),
            progress_percent: 0,
            processed_count: 0,
            total_count: None,
            error_message: None,
            started_at: None,
            completed_at: None,
            created_at: now,
        })
    }

    pub fn get_import_job(&self, job_id: &str) -> anyhow::Result<Option<ImportJobRecord>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let row: Option<(String, String, String, String, i64, i64, Option<i64>, Option<String>, Option<i64>, Option<i64>, i64)> = conn
            .query_row(
                "SELECT id, session_id, project_id, status, progress_percent, COALESCE(processed_count,0), total_count, error_message, started_at, completed_at, created_at
                 FROM import_jobs WHERE id = ?1",
                params![job_id],
                |r| {
                    Ok((
                        r.get(0)?,
                        r.get(1)?,
                        r.get(2)?,
                        r.get(3)?,
                        r.get(4)?,
                        r.get(5)?,
                        r.get(6)?,
                        r.get(7)?,
                        r.get(8)?,
                        r.get(9)?,
                        r.get(10)?,
                    ))
                },
            )
            .optional()
            .context("select import_job")?;
        Ok(row.map(
            |(id, session_id, project_id, status, progress_percent, processed_count, total_count, error_message, started_at, completed_at, created_at)| {
                ImportJobRecord {
                    id,
                    session_id,
                    project_id,
                    status,
                    progress_percent,
                    processed_count,
                    total_count,
                    error_message,
                    started_at,
                    completed_at,
                    created_at,
                }
            },
        ))
    }

    pub fn get_import_job_by_project(&self, project_id: &str) -> anyhow::Result<Option<ImportJobRecord>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let row: Option<(String, String, String, String, i64, i64, Option<i64>, Option<String>, Option<i64>, Option<i64>, i64)> = conn
            .query_row(
                "SELECT id, session_id, project_id, status, progress_percent, COALESCE(processed_count,0), total_count, error_message, started_at, completed_at, created_at
                 FROM import_jobs WHERE project_id = ?1 ORDER BY created_at DESC LIMIT 1",
                params![project_id],
                |r| {
                    Ok((
                        r.get(0)?,
                        r.get(1)?,
                        r.get(2)?,
                        r.get(3)?,
                        r.get(4)?,
                        r.get(5)?,
                        r.get(6)?,
                        r.get(7)?,
                        r.get(8)?,
                        r.get(9)?,
                        r.get(10)?,
                    ))
                },
            )
            .optional()
            .context("select import_job by project")?;
        Ok(row.map(
            |(id, session_id, project_id, status, progress_percent, processed_count, total_count, error_message, started_at, completed_at, created_at)| {
                ImportJobRecord {
                    id,
                    session_id,
                    project_id,
                    status,
                    progress_percent,
                    processed_count,
                    total_count,
                    error_message,
                    started_at,
                    completed_at,
                    created_at,
                }
            },
        ))
    }

    pub fn set_import_job_running(&self, job_id: &str) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let now = crate::time::now_ms();
        conn.execute(
            "UPDATE import_jobs SET status = 'running', started_at = ?1 WHERE id = ?2 AND status = 'pending'",
            params![now, job_id],
        )
        .context("update import_job running")?;
        Ok(())
    }

    pub fn set_import_job_progress(&self, job_id: &str, progress_percent: i64) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        conn.execute(
            "UPDATE import_jobs SET progress_percent = ?1 WHERE id = ?2",
            params![progress_percent, job_id],
        )
        .context("update import_job progress")?;
        Ok(())
    }

    pub fn set_import_job_progress_detailed(
        &self,
        job_id: &str,
        progress_percent: i64,
        processed_count: i64,
        total_count: Option<i64>,
    ) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        conn.execute(
            "UPDATE import_jobs SET progress_percent = ?1, processed_count = ?2, total_count = ?3 WHERE id = ?4",
            params![progress_percent, processed_count, total_count, job_id],
        )
        .context("update import_job progress detailed")?;
        Ok(())
    }

    pub fn set_import_job_completed(&self, job_id: &str) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let now = crate::time::now_ms();
        conn.execute(
            "UPDATE import_jobs SET status = 'completed', progress_percent = 100, completed_at = ?1 WHERE id = ?2",
            params![now, job_id],
        )
        .context("update import_job completed")?;
        Ok(())
    }

    pub fn set_import_job_failed(&self, job_id: &str, error_message: &str) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let now = crate::time::now_ms();
        conn.execute(
            "UPDATE import_jobs SET status = 'failed', error_message = ?1, completed_at = ?2 WHERE id = ?3",
            params![error_message, now, job_id],
        )
        .context("update import_job failed")?;
        Ok(())
    }

    pub fn upsert_entity_external_id(
        &self,
        project_id: &str,
        entity_id: &str,
        provider: &str,
        external_id: &str,
        external_key: Option<&str>,
    ) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let now = crate::time::now_ms();
        conn.execute(
            "INSERT INTO entity_external_ids (project_id, entity_id, provider, external_id, external_key, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(project_id, entity_id, provider) DO UPDATE SET external_id = excluded.external_id, external_key = excluded.external_key",
            params![project_id, entity_id, provider, external_id, external_key, now],
        )
        .context("upsert entity_external_id")?;
        Ok(())
    }

    pub fn get_entity_id_by_external(
        &self,
        project_id: &str,
        provider: &str,
        external_id: &str,
    ) -> anyhow::Result<Option<String>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        conn.query_row(
            "SELECT entity_id FROM entity_external_ids WHERE project_id = ?1 AND provider = ?2 AND external_id = ?3",
            params![project_id, provider, external_id],
            |r| r.get(0),
        )
        .optional()
        .context("select entity_id by external")
    }

    /// List internal entity row ids (`entities.id`) linked to an external provider (e.g. Jira) for a project.
    pub fn list_entity_ids_with_external_provider(
        &self,
        project_id: &str,
        provider: &str,
    ) -> anyhow::Result<Vec<String>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let mut stmt = conn
            .prepare(
                "SELECT entity_id FROM entity_external_ids WHERE project_id = ?1 AND provider = ?2",
            )
            .context("prepare list entity_external_ids")?;
        let rows = stmt
            .query_map(params![project_id, provider], |r| r.get::<_, String>(0))
            .context("query list entity_external_ids")?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.context("read entity_id")?);
        }
        Ok(out)
    }

    pub fn get_user_import_config(&self, user_id: &str, provider: &str) -> anyhow::Result<Option<String>> {
        let key = format!("import_config:{}:{}", user_id, provider);
        let conn = self.pool.get().context("get sqlite conn")?;
        conn.query_row("SELECT value FROM meta WHERE key = ?1", params![key], |r| r.get(0))
            .optional()
            .context("select user import config")
    }

    pub fn set_user_import_config(&self, user_id: &str, provider: &str, config_json: &str) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let key = format!("import_config:{}:{}", user_id, provider);
        conn.execute(
            "INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, config_json],
        )
        .context("upsert user import config")?;
        Ok(())
    }
}
