use axum::{
    extract::{Query, State},
    routing::{get, post},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::ApiError;

/// Minimal user info for assignee selection.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserSummary {
    pub id: String,
    pub email: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchQuery {
    #[serde(default)]
    q: Option<String>,
    #[serde(default)]
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolveRequest {
    ids: Vec<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/users/search", get(search_users))
        .route("/api/users/resolve", post(resolve_users))
}

/// Search users by email (partial match, case-insensitive).
/// Excludes disabled users. Returns up to `limit` results (default 20, max 100).
async fn search_users(
    State(state): State<AppState>,
    Extension(_user): Extension<AuthedUser>,
    Query(params): Query<SearchQuery>,
) -> Result<Json<Vec<UserSummary>>, ApiError> {
    let query = params.q.unwrap_or_default().trim().to_lowercase();
    let limit = params.limit.unwrap_or(20).min(100);

    let all_users = (state.db.read().await)
        .list_users()
        .map_err(|_| ApiError::internal())?;

    let results: Vec<UserSummary> = all_users
        .into_iter()
        .filter(|u| !u.is_disabled)
        .filter(|u| query.is_empty() || u.email.to_lowercase().contains(&query))
        .take(limit)
        .map(|u| UserSummary {
            id: u.id,
            email: u.email,
        })
        .collect();

    Ok(Json(results))
}

/// Resolve specific user IDs to their summary info.
/// Only returns users that exist and are not disabled.
async fn resolve_users(
    State(state): State<AppState>,
    Extension(_user): Extension<AuthedUser>,
    Json(req): Json<ResolveRequest>,
) -> Result<Json<Vec<UserSummary>>, ApiError> {
    if req.ids.is_empty() {
        return Ok(Json(vec![]));
    }

    let all_users = (state.db.read().await)
        .list_users()
        .map_err(|_| ApiError::internal())?;

    let id_set: std::collections::HashSet<&str> = req.ids.iter().map(|s| s.as_str()).collect();

    let results: Vec<UserSummary> = all_users
        .into_iter()
        .filter(|u| !u.is_disabled && id_set.contains(u.id.as_str()))
        .map(|u| UserSummary {
            id: u.id,
            email: u.email,
        })
        .collect();

    Ok(Json(results))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_state::{AppState, AuthConfig, LoginLimiter};
    use crate::auth::{AuthedUser, Role};
    use crate::db::Db;
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
    async fn search_users_as_editor() {
        let (_dir, db_path) = tmp_db_path();
        let db = Db::new(&db_path).expect("create db");

        // Create some users
        db.create_local_user("alice@example.com", "editor", "hash1")
            .unwrap();
        let bob = db
            .create_local_user("bob@example.com", "viewer", "hash2")
            .unwrap();

        // Disable bob
        db.update_user_role_disabled(&bob.id, None, Some(true))
            .unwrap();

        let state = AppState {
            db: Arc::new(RwLock::new(db)),
            db_path: db_path.clone(),
            service_gate: Arc::new(tokio::sync::RwLock::new(())),
            auth: AuthConfig::default(),
            login_limiter: Arc::new(LoginLimiter::new()),
            indexer_debounce: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
        };

        let actor = create_test_user("editor1", Role::Editor);

        // Search without query - should return alice only (bob is disabled)
        let result = search_users(
            axum::extract::State(state.clone()),
            axum::Extension(actor.clone()),
            axum::extract::Query(SearchQuery {
                q: None,
                limit: None,
            }),
        )
        .await
        .unwrap();

        assert_eq!(result.0.len(), 1);
        assert_eq!(result.0[0].email, "alice@example.com");

        // Search with query "alice"
        let result = search_users(
            axum::extract::State(state.clone()),
            axum::Extension(actor.clone()),
            axum::extract::Query(SearchQuery {
                q: Some("alice".to_string()),
                limit: None,
            }),
        )
        .await
        .unwrap();

        assert_eq!(result.0.len(), 1);
        assert_eq!(result.0[0].email, "alice@example.com");

        // Search with query that matches nothing
        let result = search_users(
            axum::extract::State(state),
            axum::Extension(actor),
            axum::extract::Query(SearchQuery {
                q: Some("zzzz".to_string()),
                limit: None,
            }),
        )
        .await
        .unwrap();

        assert!(result.0.is_empty());
    }

    #[tokio::test]
    async fn resolve_users_excludes_disabled() {
        let (_dir, db_path) = tmp_db_path();
        let db = Db::new(&db_path).expect("create db");

        let alice = db
            .create_local_user("alice@example.com", "editor", "hash1")
            .unwrap();
        let bob = db
            .create_local_user("bob@example.com", "viewer", "hash2")
            .unwrap();

        // Disable bob
        db.update_user_role_disabled(&bob.id, None, Some(true))
            .unwrap();

        let state = AppState {
            db: Arc::new(RwLock::new(db)),
            db_path: db_path.clone(),
            service_gate: Arc::new(tokio::sync::RwLock::new(())),
            auth: AuthConfig::default(),
            login_limiter: Arc::new(LoginLimiter::new()),
            indexer_debounce: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
        };

        let actor = create_test_user("viewer1", Role::Viewer);

        // Resolve both alice and bob
        let result = resolve_users(
            axum::extract::State(state),
            axum::Extension(actor),
            axum::extract::Json(ResolveRequest {
                ids: vec![alice.id.clone(), bob.id.clone()],
            }),
        )
        .await
        .unwrap();

        // Only alice should be returned (bob is disabled)
        assert_eq!(result.0.len(), 1);
        assert_eq!(result.0[0].id, alice.id);
        assert_eq!(result.0[0].email, "alice@example.com");
    }
}
