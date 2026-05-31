//! Database core: connection pool, schema migration, seed.

mod conn_helpers;
mod schema;
mod seed;

use std::path::Path;
use std::sync::OnceLock;

use anyhow::Context;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{auto_extension::register_auto_extension, auto_extension::RawAutoExtension};
use sqlite_vec::sqlite3_vec_init;

pub(crate) const DEFAULT_PROJECT_ID: &str = "default";

#[derive(Clone)]
pub struct Db {
    pub(crate) pool: Pool<SqliteConnectionManager>,
}

impl Db {
    pub fn new(db_path: &str) -> anyhow::Result<Self> {
        init_vec_extension().context("init sqlite-vec")?;
        if let Some(parent) = Path::new(db_path).parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)
                    .with_context(|| format!("create db dir: {parent:?}"))?;
            }
        }

        let manager = SqliteConnectionManager::file(db_path)
            .with_init(|conn| conn.execute_batch("PRAGMA busy_timeout = 10000;"));
        let pool = Pool::new(manager).context("create sqlite pool")?;
        let db = Self { pool };

        db.migrate()?;
        db.seed_if_empty()?;

        Ok(db)
    }

    pub(crate) fn migrate(&self) -> anyhow::Result<()> {
        let conn = self.pool.get().context("get sqlite conn")?;
        schema::migrate(&conn)
    }

    pub(crate) fn seed_if_empty(&self) -> anyhow::Result<()> {
        let mut conn = self.pool.get().context("get sqlite conn")?;
        seed::seed_if_empty(&mut conn)
    }
}

static VEC_EXTENSION_INIT: OnceLock<anyhow::Result<()>> = OnceLock::new();

fn init_vec_extension() -> anyhow::Result<()> {
    let res = VEC_EXTENSION_INIT.get_or_init(|| unsafe {
        let init: RawAutoExtension = std::mem::transmute(sqlite3_vec_init as *const ());
        register_auto_extension(init).context("register sqlite-vec auto extension")?;
        Ok(())
    });
    res.as_ref().map_err(|e| anyhow::anyhow!(e.to_string()))?;
    Ok(())
}
