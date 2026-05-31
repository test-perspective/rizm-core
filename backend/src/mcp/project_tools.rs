//! Project and manifest tools for MCP.

use anyhow::Context;
use chrono::Local;
use serde_json::{json, Value};

use crate::ai_common::{normalize_manifest, validate_manifest};
use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::models::ProjectManifest;
use crate::permissions::{can_read, can_write};

use super::task_wiki::resolve_project;

pub fn get_current_datetime() -> anyhow::Result<String> {
    let now = Local::now();
    Ok(json!({
        "iso8601": now.to_rfc3339(),
        "rfc2822": now.to_rfc2822(),
        "timestampMs": now.timestamp_millis()
    })
    .to_string())
}

pub fn list_projects_for_user(state: &AppState, user: &AuthedUser) -> anyhow::Result<String> {
    let db = state.db.blocking_read();
    let rows = db.list_projects_meta().context("list projects")?;
    let mut projects = Vec::new();
    for (id, name, project_key, _lifecycle, _created_at, updated_at) in rows {
        if can_read(&db, &id, Some(user)).context("check read permission")? {
            projects.push(json!({
                "id": id,
                "name": name,
                "projectKey": project_key,
                "updatedAt": updated_at
            }));
        }
    }
    Ok(json!({ "projects": projects }).to_string())
}

pub fn search_projects_for_user(
    state: &AppState,
    user: &AuthedUser,
    query: &str,
) -> anyhow::Result<String> {
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return Ok(json!({ "projects": [] }).to_string());
    }

    let db = state.db.blocking_read();
    let rows = db.list_projects_meta().context("list projects")?;
    let mut projects = Vec::new();
    for (id, name, project_key, _lifecycle, _created_at, updated_at) in rows {
        if !can_read(&db, &id, Some(user)).context("check read permission")? {
            continue;
        }
        let key = project_key.clone().unwrap_or_default();
        let haystack = format!("{name} {key}").to_lowercase();
        if haystack.contains(&query) {
            projects.push(json!({
                "id": id,
                "name": name,
                "projectKey": project_key,
                "updatedAt": updated_at
            }));
        }
    }
    Ok(json!({ "projects": projects }).to_string())
}

pub fn get_project_manifest_for_user(
    state: &AppState,
    user: &AuthedUser,
    project_key: Option<&str>,
    project_id: Option<&str>,
) -> anyhow::Result<String> {
    let project = resolve_project(state, user, project_key, project_id)?;
    let db = state.db.blocking_read();
    let (manifest, etag) = db
        .get_manifest_with_etag(&project.id)
        .context("get manifest")?
        .ok_or_else(|| anyhow::anyhow!("project not found"))?;
    Ok(json!({
        "projectId": project.id,
        "projectKey": project.project_key,
        "etag": etag,
        "manifest": manifest
    })
    .to_string())
}

pub fn apply_manifest_for_user(
    state: &AppState,
    user: &AuthedUser,
    project_key: Option<&str>,
    project_id: Option<&str>,
    manifest_value: Value,
    if_match: Option<&str>,
    dry_run: bool,
    source: Option<&str>,
    message: Option<&str>,
) -> anyhow::Result<String> {
    let project = resolve_project(state, user, project_key, project_id)?;
    let mut manifest: ProjectManifest = serde_json::from_value(manifest_value)
        .context("manifest must match ProjectManifest shape")?;
    manifest = normalize_manifest(manifest);
    validate_manifest(&manifest).map_err(|msg| anyhow::anyhow!(msg))?;

    let db = state.db.blocking_read();
    let can_ok = can_write(&db, &project.id, Some(user)).context("check write permission")?;
    if !can_ok {
        anyhow::bail!(
            "insufficient permissions for project {}",
            project.project_key
        );
    }
    let (current_manifest, current_etag) = db
        .get_manifest_with_etag(&project.id)
        .context("get current manifest")?
        .ok_or_else(|| anyhow::anyhow!("project not found"))?;

    let summary = manifest_change_summary(&current_manifest, &manifest);
    if dry_run {
        return Ok(json!({
            "dryRun": true,
            "valid": true,
            "projectId": project.id,
            "projectKey": project.project_key,
            "etag": current_etag,
            "summary": summary,
            "manifest": manifest
        })
        .to_string());
    }

    let expected = if_match
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| anyhow::anyhow!("ifMatch is required when dryRun=false"))?;
    let new_etag = db
        .put_manifest_if_match(
            &project.id,
            expected.trim_matches('"'),
            manifest,
            Some(source.unwrap_or("mcp_apply_manifest")),
            message,
            Some(&user.user_id),
        )
        .map_err(|e| match e {
            crate::db::ManifestWriteError::NotFound => anyhow::anyhow!("project not found"),
            crate::db::ManifestWriteError::Conflict { current_etag } => {
                anyhow::anyhow!("conflict (current etag = {current_etag})")
            }
        })?;

    Ok(json!({
        "dryRun": false,
        "projectId": project.id,
        "projectKey": project.project_key,
        "etag": new_etag,
        "summary": summary
    })
    .to_string())
}

fn manifest_change_summary(current: &ProjectManifest, next: &ProjectManifest) -> Value {
    json!({
        "nameChanged": current.name != next.name,
        "fromName": current.name,
        "toName": next.name,
        "entityCount": {
            "from": current.entities.len(),
            "to": next.entities.len()
        },
        "viewCount": {
            "from": current.views.len(),
            "to": next.views.len()
        },
        "defaultViewChanged": current.default_view != next.default_view
    })
}
