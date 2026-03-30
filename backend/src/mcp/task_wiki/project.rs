//! Project resolution and permission checks for task/wiki operations.

use anyhow::Context;

use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::db::{Db, ProjectMeta};
use crate::permissions::can_read;

/// Resolve project from project_key (e.g. "REQ") or project_id (e.g. "project-1").
pub fn resolve_project(
    state: &AppState,
    user: &AuthedUser,
    project_key: Option<&str>,
    project_id: Option<&str>,
) -> anyhow::Result<ProjectMeta> {
    let db = state.db.blocking_read();
    if let Some(key) = project_key.filter(|s| !s.trim().is_empty()) {
        let project = db
            .get_project_meta_by_key(key)
            .context("lookup project by projectKey")?
            .ok_or_else(|| anyhow::anyhow!("project not found for projectKey={key}"))?;
        ensure_can_read(&db, user, &project.id, key)?;
        return Ok(project);
    }
    if let Some(id) = project_id.filter(|s| !s.trim().is_empty()) {
        let project = db
            .get_project_meta_by_id(id)
            .context("lookup project by projectId")?
            .ok_or_else(|| anyhow::anyhow!("project not found for projectId={id}"))?;
        ensure_can_read(&db, user, &project.id, &project.project_key)?;
        return Ok(project);
    }
    anyhow::bail!("projectKey or projectId is required")
}

pub fn ensure_can_read(
    db: &Db,
    user: &AuthedUser,
    project_id: &str,
    project_key: &str,
) -> anyhow::Result<()> {
    let ok = can_read(db, project_id, Some(user)).context("check read permission")?;
    if ok {
        Ok(())
    } else {
        anyhow::bail!("insufficient permissions for project {project_key}")
    }
}
