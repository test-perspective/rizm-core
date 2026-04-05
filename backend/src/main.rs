use keel_backend::{ApiError, *};

use std::collections::HashMap;
use std::net::SocketAddr;

use axum::{
    extract::{Path, State},
    http::{header, HeaderValue, Method, StatusCode},
    response::IntoResponse,
    routing::get,
    middleware,
    Json, Router,
};
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

use crate::db::Db;
use crate::models::{Project, ProjectConfig, StorageData};
use crate::app_state::{AppState, AuthConfig, LoginLimiter};
use axum::Extension;
use std::sync::Arc;
use tokio::sync::Mutex;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Default to info logs in dev unless explicitly overridden by RUST_LOG.
    // (If RUST_LOG is unset, EnvFilter::from_default_env can be too quiet and hide AIT progress logs.)
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .init();

    let db_path = std::env::var("KEEL_DB_PATH").unwrap_or_else(|_| "./data/keel.sqlite3".to_string());
    let bind = std::env::var("KEEL_BIND").unwrap_or_else(|_| "127.0.0.1:48888".to_string());

    let cookie_secure = std::env::var("KEEL_COOKIE_SECURE")
        .ok()
        .and_then(|v| v.parse::<bool>().ok())
        .unwrap_or(true);
    let csrf_allowed_origin = std::env::var("KEEL_CSRF_ALLOWED_ORIGIN").ok().filter(|s| !s.trim().is_empty());
    let dev_admin_login_enabled = std::env::var("KEEL_DEV_ADMIN_LOGIN")
        .ok()
        .and_then(|v| {
            let normalized = v.trim().to_lowercase();
            Some(normalized == "true" || normalized == "1" || normalized == "yes" || normalized == "on")
        })
        .unwrap_or(false);

    let db = Db::new(&db_path)?;

    // Optional bootstrap admin (only if no admin exists yet).
    bootstrap_admin_if_needed(&db)?;

    let mut auth_cfg = AuthConfig::default();
    auth_cfg.cookie_secure = cookie_secure;
    auth_cfg.csrf_allowed_origin = csrf_allowed_origin;
    auth_cfg.dev_admin_login_enabled = dev_admin_login_enabled;

    let state = AppState {
        db: Arc::new(tokio::sync::RwLock::new(db)),
        db_path: db_path.clone(),
        service_gate: Arc::new(tokio::sync::RwLock::new(())),
        auth: auth_cfg,
        login_limiter: Arc::new(LoginLimiter::new()),
        indexer_debounce: Arc::new(Mutex::new(HashMap::new())),
    };

    let backup_state = state.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
        loop {
            interval.tick().await;
            crate::admin::db_snapshot::maybe_run_scheduled_backup(&backup_state).await;
        }
    });

    let public = Router::new()
        .route("/health", get(health))
        .route("/status", get(health))
        .merge(crate::mcp_http::router())
        .merge(crate::auth::router())
        .merge(crate::api::scm_api::public_bitbucket_oauth_router())
        .with_state(state.clone());

    let protected = Router::new()
        .route("/state", get(get_state).put(put_state))
        .route("/projection/:view_id", get(get_projection))
        .merge(crate::auth::protected_router())
        .merge(crate::admin::router())
        .merge(crate::manifest_history::router())
        .merge(crate::api::ai_tools_api::router())
        .merge(crate::api::projects_api::router())
        .merge(crate::api::wiki_api::router())
        .merge(crate::api::entities_api::router())
        .merge(crate::api::attachments_api::router())
        .merge(crate::api::manifest_api::router())
        .merge(crate::api::tasks_api::router())
        .merge(crate::api::permissions_api::router())
        .merge(crate::api::search_api::router())
        .merge(crate::api::scm_api::router())
        .merge(crate::api::import_api::router())
        .merge(crate::api::me_api::router())
        .merge(crate::api::instance_banner_api::router())
        .merge(crate::api::instance_banner_api::admin_router())
        .merge(crate::api::dashboard_api::router())
        .merge(crate::api::users_api::router())
        .with_state(state.clone())
        .layer(middleware::from_fn_with_state(state.clone(), crate::auth::csrf_middleware))
        .layer(middleware::from_fn_with_state(state.clone(), crate::auth::session_middleware));

    let mut app = Router::new().merge(public).merge(protected).with_state(state.clone());

    // CORS is only needed for dev (different origin). For cookie auth, credentials require a fixed origin.
    // KEEL_CORS_ORIGIN can be a single origin or comma-separated (e.g. "http://localhost:5173,http://127.0.0.1:5173").
    if let Ok(origin_var) = std::env::var("KEEL_CORS_ORIGIN") {
        let mut origins: Vec<HeaderValue> = origin_var
            .split(',')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .filter_map(|s| s.parse::<HeaderValue>().ok())
            .collect();
        // Dev convenience: if one loopback origin is set, allow the other so both localhost and 127.0.0.1 work.
        let mut existing: std::collections::HashSet<String> = origins
            .iter()
            .filter_map(|o| o.to_str().ok().map(|s| s.to_string()))
            .collect();
        let origin_snapshot = origins.clone();
        for o in &origin_snapshot {
            if let Ok(s) = o.to_str() {
                let other = if s.starts_with("http://localhost:") {
                    s.replace("http://localhost:", "http://127.0.0.1:")
                } else if s.starts_with("http://127.0.0.1:") {
                    s.replace("http://127.0.0.1:", "http://localhost:")
                } else {
                    continue;
                };
                if !existing.contains(&other) {
                    if let Ok(hv) = other.parse::<HeaderValue>() {
                        origins.push(hv);
                        existing.insert(other);
                    }
                }
            }
        }
        if !origins.is_empty() {
            let cors = CorsLayer::new()
                .allow_origin(origins)
                .allow_credentials(true)
                // With credentials, headers cannot be wildcard (*).
                .allow_methods([Method::GET, Method::POST, Method::PUT, Method::PATCH, Method::DELETE, Method::OPTIONS])
                // If-Match is required for optimistic locking (ETag).
                .allow_headers([header::CONTENT_TYPE, header::ACCEPT, header::IF_MATCH])
                // Let the browser read ETag from responses.
                .expose_headers([header::ETAG]);
            app = app.layer(cors);
        }
    }

    app = app
        .layer(middleware::from_fn_with_state(state.clone(), crate::service_gate::middleware))
        .layer(middleware::from_fn(log_500_errors))
        .layer(TraceLayer::new_for_http());

    let addr: SocketAddr = bind.parse()?;
    tracing::info!(%addr, db_path = %db_path, "keel-backend listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await?;
    Ok(())
}

