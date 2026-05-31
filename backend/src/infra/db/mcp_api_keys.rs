use anyhow::Context;
use rusqlite::{params, OptionalExtension};

use super::{Db, UserMcpApiKeyRecord, UserRecord};

impl Db {
    pub fn get_user_mcp_api_key(
        &self,
        user_id: &str,
    ) -> anyhow::Result<Option<UserMcpApiKeyRecord>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        conn.query_row(
            "SELECT user_id, token_hash, created_at, updated_at, last_used_at, revoked_at
             FROM user_mcp_api_keys
             WHERE user_id = ?1",
            params![user_id],
            |row| {
                Ok(UserMcpApiKeyRecord {
                    user_id: row.get(0)?,
                    token_hash: row.get(1)?,
                    created_at: row.get(2)?,
                    updated_at: row.get(3)?,
                    last_used_at: row.get(4)?,
                    revoked_at: row.get(5)?,
                })
            },
        )
        .optional()
        .context("select user mcp api key")
    }

    pub fn upsert_user_mcp_api_key_hash(
        &self,
        user_id: &str,
        token_hash: &str,
    ) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let now_ms = crate::time::now_ms();
        conn.execute(
            "INSERT INTO user_mcp_api_keys (user_id, token_hash, created_at, updated_at, last_used_at, revoked_at)
             VALUES (?1, ?2, ?3, ?3, NULL, NULL)
             ON CONFLICT(user_id) DO UPDATE SET
               token_hash = excluded.token_hash,
               updated_at = excluded.updated_at,
               revoked_at = NULL",
            params![user_id, token_hash, now_ms],
        )
        .context("upsert user mcp api key")?;
        Ok(())
    }

    pub fn revoke_user_mcp_api_key(&self, user_id: &str) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let now_ms = crate::time::now_ms();
        conn.execute(
            "UPDATE user_mcp_api_keys
             SET revoked_at = ?2, updated_at = ?2
             WHERE user_id = ?1",
            params![user_id, now_ms],
        )
        .context("revoke user mcp api key")?;
        Ok(())
    }

    pub fn touch_user_mcp_api_key_last_used(
        &self,
        user_id: &str,
        now_ms: i64,
    ) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        conn.execute(
            "UPDATE user_mcp_api_keys
             SET last_used_at = ?2, updated_at = ?2
             WHERE user_id = ?1",
            params![user_id, now_ms],
        )
        .context("touch user mcp api key last used")?;
        Ok(())
    }

    pub fn get_user_by_mcp_api_key_hash(
        &self,
        token_hash: &str,
    ) -> anyhow::Result<Option<UserRecord>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        conn.query_row(
            "SELECT u.id, u.email, u.password_hash, u.role, u.is_disabled, u.created_at, u.updated_at, u.last_login_at
             FROM user_mcp_api_keys k
             JOIN users u ON u.id = k.user_id
             WHERE k.token_hash = ?1
               AND k.revoked_at IS NULL",
            params![token_hash],
            |row| {
                Ok(UserRecord {
                    id: row.get(0)?,
                    email: row.get(1)?,
                    password_hash: row.get(2)?,
                    role: row.get(3)?,
                    is_disabled: row.get::<_, i64>(4)? != 0,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                    last_login_at: row.get(7)?,
                })
            },
        )
        .optional()
        .context("select user by mcp api key hash")
    }
}
