//! Adaptive Task Import API: session creation, metadata fetch, mapping save, job start.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::import::{get_engine, ImportEngineError, ImportMappingConfig, ImportProvider};
use crate::permissions::can_write;
use crate::ApiError;
use axum::Extension;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateImportSessionRequest {
    provider: String,
    connection_config: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateImportSessionResponse {
    session_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StartImportResponse {
    job_id: String,
    project_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateImportSessionMetadataRequest {
    project_id_or_key: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PutImportSessionMappingRequest {
    mapping: ImportMappingConfig,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartImportRequest {
    project_name: String,
    project_key: String,
    external_project_id_or_key: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportJobStatusResponse {
    id: String,
    project_id: String,
    status: String,
    progress_percent: i64,
    processed_count: i64,
    total_count: Option<i64>,
    error_message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LastConfigQuery {
    provider: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/import/last-config", get(get_last_import_config))
        .route("/api/import/sessions", post(create_import_session))
        .route(
            "/api/import/sessions/:session_id/verify",
            post(verify_import_connection),
        )
        .route(
            "/api/import/sessions/:session_id/metadata",
            post(fetch_import_metadata),
        )
        .route(
            "/api/import/sessions/:session_id/mapping",
            put(put_import_mapping),
        )
        .route("/api/import/sessions/:session_id/start", post(start_import))
        .route("/api/import/jobs/:job_id", get(get_import_job_status))
}

async fn get_last_import_config(
    State(state): State<AppState>,
    Extension(user): Extension<AuthedUser>,
    Query(q): Query<LastConfigQuery>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let db = state.db.read().await;
    let provider = q.provider.as_deref().unwrap_or("jira");
    let config = db
        .get_user_import_config(&user.user_id, provider)
        .map_err(|_| ApiError::internal())?;
    let value: Value = config
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Object(serde_json::Map::new()));
    Ok(Json(value))
}

async fn create_import_session(
    State(state): State<AppState>,
    Extension(user): Extension<AuthedUser>,
    Json(req): Json<CreateImportSessionRequest>,
) -> Result<Json<CreateImportSessionResponse>, ApiError> {
    let db = state.db.read().await;
    let provider = ImportProvider::from_str(&req.provider)
        .ok_or_else(|| ApiError::bad_request("unsupported provider"))?;
    let config_json =
        serde_json::to_string(&req.connection_config).map_err(|_| ApiError::internal())?;
    let _ = db.set_user_import_config(&user.user_id, provider.as_str(), &config_json);
    let session = db
        .create_import_session(provider.as_str(), &user.user_id, &config_json)
        .map_err(|_| ApiError::internal())?;
    Ok(Json(CreateImportSessionResponse {
        session_id: session.id,
    }))
}

async fn verify_import_connection(
    State(state): State<AppState>,
    Extension(user): Extension<AuthedUser>,
    Path(session_id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let session = {
        let db = state.db.read().await;
        db.get_import_session(&session_id)
            .map_err(|_| ApiError::internal())?
            .ok_or_else(|| ApiError::not_found("session not found"))?
    };
    if session.created_by_user_id != user.user_id {
        return Err(ApiError::forbidden("insufficient permissions"));
    }
    let config: Value = serde_json::from_str(&session.connection_config_json)
        .map_err(|_| ApiError::bad_request("invalid connection config"))?;
    let provider = ImportProvider::from_str(&session.provider).unwrap_or(ImportProvider::Jira);
    let engine = get_engine(provider);
    engine
        .verify_connection(&config)
        .await
        .map_err(import_error_to_api)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn fetch_import_metadata(
    State(state): State<AppState>,
    Extension(user): Extension<AuthedUser>,
    Path(session_id): Path<String>,
    Json(req): Json<CreateImportSessionMetadataRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let session = {
        let db = state.db.read().await;
        db.get_import_session(&session_id)
            .map_err(|_| ApiError::internal())?
            .ok_or_else(|| ApiError::not_found("session not found"))?
    };
    if session.created_by_user_id != user.user_id {
        return Err(ApiError::forbidden("insufficient permissions"));
    }
    let config: Value = serde_json::from_str(&session.connection_config_json)
        .map_err(|_| ApiError::bad_request("invalid connection config"))?;
    let provider = ImportProvider::from_str(&session.provider).unwrap_or(ImportProvider::Jira);
    let engine = get_engine(provider);
    let metadata = engine
        .fetch_metadata(&config, req.project_id_or_key.as_deref())
        .await
        .map_err(import_error_to_api)?;
    let json = serde_json::to_value(&metadata).map_err(|_| ApiError::internal())?;
    {
        let db = state.db.read().await;
        db.update_import_session_metadata(&session_id, &json.to_string())
            .map_err(|_| ApiError::internal())?;
    }
    Ok(Json(json))
}

async fn put_import_mapping(
    State(state): State<AppState>,
    Extension(user): Extension<AuthedUser>,
    Path(session_id): Path<String>,
    Json(req): Json<PutImportSessionMappingRequest>,
) -> Result<StatusCode, ApiError> {
    let db = state.db.read().await;
    let session = db
        .get_import_session(&session_id)
        .map_err(|_| ApiError::internal())?
        .ok_or_else(|| ApiError::not_found("session not found"))?;
    if session.created_by_user_id != user.user_id {
        return Err(ApiError::forbidden("insufficient permissions"));
    }
    let mapping_json = serde_json::to_string(&req.mapping).map_err(|_| ApiError::internal())?;
    db.update_import_session_mapping(&session_id, &mapping_json)
        .map_err(|_| ApiError::internal())?;
    Ok(StatusCode::NO_CONTENT)
}

async fn start_import(
    State(state): State<AppState>,
    Extension(user): Extension<AuthedUser>,
    Path(session_id): Path<String>,
    Json(req): Json<StartImportRequest>,
) -> Result<Json<StartImportResponse>, ApiError> {
    let db = state.db.read().await;
    let session = db
        .get_import_session(&session_id)
        .map_err(|_| ApiError::internal())?
        .ok_or_else(|| ApiError::not_found("session not found"))?;
    if session.created_by_user_id != user.user_id {
        return Err(ApiError::forbidden("insufficient permissions"));
    }
    let mapping_json = session
        .mapping_config_json
        .as_ref()
        .ok_or_else(|| ApiError::bad_request("mapping config not set"))?;
    let mapping: ImportMappingConfig = serde_json::from_str(mapping_json)
        .map_err(|_| ApiError::bad_request("invalid mapping config"))?;
    let config: Value = serde_json::from_str(&session.connection_config_json)
        .map_err(|_| ApiError::bad_request("invalid connection config"))?;

    // Build manifest with status options from mapping (so imported statuses appear in manifest)
    let mut seen = std::collections::HashSet::new();
    let mut status_options: Vec<String> = mapping
        .status_mappings
        .iter()
        .map(|s| s.rizm_status.clone())
        .filter(|s| !s.is_empty())
        .filter(|s| seen.insert(s.clone()))
        .collect();
    if let Some(ref backlog_status) = mapping.map_backlog_to_status {
        let s = backlog_status.trim();
        if !s.is_empty() && seen.insert(s.to_string()) {
            status_options.push(s.to_string());
        }
    }
    // Issue type options from metadata (Jira project issue types)
    let issue_type_options = session
        .metadata_json
        .as_ref()
        .and_then(|s| serde_json::from_str::<crate::import::ImportMetadata>(s).ok())
        .and_then(|meta| meta.issue_types)
        .filter(|v| !v.is_empty());
    let manifest = crate::defaults::manifest_with_status_options(
        status_options,
        mapping.map_backlog_to_status.as_deref(),
        issue_type_options,
    );

    // Check project_key uniqueness before creating (avoids UNIQUE constraint on idx_projects_project_key)
    if db
        .get_project_id_by_key(&req.project_key)
        .map_err(|_| ApiError::internal())?
        .is_some()
    {
        return Err(ApiError::bad_request("project.projectKey must be unique"));
    }

    // Create placeholder project with lifecycle=importing
    let project_id = crate::api::projects_api::create_project_with_manifest(
        &db,
        &user.user_id,
        &req.project_name,
        &req.project_key,
        manifest,
    )
    .map_err(|e| {
        let s = e.to_string();
        tracing::error!(error = %s, "start_import: create_project_with_manifest failed");
        if s.contains("project_key") || s.contains("UNIQUE") {
            ApiError::bad_request("project.projectKey must be unique")
        } else {
            ApiError::internal()
        }
    })?;

    db.set_project_lifecycle_status(&project_id, "importing")
        .map_err(|e| {
            tracing::error!(error = %e, "start_import: set_project_lifecycle_status failed");
            ApiError::internal()
        })?;

    db.update_import_session_project(&session_id, &project_id)
        .map_err(|e| {
            tracing::error!(error = %e, "start_import: update_import_session_project failed");
            ApiError::internal()
        })?;

    let job = db
        .create_import_job(&session_id, &project_id)
        .map_err(|e| {
            tracing::error!(error = %e, "start_import: create_import_job failed");
            ApiError::internal()
        })?;

    let provider = ImportProvider::from_str(&session.provider).unwrap_or(ImportProvider::Jira);
    let engine = get_engine(provider);
    let state_clone = state.clone();
    let job_id = job.id.clone();
    let project_id_clone = project_id.clone();
    let external_project = req.external_project_id_or_key.clone();
    tokio::spawn(async move {
        let db = state_clone.db.read().await.clone();
        let _ = db.set_import_job_running(&job_id);
        let db_path = state_clone.db_path.clone();
        let result = engine
            .run_import(
                &db,
                &db_path,
                &config,
                &mapping,
                &project_id_clone,
                &external_project,
                Some(&job_id),
            )
            .await;
        match result {
            Ok(_res) => {
                let _ = db.set_import_job_completed(&job_id);
                let _ = db.set_project_lifecycle_status(&project_id_clone, "ready");
            }
            Err(e) => {
                let _ = db.set_import_job_failed(&job_id, &e.to_string());
                // Delete the project on import failure so project_key is freed for retry
                if let Err(del_err) = db.delete_project(&project_id_clone) {
                    tracing::error!(error = %del_err, "start_import: failed to delete project after import error");
                }
            }
        }
    });

    Ok(Json(StartImportResponse {
        job_id: job.id,
        project_id,
    }))
}

async fn get_import_job_status(
    State(state): State<AppState>,
    Extension(user): Extension<AuthedUser>,
    Path(job_id): Path<String>,
) -> Result<Json<ImportJobStatusResponse>, ApiError> {
    let db = state.db.read().await;
    let job = db
        .get_import_job(&job_id)
        .map_err(|_| ApiError::internal())?
        .ok_or_else(|| ApiError::not_found("job not found"))?;
    if !can_write(&db, &job.project_id, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }
    Ok(Json(ImportJobStatusResponse {
        id: job.id,
        project_id: job.project_id,
        status: job.status,
        progress_percent: job.progress_percent,
        processed_count: job.processed_count,
        total_count: job.total_count,
        error_message: job.error_message,
    }))
}

fn import_error_to_api(e: ImportEngineError) -> ApiError {
    match e {
        ImportEngineError::Connection(s) | ImportEngineError::Api(s) => ApiError::bad_request(s),
        ImportEngineError::InvalidConfig(s) => ApiError::bad_request(s),
        ImportEngineError::Parse(_) | ImportEngineError::Internal(_) => ApiError::internal(),
    }
}
