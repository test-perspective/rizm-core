//! Database schema: CREATE TABLE and migration logic.

use anyhow::Context;
use rusqlite::{params, OptionalExtension};

pub(crate) const SCHEMA_SQL: &str = r#"
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS projects (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              project_key TEXT NULL,
              lifecycle_status TEXT NOT NULL DEFAULT 'ready',
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS manifests (
              project_id TEXT PRIMARY KEY,
              json TEXT NOT NULL
            );

            -- Per-project counters (e.g. for taskKey sequence)
            CREATE TABLE IF NOT EXISTS project_counters (
              project_id TEXT PRIMARY KEY,
              next_task_seq INTEGER NOT NULL
            );

            -- Manifest version history (append-only snapshots)
            CREATE TABLE IF NOT EXISTS manifest_versions (
              id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              actor_user_id TEXT NULL,
              source TEXT NOT NULL,
              message TEXT NULL,
              parent_id TEXT NULL,
              json TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_manifest_versions_project_created_at
              ON manifest_versions(project_id, created_at DESC);

            -- Entities now include project_id (CREATE won't alter existing old table)
            CREATE TABLE IF NOT EXISTS entities (
              id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL DEFAULT 'default',
              entity_id TEXT NOT NULL DEFAULT 'default',
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              properties_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS wiki_collab_states (
              project_id TEXT NOT NULL,
              page_id TEXT NOT NULL,
              updated_at INTEGER NOT NULL,
              doc_json TEXT NOT NULL,
              crdt_blob BLOB NOT NULL,
              PRIMARY KEY(project_id, page_id),
              FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
              FOREIGN KEY(page_id) REFERENCES entities(id) ON DELETE CASCADE
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS vec_entities USING vec0(
              project_id TEXT PARTITION KEY,
              entity_kind TEXT,
              entity_pk TEXT,
              updated_at INTEGER,
              chunk_index INTEGER,
              embedding FLOAT[384],
              +title TEXT,
              +content TEXT
            );

            CREATE TABLE IF NOT EXISTS meta (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );

            -- Auth / Users
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              email TEXT UNIQUE NOT NULL,
              password_hash TEXT NULL,
              role TEXT NOT NULL CHECK (role IN ('admin','editor','viewer')),
              is_disabled INTEGER NOT NULL DEFAULT 0,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              last_login_at INTEGER NULL
            );

            -- Future-proof identity linkage (local/ldap/etc)
            CREATE TABLE IF NOT EXISTS auth_identities (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              provider TEXT NOT NULL,
              provider_user_key TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              UNIQUE(provider, provider_user_key),
              FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS sessions (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              expires_at INTEGER NOT NULL,
              last_seen_at INTEGER NOT NULL,
              user_agent TEXT NULL,
              ip TEXT NULL,
              FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

            CREATE TABLE IF NOT EXISTS audit_logs (
              id TEXT PRIMARY KEY,
              actor_user_id TEXT NULL,
              action TEXT NOT NULL,
              target_user_id TEXT NULL,
              meta_json TEXT NULL,
              created_at INTEGER NOT NULL,
              is_activity INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

            -- User Groups
            CREATE TABLE IF NOT EXISTS user_groups (
              id TEXT PRIMARY KEY,
              name TEXT UNIQUE NOT NULL,
              description TEXT NULL,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            );

            -- User Group Memberships
            CREATE TABLE IF NOT EXISTS user_group_memberships (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              group_id TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              UNIQUE(user_id, group_id),
              FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
              FOREIGN KEY(group_id) REFERENCES user_groups(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_user_group_memberships_user_id ON user_group_memberships(user_id);
            CREATE INDEX IF NOT EXISTS idx_user_group_memberships_group_id ON user_group_memberships(group_id);

            -- Project Policies
            CREATE TABLE IF NOT EXISTS project_policies (
              project_id TEXT PRIMARY KEY,
              policy_json TEXT NOT NULL,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            -- SCM Integration
            CREATE TABLE IF NOT EXISTS project_scm_configs (
              project_id TEXT NOT NULL,
              provider TEXT NOT NULL,
              config_json TEXT NOT NULL,
              updated_at INTEGER NOT NULL,
              PRIMARY KEY(project_id, provider),
              FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS user_scm_credentials (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              provider TEXT NOT NULL,
              token_json TEXT NOT NULL,
              updated_at INTEGER NOT NULL,
              UNIQUE(user_id, provider),
              FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS oauth_states (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              provider TEXT NOT NULL,
              state TEXT NOT NULL,
              code_verifier TEXT NOT NULL,
              return_to TEXT NOT NULL,
              expires_at INTEGER NOT NULL,
              FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            -- User Dashboard Policies (per-user, global across projects)
            CREATE TABLE IF NOT EXISTS user_dashboard_policies (
              user_id TEXT PRIMARY KEY,
              policy_json TEXT NOT NULL,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS user_mcp_api_keys (
              user_id TEXT PRIMARY KEY,
              token_hash TEXT UNIQUE NOT NULL,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              last_used_at INTEGER NULL,
              revoked_at INTEGER NULL,
              FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_user_mcp_api_keys_token_hash
              ON user_mcp_api_keys(token_hash);

            -- Import (Adaptive Task Import)
            CREATE TABLE IF NOT EXISTS import_sessions (
              id TEXT PRIMARY KEY,
              provider TEXT NOT NULL,
              project_id TEXT NULL,
              created_by_user_id TEXT NOT NULL,
              connection_config_json TEXT NOT NULL,
              metadata_json TEXT NULL,
              mapping_config_json TEXT NULL,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS idx_import_sessions_project_id ON import_sessions(project_id);

            CREATE TABLE IF NOT EXISTS import_jobs (
              id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              project_id TEXT NOT NULL,
              status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed')),
              progress_percent INTEGER NOT NULL DEFAULT 0,
              error_message TEXT NULL,
              started_at INTEGER NULL,
              completed_at INTEGER NULL,
              created_at INTEGER NOT NULL,
              FOREIGN KEY(session_id) REFERENCES import_sessions(id) ON DELETE CASCADE,
              FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_import_jobs_project_id ON import_jobs(project_id);

            CREATE TABLE IF NOT EXISTS entity_external_ids (
              project_id TEXT NOT NULL,
              entity_id TEXT NOT NULL,
              provider TEXT NOT NULL,
              external_id TEXT NOT NULL,
              external_key TEXT NULL,
              created_at INTEGER NOT NULL,
              PRIMARY KEY(project_id, entity_id, provider),
              UNIQUE(project_id, provider, external_id),
              FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
              FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_entity_external_ids_project_provider
              ON entity_external_ids(project_id, provider);
            "#;

/// Run schema creation and migrations.
pub(crate) fn migrate(conn: &rusqlite::Connection) -> anyhow::Result<()> {
    conn.execute_batch(SCHEMA_SQL).context("migrate")?;

    let has_col: Option<String> = conn
        .query_row(
            "SELECT name FROM pragma_table_info('projects') WHERE name = 'lifecycle_status'",
            [],
            |r| r.get(0),
        )
        .optional()
        .context("check projects lifecycle_status")?;
    if has_col.is_none() {
        conn.execute(
            "ALTER TABLE projects ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'ready'",
            [],
        )
        .context("add lifecycle_status to projects")?;
    }

    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_project_key ON projects(project_key) WHERE project_key IS NOT NULL",
        [],
    )
    .context("create unique index idx_projects_project_key")?;

    for (col, default) in [("processed_count", "DEFAULT 0"), ("total_count", "NULL")] {
        let has_col: Option<String> = conn
            .query_row(
                "SELECT name FROM pragma_table_info('import_jobs') WHERE name = ?1",
                params![col],
                |r| r.get(0),
            )
            .optional()
            .context("check import_jobs column")?;
        if has_col.is_none() {
            let sql = if default == "NULL" {
                format!("ALTER TABLE import_jobs ADD COLUMN {} INTEGER", col)
            } else {
                format!("ALTER TABLE import_jobs ADD COLUMN {} INTEGER {}", col, default)
            };
            conn.execute(&sql, []).context(format!("add import_jobs.{}", col))?;
        }
    }

    Ok(())
}