async fn health() -> impl IntoResponse {
    StatusCode::OK
}

async fn log_500_errors(
    request: axum::extract::Request,
    next: middleware::Next,
) -> axum::response::Response {
    let method = request.method().clone();
    let uri = request.uri().clone();
    let response = next.run(request).await;
    if response.status() == StatusCode::INTERNAL_SERVER_ERROR {
        tracing::error!(method = %method, uri = %uri, "500 Internal Server Error");
    }
    response
}

async fn get_state(State(state): State<AppState>) -> Result<Json<StorageData>, ApiError> {
    let db = state.db.read().await;
    let data = db.get_state()?;
    let active_entities = data
        .projects
        .iter()
        .find(|p| p.id == data.active_project_id)
        .map(|p| p.entities.len())
        .unwrap_or(0);
    tracing::info!(
        version = data.version,
        projects = data.projects.len(),
        active_project_id = %data.active_project_id,
        active_entities = active_entities,
        "GET /state"
    );
    Ok(Json(data))
}

async fn put_state(State(state): State<AppState>, Json(mut data): Json<StorageData>) -> Result<StatusCode, ApiError> {
    let db = state.db.read().await;
    if data.version == 0 {
        data.version = crate::time::now_ms();
    }
    if data.projects.is_empty() {
        let now = crate::time::now_ms();
        data.projects.push(Project {
            id: "default".to_string(),
            name: "Default".to_string(),
            project_key: Some("DEF".to_string()),
            lifecycle_status: Some("ready".to_string()),
            created_at: now,
            updated_at: now,
            entities: vec![],
            config: ProjectConfig { manifest: crate::defaults::default_manifest() },
        });
    }
    if data.active_project_id.trim().is_empty() || !data.projects.iter().any(|p| p.id == data.active_project_id) {
        data.active_project_id = data.projects[0].id.clone();
    }
    db.replace_state(data)?;
    // PUT /state is called very frequently (e.g. on each keypress in the UI),
    // so keep it at debug to avoid spamming the dev console.
    tracing::debug!("PUT /state -> 204");
    Ok(StatusCode::NO_CONTENT)
}

async fn get_projection(
    State(state): State<AppState>,
    Path(view_id): Path<String>,
    Extension(user): Extension<crate::auth::AuthedUser>,
) -> Result<Json<crate::projection::ProjectionResponse>, ApiError> {
    let db = state.db.read().await;
    let data = db.get_state()?;
    let project = data
        .projects
        .iter()
        .find(|p| p.id == data.active_project_id)
        .unwrap_or_else(|| &data.projects[0]);
    
    // Check read permission for the view
    if !crate::permissions::can_read(&db, &project.id, Some(&user)).map_err(|_| ApiError::internal())? {
        return Err(ApiError::forbidden("insufficient permissions"));
    }
    
    let projection = crate::projection::project(&project.config.manifest, &project.entities, &view_id)
        .ok_or_else(|| ApiError::not_found("view not found"))?;
    tracing::info!(view_id = %view_id, "GET /projection/:view_id");
    Ok(Json(projection))
}

// ApiError is now in lib.rs

fn bootstrap_admin_if_needed(db: &Db) -> anyhow::Result<()> {
    let admin_count = db.count_admin_users()?;
    if admin_count > 0 {
        return Ok(());
    }

    let email = std::env::var("KEEL_BOOTSTRAP_ADMIN_EMAIL").ok().filter(|s| !s.trim().is_empty());
    let password = std::env::var("KEEL_BOOTSTRAP_ADMIN_PASSWORD").ok().filter(|s| !s.trim().is_empty());

    let (email, password) = match (email, password) {
        (Some(e), Some(p)) => (e.trim().to_lowercase(), p),
        _ => {
            tracing::warn!(
                "no admin users exist yet; set KEEL_BOOTSTRAP_ADMIN_EMAIL and KEEL_BOOTSTRAP_ADMIN_PASSWORD to bootstrap an initial admin"
            );
            return Ok(());
        }
    };

    if password.trim().len() < 12 {
        tracing::warn!("bootstrap admin password is too short (need >= 12); skipping bootstrap");
        return Ok(());
    }

    let password_hash = crate::auth::hash_password_for_bootstrap(&password);
    match db.create_local_user(&email, "admin", &password_hash) {
        Ok(u) => {
            tracing::info!(email = %u.email, user_id = %u.id, "bootstrapped initial admin user");
        }
        Err(err) => {
            tracing::warn!(error = %err, "failed to bootstrap admin (maybe already exists)");
        }
    }
    Ok(())
}
