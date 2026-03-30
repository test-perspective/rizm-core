use anyhow::Context;
use rusqlite::{params, OptionalExtension};

use crate::models::ProjectPolicy;

use super::Db;

impl Db {
    // --- Project Policies ---

    pub fn get_project_policy(&self, project_id: &str) -> anyhow::Result<Option<ProjectPolicy>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let policy_json: Option<String> = conn
            .query_row(
                "SELECT policy_json FROM project_policies WHERE project_id = ?1",
                params![project_id],
                |row| row.get(0),
            )
            .optional()
            .context("select project policy")?;

        if let Some(json) = policy_json {
            let policy: ProjectPolicy = serde_json::from_str(&json).context("deserialize project policy")?;
            Ok(Some(policy))
        } else {
            Ok(None)
        }
    }

    pub fn set_project_policy(&self, project_id: &str, policy: ProjectPolicy) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let policy_json = serde_json::to_string(&policy).context("serialize project policy")?;
        let now_ms = crate::time::now_ms();

        conn.execute(
            "INSERT INTO project_policies (project_id, policy_json, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(project_id) DO UPDATE SET policy_json = excluded.policy_json, updated_at = excluded.updated_at",
            params![project_id, policy_json, now_ms],
        )
        .context("upsert project policy")?;

        Ok(())
    }

    // --- User Dashboard Policies ---

    pub fn get_user_dashboard_policy_json(&self, user_id: &str) -> anyhow::Result<Option<String>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let policy_json: Option<String> = conn
            .query_row(
                "SELECT policy_json FROM user_dashboard_policies WHERE user_id = ?1",
                params![user_id],
                |row| row.get(0),
            )
            .optional()
            .context("select user dashboard policy")?;
        Ok(policy_json)
    }

    pub fn set_user_dashboard_policy_json(&self, user_id: &str, policy_json: &str) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let now_ms = crate::time::now_ms();
        conn.execute(
            "INSERT INTO user_dashboard_policies (user_id, policy_json, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(user_id) DO UPDATE SET policy_json = excluded.policy_json, updated_at = excluded.updated_at",
            params![user_id, policy_json, now_ms],
        )
        .context("upsert user dashboard policy")?;
        Ok(())
    }
}

