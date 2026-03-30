//! DB automatic backup settings (REQ-238), stored in `meta`.

use anyhow::Context;
use rusqlite::{params, OptionalExtension};

use super::Db;

const META_KEY: &str = "db_backup_settings";

impl Db {
    pub fn get_db_backup_settings_json(&self) -> anyhow::Result<Option<String>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        conn.query_row(
            "SELECT value FROM meta WHERE key = ?1",
            params![META_KEY],
            |r| r.get(0),
        )
        .optional()
        .context("select db_backup_settings")
    }

    pub fn set_db_backup_settings_json(&self, json: &str) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        conn.execute(
            "INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![META_KEY, json],
        )
        .context("upsert db_backup_settings")?;
        Ok(())
    }
}
