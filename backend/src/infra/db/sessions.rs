use anyhow::Context;
use rusqlite::{params, OptionalExtension};

use super::{Db, SessionRecord};

impl Db {
    // --- Sessions ---

    pub fn create_session(
        &self,
        session_id: &str,
        user_id: &str,
        created_at: i64,
        expires_at: i64,
        user_agent: Option<&str>,
        ip: Option<&str>,
    ) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        conn.execute(
            "INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent, ip)
             VALUES (?1, ?2, ?3, ?4, ?3, ?5, ?6)",
            params![session_id, user_id, created_at, expires_at, user_agent, ip],
        )
        .context("insert session")?;
        Ok(())
    }

    pub fn get_session(&self, session_id: &str) -> anyhow::Result<Option<SessionRecord>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        conn.query_row(
            "SELECT id, user_id, created_at, expires_at, last_seen_at, user_agent, ip
             FROM sessions WHERE id = ?1",
            params![session_id],
            |row| {
                Ok(SessionRecord {
                    id: row.get(0)?,
                    user_id: row.get(1)?,
                    created_at: row.get(2)?,
                    expires_at: row.get(3)?,
                    last_seen_at: row.get(4)?,
                    user_agent: row.get(5)?,
                    ip: row.get(6)?,
                })
            },
        )
        .optional()
        .context("select session")
    }

    pub fn touch_session(&self, session_id: &str, now_ms: i64) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        conn.execute(
            "UPDATE sessions SET last_seen_at = ?2 WHERE id = ?1",
            params![session_id, now_ms],
        )
        .context("touch session")?;
        Ok(())
    }

    /// Extend the idle window of a session. Returns the number of rows updated
    /// (0 means the session is already gone).
    ///
    /// The `expires_at < ?3` guard keeps renewal monotonic: concurrent tabs or a
    /// delayed request can never pull an expiry back. It does not by itself stop
    /// an already-expired session from being revived -- `session_middleware`
    /// rejects those before any handler runs.
    pub fn renew_session(
        &self,
        session_id: &str,
        now_ms: i64,
        expires_at: i64,
    ) -> anyhow::Result<usize> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let n = conn
            .execute(
                "UPDATE sessions SET last_seen_at = ?2, expires_at = ?3
                 WHERE id = ?1 AND expires_at < ?3",
                params![session_id, now_ms, expires_at],
            )
            .context("renew session")?;
        Ok(n)
    }

    pub fn delete_session(&self, session_id: &str) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        conn.execute("DELETE FROM sessions WHERE id = ?1", params![session_id])
            .context("delete session")?;
        Ok(())
    }

    pub fn delete_expired_sessions(&self, now_ms: i64) -> anyhow::Result<i64> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let n = conn
            .execute(
                "DELETE FROM sessions WHERE expires_at <= ?1",
                params![now_ms],
            )
            .context("delete expired sessions")?;
        Ok(n as i64)
    }
}
