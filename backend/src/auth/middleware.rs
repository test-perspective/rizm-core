use axum::{
    extract::State,
    http::{header, HeaderMap, Method},
    middleware::Next,
    response::{IntoResponse, Response},
};

use crate::app_state::AppState;
use crate::db::{SessionRecord, UserRecord};
use crate::ApiError;

use super::types::{AuthedUser, Role};
use super::utils::get_cookie;

pub async fn csrf_middleware(
    State(state): State<AppState>,
    req: axum::http::Request<axum::body::Body>,
    next: Next,
) -> Response {
    let method = req.method().clone();
    if method == Method::GET || method == Method::HEAD || method == Method::OPTIONS {
        return next.run(req).await;
    }

    if is_same_origin(state.auth.csrf_allowed_origin.as_deref(), req.headers()) {
        return next.run(req).await;
    }

    ApiError::forbidden("forbidden").into_response()
}

pub async fn session_middleware(
    State(state): State<AppState>,
    mut req: axum::http::Request<axum::body::Body>,
    next: Next,
) -> Response {
    let method = req.method().clone();
    if method == Method::OPTIONS {
        return next.run(req).await;
    }

    let cookie_name = state.auth.cookie_name.clone();
    let session_id = match get_cookie(req.headers(), &cookie_name) {
        None => return ApiError::unauthorized("unauthorized").into_response(),
        Some(v) => v,
    };

    let now = crate::time::now_ms();
    let db = state.db.read().await;
    // Light cleanup. Ignore errors to avoid turning auth into a 500.
    let _ = db.delete_expired_sessions(now);

    let session: SessionRecord = match db.get_session(&session_id) {
        Ok(Some(s)) => s,
        Ok(None) => return ApiError::unauthorized("unauthorized").into_response(),
        Err(_) => return ApiError::internal().into_response(),
    };

    if session.expires_at <= now {
        let _ = db.delete_session(&session_id);
        return ApiError::unauthorized("unauthorized").into_response();
    }

    let user: UserRecord = match db.get_user_by_id(&session.user_id) {
        Ok(Some(u)) => u,
        Ok(None) => {
            let _ = db.delete_session(&session_id);
            return ApiError::unauthorized("unauthorized").into_response();
        }
        Err(_) => return ApiError::internal().into_response(),
    };

    if user.is_disabled {
        let _ = db.delete_session(&session_id);
        return ApiError::unauthorized("unauthorized").into_response();
    }

    let role = match Role::from_db(&user.role) {
        Some(r) => r,
        None => return ApiError::internal().into_response(),
    };

    let _ = db.touch_session(&session_id, now);
    req.extensions_mut().insert(AuthedUser {
        user_id: user.id,
        email: user.email,
        role,
        last_login_at: user.last_login_at,
        session_id,
    });

    // Release db read before awaiting the handler: handlers may need `db.write()` (e.g. DB restore).
    drop(db);

    next.run(req).await
}

/// Optional session middleware that allows anonymous users.
/// If a session exists, it authenticates the user; otherwise, the request continues without authentication.
pub async fn optional_session_middleware(
    State(state): State<AppState>,
    mut req: axum::http::Request<axum::body::Body>,
    next: Next,
) -> Response {
    let method = req.method().clone();
    if method == Method::OPTIONS {
        return next.run(req).await;
    }

    let cookie_name = state.auth.cookie_name.clone();
    if let Some(session_id) = get_cookie(req.headers(), &cookie_name) {
        let now = crate::time::now_ms();
        let db = state.db.read().await;
        // Light cleanup. Ignore errors to avoid turning auth into a 500.
        let _ = db.delete_expired_sessions(now);

        if let Ok(Some(session)) = db.get_session(&session_id) {
            if session.expires_at > now {
                if let Ok(Some(user)) = db.get_user_by_id(&session.user_id) {
                    if !user.is_disabled {
                        if let Some(role) = Role::from_db(&user.role) {
                            let _ = db.touch_session(&session_id, now);
                            req.extensions_mut().insert(AuthedUser {
                                user_id: user.id,
                                email: user.email,
                                role,
                                last_login_at: user.last_login_at,
                                session_id,
                            });
                        }
                    }
                }
            }
        }
    }

    next.run(req).await
}

fn is_same_origin(allowed_origin: Option<&str>, headers: &HeaderMap) -> bool {
    let host = headers.get(header::HOST).and_then(|v| v.to_str().ok());
    let origin = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok());
    let referer = headers.get(header::REFERER).and_then(|v| v.to_str().ok());

    if let Some(origin) = origin {
        if origin_matches(host, origin) {
            return true;
        }
        if let Some(allowed) = allowed_origin {
            if origin == allowed {
                return true;
            }
            if loopback_equivalent_origin(allowed, origin) {
                return true;
            }
        }
    }

    if let Some(referer) = referer {
        if referer_matches(host, referer) {
            return true;
        }
        if let Some(allowed) = allowed_origin {
            if referer.starts_with(allowed) {
                return true;
            }
            if loopback_equivalent_origin(allowed, referer) {
                return true;
            }
        }
    }

    false
}

fn is_loopback_host(h: &str) -> bool {
    h == "localhost" || h == "127.0.0.1"
}

/// Dev-friendly origin equivalence:
/// treat localhost and 127.0.0.1 as equivalent when scheme+port match.
fn loopback_equivalent_origin(allowed: &str, candidate: &str) -> bool {
    let a = match url::Url::parse(allowed) {
        Ok(u) => u,
        Err(_) => return false,
    };
    let c = match url::Url::parse(candidate) {
        Ok(u) => u,
        Err(_) => return false,
    };
    let a_host = match a.host_str() {
        Some(h) => h,
        None => return false,
    };
    let c_host = match c.host_str() {
        Some(h) => h,
        None => return false,
    };
    if !is_loopback_host(a_host) || !is_loopback_host(c_host) {
        return false;
    }
    if a.scheme() != c.scheme() {
        return false;
    }
    // Compare effective ports (including scheme defaults).
    a.port_or_known_default() == c.port_or_known_default()
}

fn origin_matches(host: Option<&str>, origin: &str) -> bool {
    let host = match host {
        None => return false,
        Some(h) => h,
    };
    let url = match url::Url::parse(origin) {
        Ok(u) => u,
        Err(_) => return false,
    };
    match url.host_str() {
        None => false,
        Some(h) => {
            let port = url.port();
            match port {
                None => host == h,
                Some(p) => host == format!("{h}:{p}"),
            }
        }
    }
}

fn referer_matches(host: Option<&str>, referer: &str) -> bool {
    let host = match host {
        None => return false,
        Some(h) => h,
    };
    let url = match url::Url::parse(referer) {
        Ok(u) => u,
        Err(_) => return false,
    };
    match url.host_str() {
        None => false,
        Some(h) => {
            let port = url.port();
            match port {
                None => host == h,
                Some(p) => host == format!("{h}:{p}"),
            }
        }
    }
}
