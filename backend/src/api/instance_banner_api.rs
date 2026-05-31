//! Instance-wide announcement banner (REQ-179): meta-backed, admin-writable, all authed users can read.

use axum::{
    extract::State,
    routing::{get, put},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::admin::ensure_admin;
use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::ApiError;

const DEFAULT_BACKGROUND: &str = "#1e40af";
const MESSAGE_MAX_LEN: usize = 2000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceBannerResponse {
    pub background_color: String,
    pub message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PutInstanceBannerRequest {
    background_color: String,
    message: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredBanner {
    background_color: String,
    message: String,
}

pub(crate) fn validate_background_color(input: &str) -> Result<String, ApiError> {
    let s = input.trim();
    if s.is_empty() {
        return Err(ApiError::bad_request("backgroundColor is required"));
    }
    if let Some(hex) = s.strip_prefix('#') {
        let ok_len =
            matches!(hex.len(), 3 | 4 | 6 | 8) && hex.chars().all(|c| c.is_ascii_hexdigit());
        if ok_len {
            return Ok(format!("#{}", hex.to_ascii_lowercase()));
        }
        return Err(ApiError::bad_request("invalid backgroundColor"));
    }
    let inner = s
        .strip_prefix("rgb(")
        .and_then(|x| x.strip_suffix(')'))
        .ok_or_else(|| ApiError::bad_request("invalid backgroundColor"))?;
    let parts: Vec<&str> = inner
        .split(',')
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .collect();
    if parts.len() != 3 {
        return Err(ApiError::bad_request("invalid backgroundColor"));
    }
    let r: u8 = parts[0]
        .parse()
        .map_err(|_| ApiError::bad_request("invalid backgroundColor"))?;
    let g: u8 = parts[1]
        .parse()
        .map_err(|_| ApiError::bad_request("invalid backgroundColor"))?;
    let b: u8 = parts[2]
        .parse()
        .map_err(|_| ApiError::bad_request("invalid backgroundColor"))?;
    Ok(format!("rgb({r}, {g}, {b})"))
}

fn decode_stored(raw: Option<String>) -> InstanceBannerResponse {
    let Some(s) = raw else {
        return InstanceBannerResponse {
            background_color: DEFAULT_BACKGROUND.to_string(),
            message: String::new(),
        };
    };
    match serde_json::from_str::<StoredBanner>(&s) {
        Ok(p) => InstanceBannerResponse {
            background_color: if p.background_color.trim().is_empty() {
                DEFAULT_BACKGROUND.to_string()
            } else {
                p.background_color
            },
            message: p.message,
        },
        Err(_) => InstanceBannerResponse {
            background_color: DEFAULT_BACKGROUND.to_string(),
            message: String::new(),
        },
    }
}

pub fn router() -> Router<AppState> {
    Router::new().route("/api/instance-banner", get(get_instance_banner))
}

pub fn admin_router() -> Router<AppState> {
    Router::new().route("/api/admin/instance-banner", put(put_instance_banner))
}

async fn get_instance_banner(
    State(state): State<AppState>,
    Extension(_user): Extension<AuthedUser>,
) -> Result<Json<InstanceBannerResponse>, ApiError> {
    let db = state.db.read().await;
    let raw = db
        .get_instance_banner_json()
        .map_err(|_| ApiError::internal())?;
    Ok(Json(decode_stored(raw)))
}

async fn put_instance_banner(
    State(state): State<AppState>,
    Extension(actor): Extension<AuthedUser>,
    Json(req): Json<PutInstanceBannerRequest>,
) -> Result<Json<InstanceBannerResponse>, ApiError> {
    ensure_admin(&actor)?;
    let message = req.message.trim().to_string();
    if message.len() > MESSAGE_MAX_LEN {
        return Err(ApiError::bad_request("message is too long"));
    }
    let background_color = validate_background_color(&req.background_color)?;
    let stored = StoredBanner {
        background_color: background_color.clone(),
        message: message.clone(),
    };
    let json = serde_json::to_string_pretty(&stored).map_err(|_| ApiError::internal())?;
    let db = state.db.read().await;
    db.set_instance_banner_json(&json)
        .map_err(|_| ApiError::internal())?;
    Ok(Json(InstanceBannerResponse {
        background_color,
        message,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_state::{AppState, AuthConfig, LoginLimiter};
    use crate::auth::Role;
    use crate::db::Db;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn tmp_db() -> (tempfile::TempDir, Db) {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("t.sqlite3");
        let db = Db::new(&path.to_string_lossy()).expect("db");
        (dir, db)
    }

    fn test_state(db: Db) -> AppState {
        AppState {
            db: Arc::new(RwLock::new(db)),
            db_path: "x".into(),
            service_gate: Arc::new(tokio::sync::RwLock::new(())),
            auth: AuthConfig::default(),
            login_limiter: Arc::new(LoginLimiter::new()),
            indexer_debounce: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
        }
    }

    fn authed(role: Role) -> AuthedUser {
        AuthedUser {
            user_id: "u1".into(),
            email: "u1@test.local".into(),
            role,
            last_login_at: None,
            session_id: "s1".into(),
        }
    }

    #[test]
    fn validate_color_hex_and_rgb() {
        assert_eq!(validate_background_color("#FFF").unwrap(), "#fff");
        assert_eq!(validate_background_color("#aabbcc").unwrap(), "#aabbcc");
        assert_eq!(validate_background_color("#aabbccdd").unwrap(), "#aabbccdd");
        assert_eq!(
            validate_background_color("rgb(1, 2, 3)").unwrap(),
            "rgb(1, 2, 3)"
        );
        assert!(validate_background_color("").is_err());
        assert!(validate_background_color("#gg").is_err());
        assert!(validate_background_color("#abcde").is_err());
        assert!(validate_background_color("rgb(1,2)").is_err());
    }

    #[tokio::test]
    async fn get_returns_defaults_when_missing() {
        let (_d, db) = tmp_db();
        let state = test_state(db);
        let res = get_instance_banner(axum::extract::State(state), Extension(authed(Role::Viewer)))
            .await
            .unwrap();
        assert_eq!(res.0.message, "");
        assert_eq!(res.0.background_color, DEFAULT_BACKGROUND);
    }

    #[tokio::test]
    async fn put_forbidden_for_non_admin() {
        let (_d, db) = tmp_db();
        let state = test_state(db);
        let err = put_instance_banner(
            axum::extract::State(state),
            Extension(authed(Role::Editor)),
            Json(PutInstanceBannerRequest {
                background_color: "#000000".into(),
                message: "hi".into(),
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(err.status, axum::http::StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn put_admin_persists_and_get_reads() {
        let (_d, db) = tmp_db();
        let db2 = db.clone();
        let state = test_state(db);
        let _ = put_instance_banner(
            axum::extract::State(state),
            Extension(authed(Role::Admin)),
            Json(PutInstanceBannerRequest {
                background_color: "rgb(10, 20, 30)".into(),
                message: "  Hello  ".into(),
            }),
        )
        .await
        .unwrap();

        let state2 = test_state(db2);
        let got = get_instance_banner(
            axum::extract::State(state2),
            Extension(authed(Role::Viewer)),
        )
        .await
        .unwrap();
        assert_eq!(got.0.message, "Hello");
        assert_eq!(got.0.background_color, "rgb(10, 20, 30)");
    }
}
