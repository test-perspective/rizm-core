//! Derived relation views and manifest backfill for task links.

use anyhow::Context;
use serde_json::{json, Value};

use crate::app_state::AppState;
use crate::models::{Entity, ProjectManifest, PropertyDefinition, PropertyType};

use super::task_relations::{
    blocked_by_of, parent_of, project_tasks, task_by_key, task_key_of, BLOCKED_BY_PROP, PARENT_PROP,
};

/// Status options are ordered from open to closed on boards, so the last one is
/// treated as the completed status for readiness. Projects whose manifest has no
/// options still fall back to the built-in "Done".
pub fn done_status_from_manifest(manifest: Option<&ProjectManifest>) -> Option<String> {
    manifest?
        .entities
        .iter()
        .find(|e| e.id == "task")?
        .properties
        .iter()
        .find(|p| p.name == "status")?
        .options
        .as_ref()?
        .iter()
        .map(|s| s.trim())
        .rfind(|s| !s.is_empty())
        .map(str::to_string)
}

fn is_done(entity: &Entity, done_status: Option<&str>) -> bool {
    let Some(status) = entity.properties.get("status").and_then(Value::as_str) else {
        return false;
    };
    let status = status.trim();
    status.eq_ignore_ascii_case("done")
        || done_status.is_some_and(|done| status.eq_ignore_ascii_case(done))
}

#[derive(Debug)]
pub struct DerivedRelations {
    pub blocks: Vec<String>,
    pub children: Vec<String>,
    pub blocked_by_open: Vec<String>,
    pub ready: bool,
}

impl DerivedRelations {
    pub fn to_json(&self) -> Value {
        json!({
            "blocks": self.blocks,
            "children": self.children,
            "blockedByOpen": self.blocked_by_open,
            "ready": self.ready,
        })
    }
}

pub fn derive_relations(
    task_key: &str,
    entities: &[Entity],
    done_status: Option<&str>,
) -> DerivedRelations {
    let tasks = project_tasks(entities);
    let blocked_by = task_by_key(&tasks, task_key)
        .map(blocked_by_of)
        .unwrap_or_default();

    let mut blocks = Vec::new();
    let mut children = Vec::new();
    for task in &tasks {
        let Some(key) = task_key_of(task) else {
            continue;
        };
        if key == task_key {
            continue;
        }
        if blocked_by_of(task).iter().any(|k| k == task_key) {
            blocks.push(key.to_string());
        }
        if parent_of(task).as_deref() == Some(task_key) {
            children.push(key.to_string());
        }
    }
    blocks.sort();
    children.sort();

    let mut blocked_by_open = Vec::new();
    for blocker in &blocked_by {
        let done = task_by_key(&tasks, blocker)
            .map(|t| is_done(t, done_status))
            .unwrap_or(false);
        if !done {
            blocked_by_open.push(blocker.clone());
        }
    }

    DerivedRelations {
        ready: blocked_by_open.is_empty(),
        blocks,
        children,
        blocked_by_open,
    }
}

pub fn planned_block_patches(
    self_key: &str,
    block_targets: &[String],
    entities: &[Entity],
) -> Vec<(String, Vec<String>)> {
    let tasks = project_tasks(entities);
    let mut out = Vec::new();
    for target in block_targets {
        let Some(entity) = task_by_key(&tasks, target) else {
            continue;
        };
        let mut next = blocked_by_of(entity);
        if next.iter().any(|key| key == self_key) {
            continue;
        }
        next.push(self_key.to_string());
        out.push((entity.id.clone(), next));
    }
    out
}

pub fn ensure_manifest_link_properties(
    state: &AppState,
    project_id: &str,
    actor_user_id: &str,
) -> anyhow::Result<()> {
    for attempt in 0..2 {
        let db = state.db.blocking_read();
        let Some((mut manifest, etag)) = db
            .get_manifest_with_etag(project_id)
            .context("get manifest")?
        else {
            return Ok(());
        };
        if !add_missing_link_properties(&mut manifest) {
            return Ok(());
        }
        match db.put_manifest_if_match(
            project_id,
            &etag,
            manifest,
            Some("silent"),
            None,
            Some(actor_user_id),
        ) {
            Ok(_) => return Ok(()),
            Err(crate::db::ManifestWriteError::Conflict { .. }) if attempt == 0 => continue,
            Err(crate::db::ManifestWriteError::Conflict { current_etag }) => {
                anyhow::bail!(
                    "conflict while updating manifest for task relations (etag={current_etag})"
                )
            }
            Err(crate::db::ManifestWriteError::NotFound) => anyhow::bail!("project not found"),
        }
    }
    anyhow::bail!("failed to update manifest for task relations")
}

fn add_missing_link_properties(manifest: &mut ProjectManifest) -> bool {
    let Some(task) = manifest.entities.iter_mut().find(|e| e.id == "task") else {
        return false;
    };
    let mut changed = false;
    for name in [PARENT_PROP, BLOCKED_BY_PROP] {
        if task.properties.iter().any(|p| p.name == name) {
            continue;
        }
        task.properties.push(PropertyDefinition {
            name: name.to_string(),
            type_: PropertyType::Link,
            options: None,
            visible: Some(true),
        });
        changed = true;
    }
    changed
}
