use axum::{
    extract::{ConnectInfo, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;

use crate::app_state::AppState;
use crate::ApiError;

use super::types::{AuthedUser, Role};
use super::utils::{
    build_session_cookie, client_ip, json_meta, new_session_id, normalize_email, verify_password,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MeResponse {
    user_id: String,
    email: String,
    role: Role,
    last_login_at: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DevAdminLoginStatusResponse {
    enabled: bool,
}

#[derive(Debug, Deserialize)]
struct LoginRequest {
    email: String,
    password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChangePasswordRequest {
    current_password: String,
    new_password: String,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/api/auth/login", post(login)).route(
        "/api/auth/dev-admin-login",
        get(dev_admin_login_status).post(dev_admin_login),
    )
}

pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route("/api/auth/logout", post(logout))
        .route("/api/auth/me", get(me))
        .route("/api/auth/change-password", post(change_password))
}

async fn login(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(req): Json<LoginRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let now = crate::time::now_ms();
    let email =
        normalize_email(&req.email).ok_or_else(|| ApiError::unauthorized("invalid credentials"))?;
    let password = req.password;

    // Rate limiting: per-IP and per-email.
    let ip = client_ip(&headers).unwrap_or_else(|| addr.ip().to_string());
    let ip_key = format!("ip:{ip}");
    let email_key = format!("email:{email}");

    let (ok_ip, backoff_ip) = state
        .login_limiter
        .can_attempt(&ip_key, now, 5 * 60 * 1000, 5)
        .await;
    let (ok_email, backoff_email) = state
        .login_limiter
        .can_attempt(&email_key, now, 5 * 60 * 1000, 5)
        .await;
    if !ok_ip || !ok_email {
        let backoff = backoff_ip.max(backoff_email);
        let mut err = ApiError::too_many_requests("too many attempts");
        err.retry_after_ms = Some(backoff);
        return Err(err);
    }

    let user = {
        let db = state.db.read().await;
        db.get_user_by_email(&email)
            .map_err(|_| ApiError::internal())?
    };

    // Fail fast but keep message vague.
    let user = match user {
        None => {
            state.login_limiter.register_failure(&ip_key, now).await;
            state.login_limiter.register_failure(&email_key, now).await;
            let _ = {
                let db = state.db.read().await;
                db.insert_audit_log(
                    None,
                    "LOGIN_FAILURE",
                    None,
                    Some(&json_meta(&email, &ip)),
                    now,
                )
            };
            return Err(ApiError::unauthorized("invalid credentials"));
        }
        Some(u) => u,
    };

    if user.is_disabled {
        state.login_limiter.register_failure(&ip_key, now).await;
        state.login_limiter.register_failure(&email_key, now).await;
        let _ = {
            let db = state.db.read().await;
            db.insert_audit_log(
                Some(&user.id),
                "LOGIN_FAILURE",
                Some(&user.id),
                Some(&json_meta(&email, &ip)),
                now,
            )
        };
        return Err(ApiError::unauthorized("invalid credentials"));
    }

    let password_hash = user
        .password_hash
        .clone()
        .ok_or_else(|| ApiError::unauthorized("invalid credentials"))?;
    if !verify_password(&password_hash, &password) {
        state.login_limiter.register_failure(&ip_key, now).await;
        state.login_limiter.register_failure(&email_key, now).await;
        let _ = {
            let db = state.db.read().await;
            db.insert_audit_log(
                Some(&user.id),
                "LOGIN_FAILURE",
                Some(&user.id),
                Some(&json_meta(&email, &ip)),
                now,
            )
        };
        return Err(ApiError::unauthorized("invalid credentials"));
    }

    // Success
    state.login_limiter.clear(&ip_key).await;
    state.login_limiter.clear(&email_key).await;

    let session_id = new_session_id();
    let expires_at = now + state.auth.session_ttl_ms;
    let user_agent = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    {
        let db = state.db.read().await;
        db.create_session(
            &session_id,
            &user.id,
            now,
            expires_at,
            user_agent.as_deref(),
            Some(&ip),
        )
        .map_err(|_| ApiError::internal())?;
        let _ = db.set_user_last_login(&user.id, now);
        let _ = db.insert_audit_log(
            Some(&user.id),
            "LOGIN_SUCCESS",
            Some(&user.id),
            Some(&json_meta(&email, &ip)),
            now,
        );
    }

    let cookie = build_session_cookie(&state, &session_id);
    let mut res = Json(MeResponse {
        user_id: user.id,
        email: user.email,
        role: Role::from_db(&user.role).unwrap_or(Role::Viewer),
        last_login_at: Some(now),
    })
    .into_response();
    res.headers_mut().append(
        header::SET_COOKIE,
        HeaderValue::from_str(&cookie.to_string()).map_err(|_| ApiError::internal())?,
    );
    Ok(res)
}

async fn logout(
    State(state): State<AppState>,
    Extension(user): Extension<AuthedUser>,
) -> Result<impl IntoResponse, ApiError> {
    let now = crate::time::now_ms();
    {
        let db = state.db.read().await;
        let _ = db.delete_session(&user.session_id);
        let _ = db.insert_audit_log(
            Some(&user.user_id),
            "LOGOUT",
            Some(&user.user_id),
            None,
            now,
        );
    }

    let mut cookie = build_session_cookie(&state, "");
    cookie.make_removal();

    let mut res = StatusCode::NO_CONTENT.into_response();
    res.headers_mut().append(
        header::SET_COOKIE,
        HeaderValue::from_str(&cookie.to_string()).map_err(|_| ApiError::internal())?,
    );
    Ok(res)
}

async fn me(Extension(user): Extension<AuthedUser>) -> Result<Json<MeResponse>, ApiError> {
    Ok(Json(MeResponse {
        user_id: user.user_id,
        email: user.email,
        role: user.role,
        last_login_at: user.last_login_at,
    }))
}

async fn change_password(
    State(state): State<AppState>,
    Extension(user): Extension<AuthedUser>,
    Json(req): Json<ChangePasswordRequest>,
) -> Result<impl IntoResponse, ApiError> {
    if req.new_password.trim().len() < 12 {
        return Err(ApiError::bad_request(
            "password must be at least 12 characters",
        ));
    }

    let u = {
        let db = state.db.read().await;
        db.get_user_by_id(&user.user_id)
            .map_err(|_| ApiError::internal())?
            .ok_or_else(|| ApiError::unauthorized("unauthorized"))?
    };

    let hash = u
        .password_hash
        .ok_or_else(|| ApiError::bad_request("password not set"))?;
    if !verify_password(&hash, &req.current_password) {
        return Err(ApiError::unauthorized("invalid credentials"));
    }

    let new_hash = super::utils::hash_password_for_bootstrap(&req.new_password);
    {
        let db = state.db.read().await;
        db.set_user_password_hash(&user.user_id, &new_hash)
            .map_err(|_| ApiError::internal())?;

        let now = crate::time::now_ms();
        let _ = db.insert_audit_log(
            Some(&user.user_id),
            "PASSWORD_CHANGED",
            Some(&user.user_id),
            None,
            now,
        );
    }

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/auth/dev-admin-login
/// Returns whether dev admin login is enabled.
/// Returns 404 if disabled (to hide the feature).
async fn dev_admin_login_status(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, ApiError> {
    if !state.auth.dev_admin_login_enabled {
        return Err(ApiError::not_found("not found"));
    }
    Ok(Json(DevAdminLoginStatusResponse { enabled: true }))
}

/// POST /api/auth/dev-admin-login
/// Creates a session for the admin user without password verification.
/// Only works when dev_admin_login_enabled is true.
async fn dev_admin_login(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, ApiError> {
    if !state.auth.dev_admin_login_enabled {
        return Err(ApiError::not_found("not found"));
    }

    let now = crate::time::now_ms();
    let ip = client_ip(&headers).unwrap_or_else(|| addr.ip().to_string());

    // Find admin user: prefer KEEL_BOOTSTRAP_ADMIN_EMAIL, fallback to admin@example.local
    let admin_email = std::env::var("KEEL_BOOTSTRAP_ADMIN_EMAIL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim().to_lowercase())
        .unwrap_or_else(|| "admin@example.local".to_string());

    let user = {
        let db = state.db.read().await;
        db.get_user_by_email(&admin_email)
            .map_err(|_| ApiError::internal())?
    };

    let user = match user {
        None => {
            let _ = {
                let db = state.db.read().await;
                db.insert_audit_log(
                    None,
                    "DEV_LOGIN_FAILURE",
                    None,
                    Some(&json_meta(&admin_email, &ip)),
                    now,
                )
            };
            return Err(ApiError::unauthorized("admin user not found"));
        }
        Some(u) => u,
    };

    if user.is_disabled {
        let _ = {
            let db = state.db.read().await;
            db.insert_audit_log(
                Some(&user.id),
                "DEV_LOGIN_FAILURE",
                Some(&user.id),
                Some(&json_meta(&admin_email, &ip)),
                now,
            )
        };
        return Err(ApiError::unauthorized("admin user is disabled"));
    }

    // Verify the user is actually an admin
    if !matches!(Role::from_db(&user.role), Some(Role::Admin)) {
        let _ = {
            let db = state.db.read().await;
            db.insert_audit_log(
                Some(&user.id),
                "DEV_LOGIN_FAILURE",
                Some(&user.id),
                Some(&json_meta(&admin_email, &ip)),
                now,
            )
        };
        return Err(ApiError::unauthorized("user is not an admin"));
    }

    // Create session
    let session_id = new_session_id();
    let expires_at = now + state.auth.session_ttl_ms;
    let user_agent = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    {
        let db = state.db.read().await;
        db.create_session(
            &session_id,
            &user.id,
            now,
            expires_at,
            user_agent.as_deref(),
            Some(&ip),
        )
        .map_err(|_| ApiError::internal())?;
        let _ = db.set_user_last_login(&user.id, now);
        let _ = db.insert_audit_log(
            Some(&user.id),
            "DEV_LOGIN_SUCCESS",
            Some(&user.id),
            Some(&json_meta(&admin_email, &ip)),
            now,
        );
    }

    let cookie = build_session_cookie(&state, &session_id);
    let mut res = Json(MeResponse {
        user_id: user.id,
        email: user.email,
        role: Role::from_db(&user.role).unwrap_or(Role::Admin),
        last_login_at: Some(now),
    })
    .into_response();
    res.headers_mut().append(
        header::SET_COOKIE,
        HeaderValue::from_str(&cookie.to_string()).map_err(|_| ApiError::internal())?,
    );
    Ok(res)
}
