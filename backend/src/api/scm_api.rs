use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::ApiError;
use axum::Extension;

const PROVIDER_BITBUCKET: &str = "bitbucket";
mod support;
use support::{
    bitbucket_client_env, bitbucket_create_branch, bitbucket_create_pull_request, bitbucket_get_mainbranch,
    bitbucket_list_branches, bitbucket_public_base_url, exchange_bitbucket_token, is_bitbucket_auth_error,
    load_bitbucket_config_and_token, pkce_challenge_s256, random_urlsafe,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PutProjectScmConfigRequest {
    provider: String,
    config: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectScmConfigResponse {
    provider: String,
    config: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScmOAuthStatusResponse {
    provider: String,
    connected: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OAuthStartQuery {
    return_to: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OAuthCallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BranchesQuery {
    q: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BranchesResponse {
    branches: Vec<String>,
    mainbranch: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateBranchRequest {
    name: String,
    base_branch: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateBranchResponse {
    name: String,
    url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatePullRequestRequest {
    source_branch: String,
    destination_branch: String,
    title: String,
    description: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreatePullRequestResponse {
    id: String,
    title: String,
    url: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BitbucketProjectConfig {
    workspace: String,
    repo_slug: String,
}

#[derive(Debug, Deserialize)]
struct BitbucketTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
    token_type: String,
    scopes: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BitbucketStoredToken {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
    token_type: Option<String>,
    scopes: Option<String>,
    obtained_at: Option<i64>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/projects/:project_id/scm/config",
            get(get_project_scm_config).put(put_project_scm_config),
        )
        .route(
            "/api/projects/:project_id/scm/bitbucket/branches",
            get(list_bitbucket_branches).post(create_bitbucket_branch),
        )
        .route(
            "/api/projects/:project_id/scm/bitbucket/pullrequests",
            axum::routing::post(create_bitbucket_pull_request),
        )
        .route("/api/scm/bitbucket/oauth/status", get(bitbucket_oauth_status))
        .route("/api/scm/bitbucket/oauth/start", get(bitbucket_oauth_start))
        .route("/api/scm/bitbucket/oauth/callback", get(bitbucket_oauth_callback))
}

async fn get_project_scm_config(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Extension(user): Extension<AuthedUser>,
) -> Result<Json<Option<ProjectScmConfigResponse>>, ApiError> {
    let db = state.db.read().await;
    if !crate::permissions::can_read(&db, &project_id, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }
    let row = db
        .get_project_scm_config(&project_id, PROVIDER_BITBUCKET)
        .map_err(|_| ApiError::internal())?;
    let out = row.map(|r| ProjectScmConfigResponse {
        provider: r.provider,
        config: serde_json::from_str(&r.config_json).unwrap_or_else(|_| json!({})),
    });
    Ok(Json(out))
}

async fn put_project_scm_config(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Extension(user): Extension<AuthedUser>,
    Json(req): Json<PutProjectScmConfigRequest>,
) -> Result<StatusCode, ApiError> {
    let db = state.db.read().await;
    if !crate::permissions::can_write(&db, &project_id, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }
    if req.provider != PROVIDER_BITBUCKET {
        return Err(ApiError::bad_request("unsupported provider"));
    }
    let cfg: BitbucketProjectConfig = serde_json::from_value(req.config.clone())
        .map_err(|_| ApiError::bad_request("invalid config"))?;
    if cfg.workspace.trim().is_empty() || cfg.repo_slug.trim().is_empty() {
        return Err(ApiError::bad_request("workspace and repoSlug are required"));
    }
    let config_json = serde_json::to_string(&cfg).map_err(|_| ApiError::internal())?;
    db.set_project_scm_config(&project_id, PROVIDER_BITBUCKET, &config_json)
        .map_err(|_| ApiError::internal())?;
    Ok(StatusCode::NO_CONTENT)
}

async fn bitbucket_oauth_status(
    State(state): State<AppState>,
    Extension(user): Extension<AuthedUser>,
) -> Result<Json<ScmOAuthStatusResponse>, ApiError> {
    let db = state.db.read().await;
    let cred = db
        .get_user_scm_credential(&user.user_id, PROVIDER_BITBUCKET)
        .map_err(|_| ApiError::internal())?;
    Ok(Json(ScmOAuthStatusResponse {
        provider: PROVIDER_BITBUCKET.to_string(),
        connected: cred.is_some(),
    }))
}

async fn bitbucket_oauth_start(
    State(state): State<AppState>,
    Extension(user): Extension<AuthedUser>,
    Query(q): Query<OAuthStartQuery>,
) -> Result<impl IntoResponse, ApiError> {
    let (client_id, _client_secret) = bitbucket_client_env()?;
    let redirect_base = bitbucket_public_base_url()?;
    let redirect_uri = format!("{redirect_base}/api/scm/bitbucket/oauth/callback");
    let return_to = q.return_to.unwrap_or_else(|| "/".to_string());

    let state_token = random_urlsafe(24);
    let code_verifier = random_urlsafe(32);
    let code_challenge = pkce_challenge_s256(&code_verifier)?;
    let expires_at = crate::time::now_ms() + 10 * 60 * 1000;
    let db = state.db.read().await;
    db.create_oauth_state(
        &user.user_id,
        PROVIDER_BITBUCKET,
        &state_token,
        &code_verifier,
        &return_to,
        expires_at,
    )
    .map_err(|_| ApiError::internal())?;

    let url = format!(
        "https://bitbucket.org/site/oauth2/authorize?client_id={}&response_type=code&redirect_uri={}&state={}&code_challenge={}&code_challenge_method=S256",
        urlencoding::encode(&client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(&state_token),
        urlencoding::encode(&code_challenge)
    );
    Ok(axum::response::Redirect::to(&url))
}

async fn bitbucket_oauth_callback(
    State(state): State<AppState>,
    Extension(_user): Extension<AuthedUser>,
    Query(q): Query<OAuthCallbackQuery>,
) -> Result<impl IntoResponse, ApiError> {
    if let Some(err) = q.error {
        let msg = q.error_description.unwrap_or(err);
        return Err(ApiError::bad_request(msg));
    }
    let Some(code) = q.code else {
        return Err(ApiError::bad_request("missing code"));
    };
    let Some(state_token) = q.state else {
        return Err(ApiError::bad_request("missing state"));
    };

    let now_ms = crate::time::now_ms();
    let oauth_state = {
        let db = state.db.read().await;
        db.consume_oauth_state(PROVIDER_BITBUCKET, &state_token, now_ms)
            .map_err(|_| ApiError::internal())?
    }
    .ok_or_else(|| ApiError::bad_request("invalid or expired state"))?;

    let (client_id, client_secret) = bitbucket_client_env()?;
    let redirect_base = bitbucket_public_base_url()?;
    let redirect_uri = format!("{redirect_base}/api/scm/bitbucket/oauth/callback");

    let token = exchange_bitbucket_token(
        &client_id,
        &client_secret,
        &code,
        &redirect_uri,
        &oauth_state.code_verifier,
    )
    .await?;

    let stored = BitbucketStoredToken {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_in: token.expires_in,
        token_type: Some(token.token_type),
        scopes: token.scopes,
        obtained_at: Some(now_ms),
    };
    let token_json = serde_json::to_string(&stored).map_err(|_| ApiError::internal())?;

    let db = state.db.read().await;
    db.set_user_scm_credential(&oauth_state.user_id, PROVIDER_BITBUCKET, &token_json)
        .map_err(|_| ApiError::internal())?;

    Ok(axum::response::Redirect::to(&oauth_state.return_to))
}

async fn list_bitbucket_branches(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Query(query): Query<BranchesQuery>,
    Extension(user): Extension<AuthedUser>,
) -> Result<Json<BranchesResponse>, ApiError> {
    if !crate::permissions::can_read(&*state.db.read().await, &project_id, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }
    let (cfg, token) = load_bitbucket_config_and_token(&state, &project_id, &user.user_id, false).await?;
    let q = query.q.as_deref();
    let branches = match bitbucket_list_branches(&cfg, &token, q).await {
        Ok(branches) => branches,
        Err(err) if is_bitbucket_auth_error(&err) => {
            let (cfg, token) = load_bitbucket_config_and_token(&state, &project_id, &user.user_id, true).await?;
            bitbucket_list_branches(&cfg, &token, q).await?
        }
        Err(err) => return Err(err),
    };
    let mainbranch = match bitbucket_get_mainbranch(&cfg, &token).await {
        Ok(mb) => mb,
        Err(err) if is_bitbucket_auth_error(&err) => {
            let (cfg, token) = load_bitbucket_config_and_token(&state, &project_id, &user.user_id, true).await?;
            bitbucket_get_mainbranch(&cfg, &token).await.ok().flatten()
        }
        _ => None,
    };
    Ok(Json(BranchesResponse { branches, mainbranch }))
}

async fn create_bitbucket_branch(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Extension(user): Extension<AuthedUser>,
    Json(req): Json<CreateBranchRequest>,
) -> Result<Json<CreateBranchResponse>, ApiError> {
    if !crate::permissions::can_write(&*state.db.read().await, &project_id, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }
    if req.name.trim().is_empty() || req.base_branch.trim().is_empty() {
        return Err(ApiError::bad_request("name and baseBranch are required"));
    }
    let (cfg, token) = load_bitbucket_config_and_token(&state, &project_id, &user.user_id, false).await?;
    let (name, url) = match bitbucket_create_branch(&cfg, &token, &req.name, &req.base_branch).await {
        Ok(result) => result,
        Err(err) if is_bitbucket_auth_error(&err) => {
            let (cfg, token) = load_bitbucket_config_and_token(&state, &project_id, &user.user_id, true).await?;
            bitbucket_create_branch(&cfg, &token, &req.name, &req.base_branch).await?
        }
        Err(err) => return Err(err),
    };
    Ok(Json(CreateBranchResponse { name, url }))
}

async fn create_bitbucket_pull_request(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Extension(user): Extension<AuthedUser>,
    Json(req): Json<CreatePullRequestRequest>,
) -> Result<Json<CreatePullRequestResponse>, ApiError> {
    if !crate::permissions::can_write(&*state.db.read().await, &project_id, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }
    if req.source_branch.trim().is_empty() || req.destination_branch.trim().is_empty() || req.title.trim().is_empty() {
        return Err(ApiError::bad_request("sourceBranch, destinationBranch, and title are required"));
    }
    let (cfg, token) = load_bitbucket_config_and_token(&state, &project_id, &user.user_id, false).await?;
    let (id, title, url) = match bitbucket_create_pull_request(&cfg, &token, &req).await {
        Ok(result) => result,
        Err(err) if is_bitbucket_auth_error(&err) => {
            let (cfg, token) = load_bitbucket_config_and_token(&state, &project_id, &user.user_id, true).await?;
            bitbucket_create_pull_request(&cfg, &token, &req).await?
        }
        Err(err) => return Err(err),
    };
    Ok(Json(CreatePullRequestResponse { id, title, url }))
}
