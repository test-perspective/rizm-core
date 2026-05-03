//! `ai_tools` unit tests. Split by topic to keep individual files small.

use std::sync::Arc;
use tokio::sync::RwLock;

use crate::app_state::{AppState, AuthConfig, LoginLimiter};
use crate::auth::{AuthedUser, Role};
use crate::db::Db;

pub(super) fn tmp_db() -> (tempfile::TempDir, Db) {
    let dir = tempfile::tempdir().expect("create tempdir");
    let path = dir.path().join("ai_tools_test.sqlite3");
    let db = Db::new(path.to_string_lossy().as_ref()).expect("create db");
    (dir, db)
}

pub(super) fn admin_user() -> AuthedUser {
    AuthedUser {
        user_id: "admin-1".to_string(),
        email: "admin@example.local".to_string(),
        role: Role::Admin,
        last_login_at: None,
        session_id: "session-1".to_string(),
    }
}

pub(super) fn editor_user() -> AuthedUser {
    AuthedUser {
        user_id: "editor-1".to_string(),
        email: "editor@example.local".to_string(),
        role: Role::Editor,
        last_login_at: None,
        session_id: "session-2".to_string(),
    }
}

pub(super) fn app_state(db: Db) -> AppState {
    AppState {
        db: Arc::new(RwLock::new(db)),
        db_path: "test.sqlite3".to_string(),
        service_gate: Arc::new(tokio::sync::RwLock::new(())),
        auth: AuthConfig::default(),
        login_limiter: Arc::new(LoginLimiter::new()),
        indexer_debounce: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
    }
}

mod build_tool_definitions;
mod llm_error_messages;
mod project_tools;
mod tool_exec_admin_groups;
mod tool_exec_admin_policy;
mod tool_exec_admin_users;
mod tool_exec_tasks;
