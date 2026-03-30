use anyhow::Context;
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

use super::{Db, GroupRecord};

impl Db {
    // --- User Groups ---

    pub fn list_user_groups(&self) -> anyhow::Result<Vec<GroupRecord>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let mut stmt = conn
            .prepare("SELECT id, name, description, created_at, updated_at FROM user_groups ORDER BY name")
            .context("prepare select user groups")?;

        let groups = stmt
            .query_map([], |row| {
                Ok(GroupRecord {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })
            .context("query user groups")?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(groups)
    }

    pub fn get_user_group(&self, group_id: &str) -> anyhow::Result<Option<GroupRecord>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let group: Option<GroupRecord> = conn
            .query_row(
                "SELECT id, name, description, created_at, updated_at FROM user_groups WHERE id = ?1",
                params![group_id],
                |row| {
                    Ok(GroupRecord {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        description: row.get(2)?,
                        created_at: row.get(3)?,
                        updated_at: row.get(4)?,
                    })
                },
            )
            .optional()
            .context("select user group")?;

        Ok(group)
    }

    pub fn create_user_group(&self, name: &str, description: Option<&str>) -> anyhow::Result<String> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let id = Uuid::new_v4().to_string();
        let now_ms = crate::time::now_ms();

        conn.execute(
            "INSERT INTO user_groups (id, name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, name, description, now_ms, now_ms],
        )
        .context("insert user group")?;

        Ok(id)
    }

    pub fn update_user_group(&self, group_id: &str, name: &str, description: Option<&str>) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let now_ms = crate::time::now_ms();

        conn.execute(
            "UPDATE user_groups SET name = ?1, description = ?2, updated_at = ?3 WHERE id = ?4",
            params![name, description, now_ms, group_id],
        )
        .context("update user group")?;

        Ok(())
    }

    pub fn delete_user_group(&self, group_id: &str) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        conn.execute("DELETE FROM user_groups WHERE id = ?1", params![group_id])
            .context("delete user group")?;
        Ok(())
    }

    // --- User Group Memberships ---

    pub fn get_user_groups(&self, user_id: &str) -> anyhow::Result<Vec<String>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let mut stmt = conn
            .prepare("SELECT group_id FROM user_group_memberships WHERE user_id = ?1")
            .context("prepare select user groups")?;

        let group_ids = stmt
            .query_map(params![user_id], |row| row.get::<_, String>(0))
            .context("query user groups")?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(group_ids)
    }

    pub fn add_user_to_group(&self, user_id: &str, group_id: &str) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let id = Uuid::new_v4().to_string();
        let now_ms = crate::time::now_ms();

        conn.execute(
            "INSERT INTO user_group_memberships (id, user_id, group_id, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, user_id, group_id, now_ms],
        )
        .context("insert user group membership")?;

        Ok(())
    }

    pub fn remove_user_from_group(&self, user_id: &str, group_id: &str) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        conn.execute(
            "DELETE FROM user_group_memberships WHERE user_id = ?1 AND group_id = ?2",
            params![user_id, group_id],
        )
        .context("delete user group membership")?;
        Ok(())
    }

    pub fn get_group_members(&self, group_id: &str) -> anyhow::Result<Vec<String>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let mut stmt = conn
            .prepare("SELECT user_id FROM user_group_memberships WHERE group_id = ?1")
            .context("prepare select group members")?;

        let user_ids = stmt
            .query_map(params![group_id], |row| row.get::<_, String>(0))
            .context("query group members")?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(user_ids)
    }
}

