use axum::{extract::State, Extension, Json};
use chrono::NaiveTime;
use serde::{Deserialize, Serialize};

use crate::admin::support::ensure_admin;
use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::db::Db;
use crate::ApiError;

use super::{DbBackupSettingsDto, SETTINGS_VERSION};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DbBackupSettingsEnvelope {
    pub settings: DbBackupSettingsDto,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PutDbBackupSettingsRequest {
    pub settings: DbBackupSettingsDto,
}

pub(super) fn parse_hh_mm(s: &str) -> Result<NaiveTime, ApiError> {
    let t = s.trim();
    let parts: Vec<&str> = t.split(':').collect();
    if parts.len() != 2 {
        return Err(ApiError::bad_request("scheduledTime must be HH:MM"));
    }
    let h: u32 = parts[0]
        .parse()
        .map_err(|_| ApiError::bad_request("scheduledTime must be HH:MM"))?;
    let m: u32 = parts[1]
        .parse()
        .map_err(|_| ApiError::bad_request("scheduledTime must be HH:MM"))?;
    NaiveTime::from_hms_opt(h, m, 0)
        .ok_or_else(|| ApiError::bad_request("scheduledTime must be HH:MM"))
}

fn validate_settings(s: &DbBackupSettingsDto) -> Result<DbBackupSettingsDto, ApiError> {
    let scheduled_time = parse_hh_mm(&s.scheduled_time)?;
    if s.retention_days < 1 || s.retention_days > 3650 {
        return Err(ApiError::bad_request(
            "retentionDays must be between 1 and 3650",
        ));
    }
    Ok(DbBackupSettingsDto {
        enabled: s.enabled,
        scheduled_time: scheduled_time.format("%H:%M").to_string(),
        retention_days: s.retention_days,
        last_run_day: s.last_run_day.clone(),
    })
}

pub(super) fn load_settings_db(db: &Db) -> anyhow::Result<DbBackupSettingsDto> {
    let raw = db.get_db_backup_settings_json()?;
    let Some(raw) = raw else {
        return Ok(DbBackupSettingsDto::default());
    };
    let mut v: serde_json::Value = serde_json::from_str(&raw)?;
    if let Some(inner) = v.get_mut("settings") {
        Ok(serde_json::from_value(inner.clone())?)
    } else {
        Ok(serde_json::from_value(v)?)
    }
}

fn load_settings(db: &Db) -> Result<DbBackupSettingsDto, ApiError> {
    load_settings_db(db).map_err(|_| ApiError::internal())
}

pub(super) fn save_settings_db(db: &Db, s: &DbBackupSettingsDto) -> anyhow::Result<()> {
    let envelope = serde_json::json!({
        "version": SETTINGS_VERSION,
        "settings": s,
    });
    let json = serde_json::to_string(&envelope)?;
    db.set_db_backup_settings_json(&json)?;
    Ok(())
}

fn save_settings(db: &Db, s: &DbBackupSettingsDto) -> Result<(), ApiError> {
    save_settings_db(db, s).map_err(|_| ApiError::internal())
}

pub(super) async fn get_settings(
    State(state): State<AppState>,
    Extension(actor): Extension<AuthedUser>,
) -> Result<Json<DbBackupSettingsEnvelope>, ApiError> {
    ensure_admin(&actor)?;
    let db = state.db.read().await;
    let settings = load_settings(&db)?;
    Ok(Json(DbBackupSettingsEnvelope { settings }))
}

pub(super) async fn put_settings(
    State(state): State<AppState>,
    Extension(actor): Extension<AuthedUser>,
    Json(req): Json<PutDbBackupSettingsRequest>,
) -> Result<Json<DbBackupSettingsEnvelope>, ApiError> {
    ensure_admin(&actor)?;
    let normalized = validate_settings(&req.settings)?;
    let db = state.db.read().await;
    save_settings(&db, &normalized)?;
    Ok(Json(DbBackupSettingsEnvelope {
        settings: normalized,
    }))
}
