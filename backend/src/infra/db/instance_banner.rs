use anyhow::Context;
use rusqlite::{params, OptionalExtension};

use super::Db;

const INSTANCE_BANNER_META_KEY: &str = "instance_banner";

impl Db {
    pub fn get_instance_banner_json(&self) -> anyhow::Result<Option<String>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        conn.query_row(
            "SELECT value FROM meta WHERE key = ?1",
            params![INSTANCE_BANNER_META_KEY],
            |r| r.get(0),
        )
        .optional()
        .context("select instance_banner")
    }

    pub fn set_instance_banner_json(&self, json: &str) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        conn.execute(
            "INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![INSTANCE_BANNER_META_KEY, json],
        )
        .context("upsert instance_banner")?;
        Ok(())
    }
}
