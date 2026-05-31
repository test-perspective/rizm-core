use axum::http::StatusCode;

use crate::app_state::AppState;
use crate::ApiError;

use super::super::{
    BitbucketProjectConfig, BitbucketStoredToken, BitbucketTokenResponse, PROVIDER_BITBUCKET,
};

pub const BITBUCKET_REFRESH_SKEW_MS: i64 = 5 * 60 * 1000;

pub async fn load_bitbucket_config_and_token(
    state: &AppState,
    project_id: &str,
    user_id: &str,
    force_refresh: bool,
) -> Result<(BitbucketProjectConfig, String), ApiError> {
    let (cfg_row, cred) = {
        let db = state.db.read().await;
        let cfg_row = db
            .get_project_scm_config(project_id, PROVIDER_BITBUCKET)
            .map_err(|_| ApiError::internal())?
            .ok_or_else(|| ApiError::bad_request("bitbucket config not found"))?;
        let cred = db
            .get_user_scm_credential(user_id, PROVIDER_BITBUCKET)
            .map_err(|_| ApiError::internal())?
            .ok_or_else(|| ApiError::bad_request("bitbucket not connected"))?;
        (cfg_row, cred)
    };
    let cfg: BitbucketProjectConfig = serde_json::from_str(&cfg_row.config_json)
        .map_err(|_| ApiError::bad_request("invalid bitbucket config"))?;
    let mut token: BitbucketStoredToken =
        serde_json::from_str(&cred.token_json).map_err(|_| ApiError::internal())?;
    let now_ms = crate::time::now_ms();
    let missing_expiry = token.expires_in.is_none() || token.obtained_at.is_none();
    let expired = token_is_expired(&token, now_ms).unwrap_or(false);
    let should_refresh = force_refresh || missing_expiry || token_should_refresh(&token, now_ms);
    if (should_refresh || expired) && token.refresh_token.is_none() {
        return Err(ApiError::unauthorized(
            "bitbucket token expired, please reconnect",
        ));
    }
    if should_refresh {
        let refresh_token = token
            .refresh_token
            .clone()
            .ok_or_else(|| ApiError::unauthorized("bitbucket token expired, please reconnect"))?;
        let (client_id, client_secret) = bitbucket_client_env()?;
        let refreshed = refresh_bitbucket_token(&client_id, &client_secret, &refresh_token).await?;
        token = merge_refreshed_token(token, refreshed, now_ms);
        let token_json = serde_json::to_string(&token).map_err(|_| ApiError::internal())?;
        let db = state.db.read().await;
        db.set_user_scm_credential(user_id, PROVIDER_BITBUCKET, &token_json)
            .map_err(|_| ApiError::internal())?;
    }
    Ok((cfg, token.access_token))
}

pub fn bitbucket_client_env() -> Result<(String, String), ApiError> {
    let client_id = std::env::var("KEEL_BITBUCKET_CLIENT_ID")
        .ok()
        .filter(|s| !s.trim().is_empty());
    let client_secret = std::env::var("KEEL_BITBUCKET_CLIENT_SECRET")
        .ok()
        .filter(|s| !s.trim().is_empty());
    match (client_id, client_secret) {
        (Some(id), Some(secret)) => Ok((id, secret)),
        _ => Err(ApiError::bad_request(
            "bitbucket oauth is not configured (KEEL_BITBUCKET_CLIENT_ID/SECRET)",
        )),
    }
}

pub fn bitbucket_public_base_url() -> Result<String, ApiError> {
    let base = std::env::var("KEEL_PUBLIC_BASE_URL")
        .ok()
        .filter(|s| !s.trim().is_empty());
    base.ok_or_else(|| {
        ApiError::bad_request("KEEL_PUBLIC_BASE_URL is required for Bitbucket OAuth")
    })
}

pub fn random_urlsafe(len_bytes: usize) -> String {
    use base64::Engine;
    use rand::RngCore;

    let mut buf = vec![0u8; len_bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(buf)
}

pub fn pkce_challenge_s256(code_verifier: &str) -> Result<String, ApiError> {
    use base64::Engine;
    use sha2::{Digest, Sha256};

    let mut hasher = Sha256::new();
    hasher.update(code_verifier.as_bytes());
    let digest = hasher.finalize();
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest))
}

pub async fn exchange_bitbucket_token(
    client_id: &str,
    client_secret: &str,
    code: &str,
    redirect_uri: &str,
    code_verifier: &str,
) -> Result<BitbucketTokenResponse, ApiError> {
    let client = reqwest::Client::new();
    let res = client
        .post("https://bitbucket.org/site/oauth2/access_token")
        .basic_auth(client_id, Some(client_secret))
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", redirect_uri),
            ("code_verifier", code_verifier),
        ])
        .send()
        .await
        .map_err(|_| ApiError::internal())?;
    if !res.status().is_success() {
        let text = res.text().await.unwrap_or_default();
        return Err(ApiError::bad_request(text));
    }
    res.json::<BitbucketTokenResponse>()
        .await
        .map_err(|_| ApiError::internal())
}

async fn refresh_bitbucket_token(
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> Result<BitbucketTokenResponse, ApiError> {
    let client = reqwest::Client::new();
    let res = client
        .post("https://bitbucket.org/site/oauth2/access_token")
        .basic_auth(client_id, Some(client_secret))
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
        ])
        .send()
        .await
        .map_err(|_| ApiError::internal())?;
    if !res.status().is_success() {
        let text = res.text().await.unwrap_or_default();
        return Err(ApiError::bad_request(text));
    }
    res.json::<BitbucketTokenResponse>()
        .await
        .map_err(|_| ApiError::internal())
}

pub fn merge_refreshed_token(
    previous: BitbucketStoredToken,
    refreshed: BitbucketTokenResponse,
    now_ms: i64,
) -> BitbucketStoredToken {
    BitbucketStoredToken {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token.or(previous.refresh_token),
        expires_in: refreshed.expires_in,
        token_type: Some(refreshed.token_type),
        scopes: refreshed.scopes,
        obtained_at: Some(now_ms),
    }
}

fn token_is_expired(token: &BitbucketStoredToken, now_ms: i64) -> Option<bool> {
    let Some(expires_in) = token.expires_in else {
        return None;
    };
    let Some(obtained_at) = token.obtained_at else {
        return None;
    };
    if expires_in <= 0 {
        return Some(true);
    }
    let expires_at = obtained_at + expires_in * 1000;
    Some(now_ms >= expires_at)
}

pub fn token_should_refresh(token: &BitbucketStoredToken, now_ms: i64) -> bool {
    let Some(expires_in) = token.expires_in else {
        return false;
    };
    let Some(obtained_at) = token.obtained_at else {
        return false;
    };
    if expires_in <= 0 {
        return true;
    }
    let expires_at = obtained_at + expires_in * 1000;
    now_ms >= expires_at - BITBUCKET_REFRESH_SKEW_MS
}

pub fn is_bitbucket_auth_error(err: &ApiError) -> bool {
    matches!(err.status, StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN)
}
