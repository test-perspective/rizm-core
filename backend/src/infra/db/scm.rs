use anyhow::Context;
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

use super::types::{ProjectScmConfigRecord, ScmOAuthStateRecord, UserScmCredentialRecord};
use super::Db;

impl Db {
    // --- Project SCM Configs ---

    pub fn get_project_scm_config(&self, project_id: &str, provider: &str) -> anyhow::Result<Option<ProjectScmConfigRecord>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let row: Option<(String, String, String, i64)> = conn
            .query_row(
                "SELECT project_id, provider, config_json, updated_at
                 FROM project_scm_configs
                 WHERE project_id = ?1 AND provider = ?2",
                params![project_id, provider],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()
            .context("select project_scm_config")?;
        Ok(row.map(|(project_id, provider, config_json, updated_at)| ProjectScmConfigRecord {
            project_id,
            provider,
            config_json,
            updated_at,
        }))
    }

    pub fn set_project_scm_config(&self, project_id: &str, provider: &str, config_json: &str) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let now_ms = crate::time::now_ms();
        conn.execute(
            "INSERT INTO project_scm_configs (project_id, provider, config_json, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(project_id, provider) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at",
            params![project_id, provider, config_json, now_ms],
        )
        .context("upsert project_scm_config")?;
        Ok(())
    }

    // --- User SCM Credentials ---

    pub fn get_user_scm_credential(&self, user_id: &str, provider: &str) -> anyhow::Result<Option<UserScmCredentialRecord>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let row: Option<(String, String, String, String, i64)> = conn
            .query_row(
                "SELECT id, user_id, provider, token_json, updated_at
                 FROM user_scm_credentials
                 WHERE user_id = ?1 AND provider = ?2",
                params![user_id, provider],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .optional()
            .context("select user_scm_credential")?;
        Ok(row.map(|(id, user_id, provider, token_json, updated_at)| UserScmCredentialRecord {
            id,
            user_id,
            provider,
            token_json,
            updated_at,
        }))
    }

    pub fn set_user_scm_credential(&self, user_id: &str, provider: &str, token_json: &str) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let now_ms = crate::time::now_ms();
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO user_scm_credentials (id, user_id, provider, token_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(user_id, provider) DO UPDATE SET token_json = excluded.token_json, updated_at = excluded.updated_at",
            params![id, user_id, provider, token_json, now_ms],
        )
        .context("upsert user_scm_credential")?;
        Ok(())
    }

    // --- OAuth States ---

    pub fn create_oauth_state(
        &self,
        user_id: &str,
        provider: &str,
        state: &str,
        code_verifier: &str,
        return_to: &str,
        expires_at: i64,
    ) -> anyhow::Result<String> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO oauth_states (id, user_id, provider, state, code_verifier, return_to, expires_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, user_id, provider, state, code_verifier, return_to, expires_at],
        )
        .context("insert oauth_state")?;
        Ok(id)
    }

    pub fn consume_oauth_state(&self, provider: &str, state: &str, now_ms: i64) -> anyhow::Result<Option<ScmOAuthStateRecord>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let row: Option<(String, String, String, String, String, String, i64)> = conn
            .query_row(
                "SELECT id, user_id, provider, state, code_verifier, return_to, expires_at
                 FROM oauth_states
                 WHERE provider = ?1 AND state = ?2",
                params![provider, state],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)),
            )
            .optional()
            .context("select oauth_state")?;
        let Some((id, user_id, provider, state, code_verifier, return_to, expires_at)) = row else {
            return Ok(None);
        };
        // Always delete after read to prevent replay.
        conn.execute("DELETE FROM oauth_states WHERE id = ?1", params![id])
            .context("delete oauth_state")?;
        if expires_at <= now_ms {
            return Ok(None);
        }
        Ok(Some(ScmOAuthStateRecord {
            id,
            user_id,
            provider,
            state,
            code_verifier,
            return_to,
            expires_at,
        }))
    }
}
