//! Global gate: readers for normal DB work; exclusive writer during SQLite restore.
//! Restore must not go through the read middleware (would deadlock on `write()`).

use axum::{
    extract::{Request, State},
    http::Method,
    middleware::Next,
    response::Response,
};

use crate::app_state::AppState;

pub async fn middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path();
    if path == "/health" || path == "/status" {
        return next.run(request).await;
    }
    // Restore acquires `service_gate.write()`; skip read lock for this route.
    if request.method() == Method::POST && path == "/api/admin/db-backup/restore" {
        return next.run(request).await;
    }
    let _guard = state.service_gate.read().await;
    next.run(request).await
}
