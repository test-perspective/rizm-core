use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::{Mutex, RwLock};

use super::handlers::heartbeat;
use super::types::{AuthedUser, Role};
use crate::app_state::{AppState, AuthConfig, LoginLimiter};
use crate::db::Db;

fn tmp_db_path() -> (tempfile::TempDir, String) {
    let dir = tempfile::tempdir().expect("create tempdir");
    let path = dir.path().join("keel_test.sqlite3");
    (dir, path.to_string_lossy().to_string())
}

fn test_state(db: Db, db_path: &str) -> AppState {
    AppState {
        db: Arc::new(RwLock::new(db)),
        db_path: db_path.to_string(),
        service_gate: Arc::new(RwLock::new(())),
        auth: AuthConfig::default(),
        login_limiter: Arc::new(LoginLimiter::new()),
        indexer_debounce: Arc::new(Mutex::new(HashMap::new())),
    }
}

/// `sessions.user_id` has a FK to `users`, so a session needs a real user.
fn seed_session(db: &Db, session_id: &str, created_at: i64, expires_at: i64) -> String {
    let user = db
        .create_local_user("session-test@test.local", "admin", "x")
        .expect("create user");
    db.create_session(session_id, &user.id, created_at, expires_at, None, None)
        .expect("create session");
    user.id
}

fn authed(session_id: &str, user_id: &str) -> AuthedUser {
    AuthedUser {
        user_id: user_id.to_string(),
        email: "session-test@test.local".to_string(),
        role: Role::Admin,
        last_login_at: None,
        session_id: session_id.to_string(),
    }
}

#[test]
fn renew_session_extends_expiry_and_last_seen() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    seed_session(&db, "s1", 1_000, 1_000 + 86_400_000);

    let now = 5_000;
    let new_expires = now + 86_400_000;
    let updated = db.renew_session("s1", now, new_expires).expect("renew");
    assert_eq!(updated, 1);

    let s = db.get_session("s1").expect("get").expect("exists");
    assert_eq!(s.expires_at, new_expires);
    assert_eq!(s.last_seen_at, now);
    assert_eq!(s.created_at, 1_000, "created_at must not move");
}

#[test]
fn renew_session_never_shortens_expiry() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    let original_expires = 1_000 + 86_400_000;
    seed_session(&db, "s1", 1_000, original_expires);

    // An out-of-order / delayed heartbeat must not claw the expiry back.
    let updated = db
        .renew_session("s1", 5_000, original_expires - 60_000)
        .expect("renew");
    assert_eq!(updated, 0);

    let s = db.get_session("s1").expect("get").expect("exists");
    assert_eq!(s.expires_at, original_expires);
    assert_eq!(s.last_seen_at, 1_000, "no row touched");
}

#[test]
fn renew_session_reports_zero_for_unknown_session() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    let updated = db.renew_session("missing", 5_000, 999_999_999).expect("renew");
    assert_eq!(updated, 0);
}

#[tokio::test]
async fn heartbeat_extends_the_idle_window() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    let created_at = crate::time::now_ms() - 12 * 60 * 60 * 1000;
    let user_id = seed_session(&db, "s1", created_at, created_at + 86_400_000);
    let state = test_state(db, &db_path);

    let res = heartbeat(
        axum::extract::State(state.clone()),
        axum::Extension(authed("s1", &user_id)),
    )
    .await
    .expect("heartbeat ok");

    let db = state.db.read().await;
    let s = db.get_session("s1").expect("get").expect("exists");
    assert_eq!(s.expires_at, res.0.expires_at);
    assert!(
        s.expires_at > created_at + 86_400_000,
        "expiry should move forward from the login-based one"
    );
}

#[tokio::test]
async fn heartbeat_is_unauthorized_when_the_session_is_gone() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    let state = test_state(db, &db_path);

    let err = heartbeat(
        axum::extract::State(state),
        axum::Extension(authed("s1", "no-such-user")),
    )
    .await
    .expect_err("should reject");

    let res = axum::response::IntoResponse::into_response(err);
    assert_eq!(res.status(), axum::http::StatusCode::UNAUTHORIZED);
}
