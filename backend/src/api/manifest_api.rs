use axum::{
    extract::{Path, State, Extension},
    http::{header, HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
use serde::Deserialize;

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::models::ProjectManifest;
use crate::ApiError;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PutManifestRequest {
    manifest: ProjectManifest,
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    message: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/api/projects/:project_id/manifest",
        get(get_manifest).put(put_manifest),
    )
}

async fn get_manifest(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
) -> Result<(HeaderMap, Json<ProjectManifest>), ApiError> {
    let db = state.db.read().await;
    let (manifest, etag) = db
        .get_manifest_with_etag(&project_id)
        .map_err(|_| ApiError::internal())?
        .ok_or_else(|| ApiError::not_found("not found"))?;
    let mut headers = HeaderMap::new();
    headers.insert(header::ETAG, format!("\"{}\"", etag).parse().unwrap());
    Ok((headers, Json(manifest)))
}

async fn put_manifest(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    headers: HeaderMap,
    Extension(user): Extension<AuthedUser>,
    Json(req): Json<PutManifestRequest>,
) -> Result<(StatusCode, HeaderMap), ApiError> {
    let if_match = headers
        .get(header::IF_MATCH)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().trim_matches('"').to_string())
        .unwrap_or_default();
    if if_match.is_empty() {
        return Err(ApiError::precondition_required("If-Match header is required"));
    }

    let db = state.db.read().await;
    let new_etag = db
        .put_manifest_if_match(
            &project_id,
            &if_match,
            req.manifest,
            req.source.as_deref(),
            req.message.as_deref(),
            Some(&user.user_id),
        )
        .map_err(|e| match e {
            crate::db::ManifestWriteError::NotFound => ApiError::not_found("not found"),
            crate::db::ManifestWriteError::Conflict { current_etag } => {
                ApiError::precondition_failed(format!("conflict (current etag = {current_etag})"))
            }
        })?;

    let mut out = HeaderMap::new();
    out.insert(header::ETAG, format!("\"{}\"", new_etag).parse().unwrap());
    Ok((StatusCode::NO_CONTENT, out))
}

