use anyhow::Context;
use rusqlite::{params, OptionalExtension};
use std::collections::HashMap;
use uuid::Uuid;

use super::{Db, UserRecord};

impl Db {
    // --- Auth / Users ---

    pub fn count_admin_users(&self) -> anyhow::Result<i64> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_disabled = 0", [], |row| row.get(0))
            .context("count admin users")?;
        Ok(n)
    }

    /// Look up user by email (case-insensitive). Use for import matching (Jira assignee/author).
    pub fn get_user_by_email_case_insensitive(&self, email: &str) -> anyhow::Result<Option<UserRecord>> {
        let email = email.trim();
        if email.is_empty() {
            return Ok(None);
        }
        let conn = self.pool.get().context("get sqlite conn")?;
        let email_lower = email.to_lowercase();
        conn.query_row(
            "SELECT id, email, password_hash, role, is_disabled, created_at, updated_at, last_login_at
             FROM users WHERE LOWER(email) = ?1",
            params![email_lower],
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
        .context("select user by email (case-insensitive)")
    }

    pub fn get_user_by_email(&self, email: &str) -> anyhow::Result<Option<UserRecord>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        conn.query_row(
            "SELECT id, email, password_hash, role, is_disabled, created_at, updated_at, last_login_at
             FROM users WHERE email = ?1",
            params![email],
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
        .context("select user by email")
    }

    pub fn get_user_by_id(&self, user_id: &str) -> anyhow::Result<Option<UserRecord>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        conn.query_row(
            "SELECT id, email, password_hash, role, is_disabled, created_at, updated_at, last_login_at
             FROM users WHERE id = ?1",
            params![user_id],
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
        .context("select user by id")
    }

    /// Returns id -> email for the given user IDs. IDs not found are omitted.
    pub fn get_emails_by_user_ids(&self, ids: &[String]) -> anyhow::Result<HashMap<String, String>> {
        if ids.is_empty() {
            return Ok(HashMap::new());
        }
        let conn = self.pool.get().context("get sqlite conn")?;
        let placeholders: Vec<String> = ids.iter().map(|_| "?".to_string()).collect();
        let sql = format!(
            "SELECT id, email FROM users WHERE id IN ({})",
            placeholders.join(", ")
        );
        let mut stmt = conn.prepare(&sql).context("prepare get emails by ids")?;
        let ids_refs: Vec<&str> = ids.iter().map(|s| s.as_str()).collect();
        let rows = stmt
            .query_map(rusqlite::params_from_iter(ids_refs), |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .context("query get emails by ids")?;
        let mut out = HashMap::new();
        for r in rows {
            let (id, email) = r?;
            out.insert(id, email);
        }
        Ok(out)
    }

    pub fn list_users(&self) -> anyhow::Result<Vec<UserRecord>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let mut stmt = conn
            .prepare(
                "SELECT id, email, password_hash, role, is_disabled, created_at, updated_at, last_login_at
                 FROM users ORDER BY created_at DESC",
            )
            .context("prepare list users")?;

        let rows = stmt
            .query_map([], |row| {
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
            })
            .context("query list users")?;

        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    pub fn create_local_user(&self, email: &str, role: &str, password_hash: &str) -> anyhow::Result<UserRecord> {
        let mut conn = self.pool.get().context("get sqlite conn")?;
        let tx = conn.transaction().context("begin tx")?;

        let now = crate::time::now_ms();
        let user_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO users (id, email, password_hash, role, is_disabled, created_at, updated_at, last_login_at)
             VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, NULL)",
            params![user_id, email, password_hash, role, now, now],
        )
        .context("insert user")?;

        let identity_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO auth_identities (id, user_id, provider, provider_user_key, created_at)
             VALUES (?1, ?2, 'local', ?3, ?4)",
            params![identity_id, user_id, email, now],
        )
        .context("insert auth_identity")?;

        tx.commit().context("commit tx")?;

        Ok(UserRecord {
            id: user_id,
            email: email.to_string(),
            password_hash: Some(password_hash.to_string()),
            role: role.to_string(),
            is_disabled: false,
            created_at: now,
            updated_at: now,
            last_login_at: None,
        })
    }

    pub fn update_user_role_disabled(&self, user_id: &str, role: Option<&str>, is_disabled: Option<bool>) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let now = crate::time::now_ms();
        if role.is_none() && is_disabled.is_none() {
            return Ok(());
        }

        // Small dynamic update without bringing a query builder.
        match (role, is_disabled) {
            (Some(r), Some(d)) => {
                conn.execute(
                    "UPDATE users SET role = ?2, is_disabled = ?3, updated_at = ?4 WHERE id = ?1",
                    params![user_id, r, if d { 1 } else { 0 }, now],
                )
                .context("update user role+disabled")?;
            }
            (Some(r), None) => {
                conn.execute(
                    "UPDATE users SET role = ?2, updated_at = ?3 WHERE id = ?1",
                    params![user_id, r, now],
                )
                .context("update user role")?;
            }
            (None, Some(d)) => {
                conn.execute(
                    "UPDATE users SET is_disabled = ?2, updated_at = ?3 WHERE id = ?1",
                    params![user_id, if d { 1 } else { 0 }, now],
                )
                .context("update user disabled")?;
            }
            (None, None) => {}
        }
        Ok(())
    }

    pub fn set_user_password_hash(&self, user_id: &str, password_hash: &str) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let now = crate::time::now_ms();
        conn.execute(
            "UPDATE users SET password_hash = ?2, updated_at = ?3 WHERE id = ?1",
            params![user_id, password_hash, now],
        )
        .context("update user password_hash")?;
        Ok(())
    }

    pub fn set_user_last_login(&self, user_id: &str, now_ms: i64) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        conn.execute(
            "UPDATE users SET last_login_at = ?2, updated_at = ?2 WHERE id = ?1",
            params![user_id, now_ms],
        )
        .context("update user last_login")?;
        Ok(())
    }

    pub fn delete_user_and_clear_assignee_references(&self, user_id: &str) -> anyhow::Result<()> {
        let mut conn = self.pool.get().context("get sqlite conn")?;
        let tx = conn.transaction().context("begin tx")?;
        let now = crate::time::now_ms();

        tx.execute(
            "UPDATE entities
             SET
               updated_at = ?1,
               properties_json = json_set(properties_json, '$.assigneeId', NULL)
             WHERE
               json_valid(properties_json) = 1
               AND json_type(properties_json, '$.assigneeId') = 'text'
               AND json_extract(properties_json, '$.assigneeId') = ?2",
            params![now, user_id],
        )
        .context("clear assignee references for deleted user")?;

        let deleted = tx
            .execute("DELETE FROM users WHERE id = ?1", params![user_id])
            .context("delete user")?;
        if deleted == 0 {
            return Err(anyhow::anyhow!("user not found"));
        }

        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('version', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![now.to_string()],
        )
        .context("update version after user delete")?;

        tx.commit().context("commit tx")?;
        Ok(())
    }
}

