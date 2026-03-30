use axum::{
    extract::{Query, State},
    routing::get,
    Extension, Json, Router,
};
use serde::Deserialize;

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::search::{parse_types, run_search, SearchResult};
use crate::ApiError;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchQuery {
    q: String,
    scope: Option<String>,
    project_id: Option<String>,
    types: Option<String>,
    limit: Option<i64>,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/api/search", get(search))
}

async fn search(
    State(state): State<AppState>,
    Extension(user): Extension<AuthedUser>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<Vec<SearchResult>>, ApiError> {
    let q = query.q.trim().to_string();
    if q.is_empty() {
        return Ok(Json(vec![]));
    }
    let scope = query.scope.unwrap_or_else(|| "global".to_string());
    let types_raw = query.types.clone();
    let limit = query.limit.unwrap_or(10).clamp(1, 20) as usize;
    let project_id = query.project_id.clone();

    // `run_search` uses `tokio::sync::RwLock::blocking_read()` on `state.db`.
    // That must not run on an async worker thread (it nests `block_on` and panics).
    let state = state.clone();
    let user = user.clone();
    let blocking_result = tokio::task::spawn_blocking(move || {
        let types = parse_types(types_raw.as_deref());
        run_search(
            &state,
            &user,
            &q,
            &scope,
            project_id.as_deref(),
            &types,
            limit,
        )
    })
    .await
    .map_err(|e| {
        tracing::error!(error = ?e, "search task join failed");
        ApiError::internal()
    })?;

    Ok(Json(blocking_result?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_state::{AuthConfig, LoginLimiter};
    use crate::auth::{AuthedUser, Role};
    use crate::db::Db;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn tmp_db_path() -> (tempfile::TempDir, String) {
        let dir = tempfile::tempdir().expect("create tempdir");
        let path = dir.path().join("keel_search_test.sqlite3");
        (dir, path.to_string_lossy().to_string())
    }

    fn test_state(db: Db, db_path: String) -> AppState {
        AppState {
            db: Arc::new(RwLock::new(db)),
            db_path,
            service_gate: Arc::new(RwLock::new(())),
            auth: AuthConfig::default(),
            login_limiter: Arc::new(LoginLimiter::new()),
            indexer_debounce: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
        }
    }

    fn test_user() -> AuthedUser {
        AuthedUser {
            user_id: "u1".to_string(),
            email: "u1@test.local".to_string(),
            role: Role::Admin,
            last_login_at: None,
            session_id: "s1".to_string(),
        }
    }

    #[tokio::test]
    async fn api_search_non_empty_query_completes_without_panic() {
        let (_dir, db_path) = tmp_db_path();
        let db = Db::new(&db_path).expect("create db");
        let state = test_state(db, db_path);
        let user = test_user();

        let out = search(
            State(state),
            Extension(user),
            Query(SearchQuery {
                q: "hello".to_string(),
                scope: Some("global".to_string()),
                project_id: None,
                types: None,
                limit: Some(5),
            }),
        )
        .await;

        // Must not panic: `run_search` uses `blocking_read` and runs on the blocking pool via `spawn_blocking`.
        let _ = out;
    }
}
