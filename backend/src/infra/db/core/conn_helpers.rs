use anyhow::Context;
use rusqlite::{params, OptionalExtension};

use crate::models::{Entity, ProjectManifest};

use super::Db;

impl Db {
    pub(crate) fn normalize_project_key(s: &str) -> String {
        s.trim().to_uppercase()
    }

    pub(crate) fn is_valid_project_key(s: &str) -> bool {
        // 3-10 chars, A-Z0-9
        let k = Self::normalize_project_key(s);
        let bytes = k.as_bytes();
        if bytes.len() < 3 || bytes.len() > 10 {
            return false;
        }
        bytes.iter().all(|b| matches!(b, b'A'..=b'Z' | b'0'..=b'9'))
    }

    pub(crate) fn list_projects_conn(
        conn: &mut rusqlite::Connection,
    ) -> anyhow::Result<Vec<(String, String, Option<String>, String, i64, i64)>> {
        let mut stmt = conn
            .prepare("SELECT id, name, project_key, lifecycle_status, created_at, updated_at FROM projects ORDER BY updated_at DESC")
            .context("prepare list projects")?;
        let rows = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                let name: String = row.get(1)?;
                let project_key: Option<String> = row.get(2)?;
                let lifecycle_status: String = row.get(3)?;
                let created_at: i64 = row.get(4)?;
                let updated_at: i64 = row.get(5)?;
                Ok((
                    id,
                    name,
                    project_key,
                    lifecycle_status,
                    created_at,
                    updated_at,
                ))
            })
            .context("query projects")?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    pub(crate) fn get_manifest_for_project_conn(
        conn: &mut rusqlite::Connection,
        project_id: &str,
    ) -> anyhow::Result<Option<ProjectManifest>> {
        let json: Option<String> = conn
            .query_row(
                "SELECT json FROM manifests WHERE project_id = ?1",
                params![project_id],
                |row| row.get(0),
            )
            .optional()
            .context("select manifest by project")?;
        match json {
            None => Ok(None),
            Some(s) => Ok(Some(
                serde_json::from_str(&s).context("deserialize manifest")?,
            )),
        }
    }

    pub(crate) fn list_entities_for_project_conn(
        conn: &mut rusqlite::Connection,
        project_id: &str,
    ) -> anyhow::Result<Vec<Entity>> {
        let mut stmt = conn
            .prepare(
                "SELECT id, entity_id, created_at, updated_at, properties_json
                 FROM entities
                 WHERE project_id = ?1",
            )
            .context("prepare list entities")?;

        let rows = stmt
            .query_map(params![project_id], |row| {
                let id: String = row.get(0)?;
                let entity_id: String = row.get(1)?;
                let created_at: i64 = row.get(2)?;
                let updated_at: i64 = row.get(3)?;
                let props_json: String = row.get(4)?;
                Ok((id, entity_id, created_at, updated_at, props_json))
            })
            .context("query entities")?;

        let mut entities = Vec::new();
        for row in rows {
            let (id, entity_id, created_at, updated_at, props_json) = row?;
            let props: serde_json::Map<String, serde_json::Value> =
                serde_json::from_str(&props_json).context("deserialize entity props")?;
            entities.push(Entity {
                id,
                entity_id,
                created_at,
                updated_at,
                properties: props,
            });
        }
        Ok(entities)
    }

    pub(crate) fn get_active_project_id_conn(
        conn: &mut rusqlite::Connection,
    ) -> anyhow::Result<Option<String>> {
        conn.query_row(
            "SELECT value FROM meta WHERE key = 'active_project_id'",
            [],
            |row| row.get(0),
        )
        .optional()
        .context("select active_project_id")
    }

    pub(crate) fn get_active_project_id_for_user_conn(
        conn: &mut rusqlite::Connection,
        user_id: &str,
    ) -> anyhow::Result<Option<String>> {
        let key = format!("active_project_id:{}", user_id);
        conn.query_row(
            "SELECT value FROM meta WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .context("select active_project_id for user")
    }

    pub(crate) fn get_version_conn(conn: &mut rusqlite::Connection) -> anyhow::Result<Option<i64>> {
        let s: Option<String> = conn
            .query_row("SELECT value FROM meta WHERE key = 'version'", [], |row| {
                row.get(0)
            })
            .optional()
            .context("select version")?;
        Ok(s.and_then(|v| v.parse::<i64>().ok()))
    }
}
