use super::*;
use crate::app_state::{AppState, AuthConfig, LoginLimiter};
use crate::auth::Role;
use crate::db::Db;
use crate::models::{Project, ProjectConfig};
use axum::http::{HeaderMap, HeaderValue};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::RwLock;

fn tmp_db_path() -> (tempfile::TempDir, String) {
    let dir = tempfile::tempdir().expect("create tempdir");
    let path = dir.path().join("keel_test.sqlite3");
    (dir, path.to_string_lossy().to_string())
}

fn create_test_user(user_id: &str) -> AuthedUser {
    AuthedUser {
        user_id: user_id.to_string(),
        email: format!("{}@test.local", user_id),
        role: Role::Editor,
        last_login_at: None,
        session_id: "test-session".to_string(),
    }
}

#[tokio::test]
async fn create_entity_sets_creator_fields_and_ignores_client_tampering() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    let now = 1_i64;
    let p = Project {
        id: "p1".to_string(),
        name: "Project 1".to_string(),
        project_key: Some("P1A".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: now,
        updated_at: now,
        entities: vec![],
        config: ProjectConfig {
            manifest: crate::defaults::default_manifest(),
        },
    };
    db.replace_project_state(p).expect("insert project");

    let user = create_test_user("user1");
    db.create_local_user(&user.email, "editor", "dummy_hash")
        .expect("create user");

    use crate::models::{PolicyDefaults, ProjectPolicy};
    let policy = ProjectPolicy {
        project_defaults: PolicyDefaults {
            users: {
                let mut map = std::collections::HashMap::new();
                map.insert(user.user_id.clone(), crate::models::Permission::Write);
                map
            },
            groups: std::collections::HashMap::new(),
            anonymous: crate::models::Permission::None,
        },
    };
    db.set_project_policy("p1", policy).expect("set project policy");

    let state = AppState {
        db: Arc::new(RwLock::new(db.clone())),
        db_path: db_path.clone(),
        service_gate: Arc::new(tokio::sync::RwLock::new(())),
        auth: AuthConfig::default(),
        login_limiter: Arc::new(LoginLimiter::new()),
        indexer_debounce: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
    };

    let req = CreateEntityRequest {
        id: None,
        entity_id: "task".to_string(),
        properties: json!({
            "title": "Test Task",
            "createdBy": "fake-user-id",
            "updatedBy": "fake-user-id"
        })
        .as_object()
        .unwrap()
        .clone(),
    };

    let result = create_entity(State(state), Path("p1".to_string()), Extension(user), Json(req)).await;

    assert!(result.is_ok(), "create_entity should succeed");
    let (_, _, Json(entity)) = result.unwrap();
    assert_eq!(
        entity.properties.get("createdBy").and_then(|v| v.as_str()),
        Some("user1")
    );
    assert_eq!(
        entity.properties.get("updatedBy").and_then(|v| v.as_str()),
        Some("user1")
    );
    assert_eq!(
        entity.properties.get("title").and_then(|v| v.as_str()),
        Some("Test Task")
    );
}

#[tokio::test]
async fn patch_entity_updates_updated_by_and_preserves_created_by() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    let now = 1_i64;
    let p = Project {
        id: "p1".to_string(),
        name: "Project 1".to_string(),
        project_key: Some("P1A".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: now,
        updated_at: now,
        entities: vec![],
        config: ProjectConfig {
            manifest: crate::defaults::default_manifest(),
        },
    };
    db.replace_project_state(p).expect("insert project");

    let user1 = create_test_user("user1");
    let user2 = create_test_user("user2");
    db.create_local_user(&user1.email, "editor", "dummy_hash")
        .expect("create user1");
    db.create_local_user(&user2.email, "editor", "dummy_hash")
        .expect("create user2");

    use crate::models::{PolicyDefaults, ProjectPolicy};
    let policy = ProjectPolicy {
        project_defaults: PolicyDefaults {
            users: {
                let mut map = std::collections::HashMap::new();
                map.insert(user1.user_id.clone(), crate::models::Permission::Write);
                map.insert(user2.user_id.clone(), crate::models::Permission::Write);
                map
            },
            groups: std::collections::HashMap::new(),
            anonymous: crate::models::Permission::None,
        },
    };
    db.set_project_policy("p1", policy).expect("set project policy");

    let mut props = serde_json::Map::new();
    props.insert("createdBy".to_string(), json!("user1"));
    props.insert("updatedBy".to_string(), json!("user1"));
    props.insert("title".to_string(), json!("Original Title"));
    let entity = db
        .create_entity_for_project("p1", Some("e1"), "task", props)
        .expect("create entity");

    let state = AppState {
        db: Arc::new(RwLock::new(db.clone())),
        db_path: db_path.clone(),
        service_gate: Arc::new(tokio::sync::RwLock::new(())),
        auth: AuthConfig::default(),
        login_limiter: Arc::new(LoginLimiter::new()),
        indexer_debounce: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
    };

    let mut headers = HeaderMap::new();
    headers.insert(
        header::IF_MATCH,
        HeaderValue::from_str(&format!("\"{}\"", entity.updated_at)).unwrap(),
    );

    let req = PatchEntityRequest {
        patch: json!({
            "title": "Updated Title",
            "createdBy": "fake-user-id",
            "updatedBy": "fake-user-id"
        })
        .as_object()
        .unwrap()
        .clone(),
    };

    let result = patch_entity(
        State(state),
        Path(("p1".to_string(), "e1".to_string())),
        headers,
        Extension(user2),
        Json(req),
    )
    .await;

    assert!(result.is_ok(), "patch_entity should succeed");
    let (_, Json(updated_entity)) = result.unwrap();
    assert_eq!(
        updated_entity
            .properties
            .get("createdBy")
            .and_then(|v| v.as_str()),
        Some("user1")
    );
    assert_eq!(
        updated_entity
            .properties
            .get("updatedBy")
            .and_then(|v| v.as_str()),
        Some("user2")
    );
    assert_eq!(
        updated_entity.properties.get("title").and_then(|v| v.as_str()),
        Some("Updated Title")
    );
}
