use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::{oneshot, Mutex};

use crate::db::Db;

#[derive(Clone)]
pub struct AppState {
    /// Prefer `read().await` / `write().await` from `async` Axum handlers.
    ///
    /// `blocking_read` / `blocking_write` must run only on threads that are **not** Tokio
    /// cooperative workers (e.g. inside `tokio::task::spawn_blocking`, or from sync `#[test]`).
    /// Calling them from an `async` task thread panics ("Cannot block the current thread from within a runtime").
    pub db: Arc<tokio::sync::RwLock<Db>>,
    pub db_path: String,
    /// Readers: HTTP (except health/status/restore), indexer, scheduled backup.
    /// Writer: DB restore — blocks new readers until the file swap completes.
    pub service_gate: Arc<tokio::sync::RwLock<()>>,
    pub auth: AuthConfig,
    pub login_limiter: Arc<LoginLimiter>,
    pub indexer_debounce: Arc<Mutex<HashMap<String, oneshot::Sender<()>>>>,
}

#[derive(Clone, Debug)]
pub struct AuthConfig {
    pub cookie_name: String,
    pub session_ttl_ms: i64,
    pub cookie_secure: bool,
    pub csrf_allowed_origin: Option<String>,
    pub dev_admin_login_enabled: bool,
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            cookie_name: "keel_session".to_string(),
            session_ttl_ms: 24 * 60 * 60 * 1000,
            cookie_secure: true,
            csrf_allowed_origin: None,
            dev_admin_login_enabled: false,
        }
    }
}

#[derive(Debug, Default)]
pub struct LoginLimiter {
    // key -> failure timestamps (ms)
    failures: Mutex<HashMap<String, Vec<i64>>>,
}

impl LoginLimiter {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn register_failure(&self, key: &str, now_ms: i64) {
        let mut map = self.failures.lock().await;
        let v = map.entry(key.to_string()).or_default();
        v.push(now_ms);
    }

    pub async fn clear(&self, key: &str) {
        let mut map = self.failures.lock().await;
        map.remove(key);
    }

    /// Returns (allowed, backoff_ms).
    pub async fn can_attempt(
        &self,
        key: &str,
        now_ms: i64,
        window_ms: i64,
        max_attempts: usize,
    ) -> (bool, i64) {
        let mut map = self.failures.lock().await;
        let v = map.entry(key.to_string()).or_default();
        v.retain(|t| now_ms.saturating_sub(*t) <= window_ms);

        let failures = v.len();
        if failures < max_attempts {
            return (true, 0);
        }

        // Exponential-ish backoff based on how far over the limit we are.
        // failures=max_attempts -> 1s, then 2s, 4s, 8s ... capped.
        let over = failures.saturating_sub(max_attempts);
        let backoff = (1_i64 << (over.min(10) as u32)) * 1000;
        let backoff = backoff.min(60_000);
        (false, backoff)
    }
}
