use anyhow::Context;
use rusqlite::{params, OptionalExtension};

use super::Db;

impl Db {
    pub fn hide_manifest_version(
        &self,
        project_id: &str,
        version_id: &str,
        _actor_user_id: Option<&str>,
    ) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        ensure_project_exists(&conn, project_id)?;

        let version_exists: Option<i64> = conn
            .query_row(
                "SELECT 1 FROM manifest_versions WHERE project_id = ?1 AND id = ?2",
                params![project_id, version_id],
                |row| row.get(0),
            )
            .optional()
            .context("check version exists")?;
        if version_exists.is_none() {
            anyhow::bail!("version not found");
        }

        conn.execute(
            "UPDATE manifest_versions SET source = 'hidden' WHERE project_id = ?1 AND id = ?2",
            params![project_id, version_id],
        )
        .context("hide manifest version")?;

        Ok(())
    }

    pub fn clear_manifest_versions(
        &self,
        project_id: &str,
        _actor_user_id: Option<&str>,
    ) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        ensure_project_exists(&conn, project_id)?;

        conn.execute(
            "UPDATE manifest_versions SET source = 'hidden' WHERE project_id = ?1 AND source IN ('ai_transform', 'manifest_editor', 'revert')",
            params![project_id],
        )
        .context("clear manifest versions")?;

        Ok(())
    }
}

fn ensure_project_exists(conn: &rusqlite::Connection, project_id: &str) -> anyhow::Result<()> {
    let exists: Option<i64> = conn
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
    Ok(())
}
