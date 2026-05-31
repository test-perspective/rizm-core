use anyhow::Context;
use rusqlite::params;
use uuid::Uuid;

use super::{AuditLogRecord, Db};

impl Db {
    // --- Audit ---

    pub fn insert_audit_log(
        &self,
        actor_user_id: Option<&str>,
        action: &str,
        target_user_id: Option<&str>,
        meta_json: Option<&str>,
        created_at: i64,
    ) -> anyhow::Result<()> {
        self.insert_audit_log_with_activity(
            actor_user_id,
            action,
            target_user_id,
            meta_json,
            created_at,
            false,
        )
    }

    pub fn insert_audit_log_with_activity(
        &self,
        actor_user_id: Option<&str>,
        action: &str,
        target_user_id: Option<&str>,
        meta_json: Option<&str>,
        created_at: i64,
        is_activity: bool,
    ) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO audit_logs (id, actor_user_id, action, target_user_id, meta_json, created_at, is_activity)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, actor_user_id, action, target_user_id, meta_json, created_at, if is_activity { 1 } else { 0 }],
        )
        .context("insert audit log")?;
        Ok(())
    }

    pub fn list_audit_logs(
        &self,
        limit: i64,
        offset: i64,
        since: Option<i64>,
        until: Option<i64>,
        is_activity: Option<bool>,
    ) -> anyhow::Result<Vec<AuditLogRecord>> {
        let conn = self.pool.get().context("get sqlite conn")?;

        let mut out = Vec::new();

        let activity_filter = if let Some(activity) = is_activity {
            format!(" AND is_activity = {}", if activity { 1 } else { 0 })
        } else {
            String::new()
        };

        match (since, until) {
            (Some(s), Some(u)) => {
                let s_val = s;
                let u_val = u;
                let query = format!(
                    "SELECT id, actor_user_id, action, target_user_id, meta_json, created_at, is_activity
                     FROM audit_logs
                     WHERE created_at >= ?1 AND created_at <= ?2{}
                     ORDER BY created_at DESC
                     LIMIT ?3 OFFSET ?4",
                    activity_filter
                );
                let mut stmt = conn.prepare(&query).context("prepare list audit logs")?;
                let rows = stmt
                    .query_map(params![s_val, u_val, limit, offset], |row| {
                        Ok(AuditLogRecord {
                            id: row.get(0)?,
                            actor_user_id: row.get(1)?,
                            action: row.get(2)?,
                            target_user_id: row.get(3)?,
                            meta_json: row.get(4)?,
                            created_at: row.get(5)?,
                            is_activity: row.get::<_, i64>(6)? != 0,
                        })
                    })
                    .context("query list audit logs")?;
                for r in rows {
                    out.push(r?);
                }
            }
            (Some(s), None) => {
                let s_val = s;
                let query = format!(
                    "SELECT id, actor_user_id, action, target_user_id, meta_json, created_at, is_activity
                     FROM audit_logs
                     WHERE created_at >= ?1{}
                     ORDER BY created_at DESC
                     LIMIT ?2 OFFSET ?3",
                    activity_filter
                );
                let mut stmt = conn.prepare(&query).context("prepare list audit logs")?;
                let rows = stmt
                    .query_map(params![s_val, limit, offset], |row| {
                        Ok(AuditLogRecord {
                            id: row.get(0)?,
                            actor_user_id: row.get(1)?,
                            action: row.get(2)?,
                            target_user_id: row.get(3)?,
                            meta_json: row.get(4)?,
                            created_at: row.get(5)?,
                            is_activity: row.get::<_, i64>(6)? != 0,
                        })
                    })
                    .context("query list audit logs")?;
                for r in rows {
                    out.push(r?);
                }
            }
            (None, Some(u)) => {
                let u_val = u;
                let query = format!(
                    "SELECT id, actor_user_id, action, target_user_id, meta_json, created_at, is_activity
                     FROM audit_logs
                     WHERE created_at <= ?1{}
                     ORDER BY created_at DESC
                     LIMIT ?2 OFFSET ?3",
                    activity_filter
                );
                let mut stmt = conn.prepare(&query).context("prepare list audit logs")?;
                let rows = stmt
                    .query_map(params![u_val, limit, offset], |row| {
                        Ok(AuditLogRecord {
                            id: row.get(0)?,
                            actor_user_id: row.get(1)?,
                            action: row.get(2)?,
                            target_user_id: row.get(3)?,
                            meta_json: row.get(4)?,
                            created_at: row.get(5)?,
                            is_activity: row.get::<_, i64>(6)? != 0,
                        })
                    })
                    .context("query list audit logs")?;
                for r in rows {
                    out.push(r?);
                }
            }
            (None, None) => {
                let query = if activity_filter.is_empty() {
                    "SELECT id, actor_user_id, action, target_user_id, meta_json, created_at, is_activity
                     FROM audit_logs
                     ORDER BY created_at DESC
                     LIMIT ?1 OFFSET ?2".to_string()
                } else {
                    format!(
                        "SELECT id, actor_user_id, action, target_user_id, meta_json, created_at, is_activity
                         FROM audit_logs
                         WHERE {}
                         ORDER BY created_at DESC
                         LIMIT ?1 OFFSET ?2",
                        activity_filter.trim_start_matches(" AND ")
                    )
                };
                let mut stmt = conn.prepare(&query).context("prepare list audit logs")?;
                let rows = stmt
                    .query_map(params![limit, offset], |row| {
                        Ok(AuditLogRecord {
                            id: row.get(0)?,
                            actor_user_id: row.get(1)?,
                            action: row.get(2)?,
                            target_user_id: row.get(3)?,
                            meta_json: row.get(4)?,
                            created_at: row.get(5)?,
                            is_activity: row.get::<_, i64>(6)? != 0,
                        })
                    })
                    .context("query list audit logs")?;
                for r in rows {
                    out.push(r?);
                }
            }
        }

        Ok(out)
    }

    pub fn delete_old_activity_logs(&self) -> anyhow::Result<usize> {
        let conn = self.pool.get().context("get sqlite conn")?;
        // 2 weeks = 14 days = 1,209,600,000 milliseconds
        let two_weeks_ago = crate::time::now_ms() - 1_209_600_000;
        let deleted = conn
            .execute(
                "DELETE FROM audit_logs WHERE is_activity = 1 AND created_at < ?1",
                params![two_weeks_ago],
            )
            .context("delete old activity logs")?;
        Ok(deleted)
    }
}
