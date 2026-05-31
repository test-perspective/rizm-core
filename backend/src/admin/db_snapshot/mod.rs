//! SQLite DB snapshots: scheduled backup, listing, restore (REQ-238).
//!
//! Split across submodules:
//!   - `settings`  : admin-configurable backup settings + handlers
//!   - `snapshots` : snapshot file ops (create, list, prune) + handlers
//!   - `restore`   : restore handler + live DB swap helpers

use axum::{
    routing::{get, post},
    Router,
};
use chrono::{Local, Timelike};
use serde::{Deserialize, Serialize};

use crate::app_state::AppState;

mod restore;
mod settings;
mod snapshots;

use settings::{load_settings_db, parse_hh_mm, save_settings_db};
use snapshots::{create_snapshot_file, prune_snapshots};

const SETTINGS_VERSION: i32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbBackupSettingsDto {
    pub enabled: bool,
    /// Local time `HH:MM` (24h).
    pub scheduled_time: String,
    pub retention_days: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_run_day: Option<String>,
}

impl Default for DbBackupSettingsDto {
    fn default() -> Self {
        Self {
            enabled: false,
            scheduled_time: "02:30".to_string(),
            retention_days: 7,
            last_run_day: None,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbSnapshotInfoDto {
    pub file_name: String,
    pub created_at_ms: i64,
    pub size_bytes: u64,
    pub kind: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/admin/db-backup/settings",
            get(settings::get_settings).put(settings::put_settings),
        )
        .route(
            "/api/admin/db-backup/snapshots",
            get(snapshots::list_snapshots).post(snapshots::create_snapshot),
        )
        .route(
            "/api/admin/db-backup/restore",
            post(restore::restore_snapshot),
        )
}

pub async fn maybe_run_scheduled_backup(state: &AppState) {
    let _gate = state.service_gate.read().await;
    let settings = {
        let db = state.db.read().await;
        match load_settings_db(&db) {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!(error = %e, "db backup: load settings failed");
                return;
            }
        }
    };
    if !settings.enabled {
        return;
    }
    let Ok(target_t) = parse_hh_mm(&settings.scheduled_time) else {
        return;
    };
    let now = Local::now();
    let today = now.date_naive();
    let day_key = today.format("%Y-%m-%d").to_string();
    if settings.last_run_day.as_deref() == Some(day_key.as_str()) {
        return;
    }

    let cur = now.time();
    if cur.hour() != target_t.hour() || cur.minute() != target_t.minute() {
        return;
    }

    let snapshot_result = {
        let db = state.db.read().await;
        create_snapshot_file(&state.db_path, &db, "auto")
    };
    match snapshot_result {
        Ok(_) => {
            if let Err(e) = prune_snapshots(&state.db_path, settings.retention_days) {
                tracing::warn!(error = %e, "db backup: prune failed");
            }
            let mut next = settings;
            next.last_run_day = Some(day_key);
            let db = state.db.read().await;
            if let Err(e) = save_settings_db(&db, &next) {
                tracing::warn!(error = %e, "db backup: save lastRunDay failed");
            }
            tracing::info!("db backup: automatic snapshot completed");
        }
        Err(e) => {
            tracing::warn!(error = %e, "db backup: automatic snapshot failed");
        }
    }
}
