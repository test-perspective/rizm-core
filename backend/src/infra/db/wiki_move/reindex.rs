//! Transactional wiki sibling reindex helpers used during a subtree move.

use anyhow::Context;
use rusqlite::params;
use serde_json::Map;
use std::collections::HashSet;

use super::helpers::{parent_id_from_props, wiki_sort_key};
use super::{ORDER_GAP, WIKI_ENTITY};
use crate::models::Entity;

/// Reindex `__keelOrder` for wiki pages with parent `parent_key` (None = root), excluding `exclude_ids`.
pub(super) fn reindex_siblings_under_parent(
    tx: &rusqlite::Transaction<'_>,
    project_id: &str,
    parent_key: Option<&str>,
    exclude_ids: &HashSet<String>,
    now: i64,
) -> anyhow::Result<Vec<String>> {
    let mut stmt = tx
        .prepare(
            "SELECT id, entity_id, created_at, updated_at, properties_json FROM entities
             WHERE project_id = ?1 AND entity_id = ?2",
        )
        .context("prepare list wiki for reindex")?;
    let rows = stmt
        .query_map(params![project_id, WIKI_ENTITY], |row| {
            let id: String = row.get(0)?;
            let entity_id: String = row.get(1)?;
            let created_at: i64 = row.get(2)?;
            let updated_at: i64 = row.get(3)?;
            let props_json: String = row.get(4)?;
            Ok((id, entity_id, created_at, updated_at, props_json))
        })
        .context("query wiki entities")?;

    let mut siblings: Vec<Entity> = Vec::new();
    for row in rows {
        let (id, entity_id, created_at, updated_at, props_json) = row?;
        let props: Map<String, serde_json::Value> =
            serde_json::from_str(&props_json).context("deserialize props")?;
        let pid = parent_id_from_props(&props);
        let matches_parent = match (parent_key, pid.as_deref()) {
            (None, None) => true,
            (Some(p), Some(cp)) => p == cp,
            _ => false,
        };
        if !matches_parent {
            continue;
        }
        if exclude_ids.contains(&id) {
            continue;
        }
        siblings.push(Entity {
            id,
            entity_id,
            created_at,
            updated_at,
            properties: props,
        });
    }
    drop(stmt);

    siblings.sort_by(|a, b| wiki_sort_key(a).cmp(&wiki_sort_key(b)));

    let mut updated_ids = Vec::new();
    for (i, e) in siblings.iter().enumerate() {
        let new_order = (i as f64) * ORDER_GAP;
        let current = e
            .properties
            .get("__keelOrder")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        if (current - new_order).abs() < 1e-6 {
            continue;
        }
        let mut props = e.properties.clone();
        props.insert(
            "__keelOrder".to_string(),
            serde_json::Value::Number(
                serde_json::Number::from_f64(new_order).unwrap_or_else(|| serde_json::Number::from(0)),
            ),
        );
        let json = serde_json::to_string(&props).context("serialize props")?;
        tx.execute(
            "UPDATE entities SET updated_at = ?1, properties_json = ?2 WHERE project_id = ?3 AND id = ?4",
            params![now, json, project_id, e.id],
        )
        .context("update sibling order")?;
        updated_ids.push(e.id.clone());
    }
    Ok(updated_ids)
}

pub(super) fn apply_sibling_order(
    tx: &rusqlite::Transaction<'_>,
    project_id: &str,
    ordered_ids: &[String],
    now: i64,
    updated_by: &str,
) -> anyhow::Result<()> {
    use rusqlite::OptionalExtension;

    for (i, id) in ordered_ids.iter().enumerate() {
        let row: Option<String> = tx
            .query_row(
                "SELECT properties_json FROM entities WHERE project_id = ?1 AND id = ?2",
                params![project_id, id],
                |r| r.get(0),
            )
            .optional()
            .context("select entity for order")?;
        let Some(props_json) = row else {
            anyhow::bail!("entity missing during reorder");
        };
        let mut props: Map<String, serde_json::Value> =
            serde_json::from_str(&props_json).context("deserialize")?;
        let new_order = (i as f64) * ORDER_GAP;
        props.insert(
            "__keelOrder".to_string(),
            serde_json::Value::Number(
                serde_json::Number::from_f64(new_order).unwrap_or_else(|| serde_json::Number::from(0)),
            ),
        );
        props.insert(
            "updatedBy".to_string(),
            serde_json::Value::String(updated_by.to_string()),
        );
        let json = serde_json::to_string(&props).context("serialize")?;
        tx.execute(
            "UPDATE entities SET updated_at = ?1, properties_json = ?2 WHERE project_id = ?3 AND id = ?4",
            params![now, json, project_id, id],
        )
        .context("apply order")?;
    }
    Ok(())
}
