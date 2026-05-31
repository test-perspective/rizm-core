use super::{delete_user, list_audit_logs, AuditLogsQuery};
use crate::admin::system_info::get_system_info;
use crate::app_state::{AppState, AuthConfig, LoginLimiter};
use crate::auth::{AuthedUser, Role};
use crate::db::{Db, DEFAULT_PROJECT_ID};
use serde_json::{json, Map};
use std::io::Write;
use std::sync::Arc;
use tokio::sync::RwLock;

fn tmp_db_path() -> (tempfile::TempDir, String) {
    let dir = tempfile::tempdir().expect("create tempdir");
    let path = dir.path().join("keel_test.sqlite3");
    (dir, path.to_string_lossy().to_string())
}

fn create_test_user(user_id: &str, role: Role) -> AuthedUser {
    AuthedUser {
        user_id: user_id.to_string(),
        email: format!("{}@test.local", user_id),
        role,
        last_login_at: None,
        session_id: "test-session".to_string(),
    }
}

#[tokio::test]
async fn get_system_info_returns_path_and_size() {
    let (dir, db_path) = tmp_db_path();
    // Create a file with known size for deterministic test
    let dummy_path = dir.path().join("dummy_db.sqlite3");
    let content = b"x".repeat(1024); // 1024 bytes
    std::fs::File::create(&dummy_path)
        .unwrap()
        .write_all(&content)
        .unwrap();

    let db = Db::new(&db_path).expect("create db");
    let state = AppState {
        db: Arc::new(RwLock::new(db)),
        db_path: dummy_path.to_string_lossy().to_string(),
        service_gate: Arc::new(tokio::sync::RwLock::new(())),
        auth: AuthConfig::default(),
        login_limiter: Arc::new(LoginLimiter::new()),
        indexer_debounce: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
    };

    let actor = create_test_user("admin1", Role::Admin);

    let result = get_system_info(axum::extract::State(state), axum::Extension(actor))
        .await
        .unwrap();

    assert_eq!(result.0.sqlite_db_path, dummy_path.to_string_lossy());
    assert_eq!(result.0.sqlite_db_file_size_bytes, 1024);
}

#[tokio::test]
async fn get_system_info_includes_attachment_and_fastembed_cache() {
    let (dir, db_path) = tmp_db_path();
    let dummy_path = dir.path().join("dummy_db.sqlite3");
    let content = b"x".repeat(512);
    std::fs::File::create(&dummy_path)
        .unwrap()
        .write_all(&content)
        .unwrap();

    let db = Db::new(&db_path).expect("create db");
    let now = crate::time::now_ms();
    let attachments = serde_json::json!([
        { "id": "att-1", "fileName": "f1.txt", "size": 100, "createdAt": now },
        { "id": "att-2", "fileName": "f2.txt", "size": 250, "createdAt": now }
    ]);
    let mut properties = serde_json::Map::new();
    properties.insert("attachments".to_string(), attachments);
    let _ = db
        .create_entity_for_project(DEFAULT_PROJECT_ID, None, "task", properties)
        .expect("create entity with attachments");

    let state = AppState {
        db: Arc::new(RwLock::new(db)),
        db_path: dummy_path.to_string_lossy().to_string(),
        service_gate: Arc::new(tokio::sync::RwLock::new(())),
        auth: AuthConfig::default(),
        login_limiter: Arc::new(LoginLimiter::new()),
        indexer_debounce: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
    };
    let actor = create_test_user("admin1", Role::Admin);

    let result = get_system_info(axum::extract::State(state), axum::Extension(actor))
        .await
        .unwrap();

    assert_eq!(result.0.attachments.total_size_bytes, 350);
    assert_eq!(result.0.attachments.per_project.len(), 1);
    assert_eq!(
        result.0.attachments.per_project[0].project_id,
        DEFAULT_PROJECT_ID
    );
    assert_eq!(result.0.attachments.per_project[0].project_name, "Default");
    assert_eq!(result.0.attachments.per_project[0].attachment_count, 2);
    assert_eq!(result.0.attachments.per_project[0].total_size_bytes, 350);
    assert_eq!(result.0.fastembed_cache.size_bytes, 0);
}

#[tokio::test]
async fn list_audit_logs_includes_actor_user_email() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    let user = db
        .create_local_user("audit-test@example.local", "editor", "hash")
        .expect("create user");
    let now = crate::time::now_ms();
    db.insert_audit_log(Some(&user.id), "LOGIN_SUCCESS", Some(&user.id), None, now)
        .expect("insert audit log");

    let state = AppState {
        db: Arc::new(RwLock::new(db)),
        db_path: db_path.clone(),
        service_gate: Arc::new(tokio::sync::RwLock::new(())),
        auth: AuthConfig::default(),
        login_limiter: Arc::new(LoginLimiter::new()),
        indexer_debounce: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
    };
    let actor = create_test_user("admin1", Role::Admin);

    let result = list_audit_logs(
        axum::extract::State(state),
        axum::Extension(actor),
        axum::extract::Query(AuditLogsQuery {
            limit: Some(50),
            offset: Some(0),
            since: None,
            until: None,
            is_activity: None,
        }),
    )
    .await
    .unwrap();

    assert!(!result.0.is_empty());
    let row = result.0.first().unwrap();
    assert_eq!(row.actor_user_id.as_deref(), Some(user.id.as_str()));
    assert_eq!(
        row.actor_user_email.as_deref(),
        Some("audit-test@example.local")
    );
}

#[tokio::test]
async fn delete_user_clears_assignee_references() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    let target = db
        .create_local_user("delete-target@example.local", "editor", "hash")
        .expect("create user");

    let mut props = Map::new();
    props.insert("title".to_string(), json!("Task"));
    props.insert("assigneeId".to_string(), json!(target.id.clone()));
    let entity = db
        .create_entity_for_project(DEFAULT_PROJECT_ID, None, "task", props)
        .expect("create entity");

    let state = AppState {
        db: Arc::new(RwLock::new(db.clone())),
        db_path: db_path.clone(),
        service_gate: Arc::new(tokio::sync::RwLock::new(())),
        auth: AuthConfig::default(),
        login_limiter: Arc::new(LoginLimiter::new()),
        indexer_debounce: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
    };
    let actor = create_test_user("admin1", Role::Admin);

    let status = delete_user(
        axum::extract::State(state),
        axum::Extension(actor),
        axum::extract::Path(target.id.clone()),
    )
    .await
    .expect("delete user");
    assert_eq!(status, axum::http::StatusCode::NO_CONTENT);

    let deleted = db.get_user_by_id(&target.id).expect("lookup deleted user");
    assert!(deleted.is_none());

    let reloaded = db
        .get_entity_for_project(DEFAULT_PROJECT_ID, &entity.id)
        .expect("load entity")
        .expect("entity exists");
    assert!(
        reloaded
            .properties
            .get("assigneeId")
            .is_some_and(serde_json::Value::is_null),
        "assigneeId should be null after user deletion"
    );
}

#[tokio::test]
async fn delete_user_rejects_last_enabled_admin() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    let admin = db
        .create_local_user("only-admin@example.local", "admin", "hash")
        .expect("create admin");

    let state = AppState {
        db: Arc::new(RwLock::new(db)),
        db_path: db_path.clone(),
        service_gate: Arc::new(tokio::sync::RwLock::new(())),
        auth: AuthConfig::default(),
        login_limiter: Arc::new(LoginLimiter::new()),
        indexer_debounce: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
    };
    let actor = create_test_user("admin1", Role::Admin);

    let err = delete_user(
        axum::extract::State(state),
        axum::Extension(actor),
        axum::extract::Path(admin.id),
    )
    .await
    .expect_err("should reject deleting last enabled admin");

    assert_eq!(err.status, axum::http::StatusCode::BAD_REQUEST);
}
