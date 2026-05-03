//! Wiki page subtree move (same or cross project): entities, collab state, attachment files, URL rewrites.
//!
//! Structure:
//!   - `helpers`     : pure utilities (parent lookup, sort keys, URL rewrite, subtree collection)
//!   - `reindex`     : transactional reindexing / sibling order application
//!   - `attachments` : cross-project attachment file copy/delete
//!
//! The public entry point is `Db::move_wiki_page_subtree`, defined here.

use anyhow::Context;
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use serde_json::Map;
use std::collections::{HashMap, HashSet};

use super::Db;
use crate::models::Entity;

mod attachments;
mod helpers;
mod reindex;

pub(super) const WIKI_ENTITY: &str = "wikiPage";
pub(super) const ORDER_GAP: f64 = 1000.0;

use attachments::{copy_attachment_files_for_wiki_subtree, delete_attachment_files_for_project};
use helpers::{
    collect_subtree_ids, insert_root_into_sibling_order, parent_id_from_props,
    rewrite_project_in_attachment_urls, wiki_sort_key,
};
use reindex::{apply_sibling_order, reindex_siblings_under_parent};

#[derive(Debug)]
pub struct MoveWikiPageOutcome {
    pub source_project_id: String,
    pub dest_project_id: String,
    pub moved_page_ids: Vec<String>,
    /// Search indexer: delete these (project_id, entity_pk) first when cross-project.
    pub index_deletes: Vec<(String, String)>,
    /// Search indexer: upsert (project_id, entity).
    pub index_upserts: Vec<(String, Entity)>,
}

impl Db {
    /// Move a wiki page and its descendants. Updates orders under source and dest parents.
    pub fn move_wiki_page_subtree(
        &self,
        db_path: &str,
        source_project_id: &str,
        page_id: &str,
        dest_project_id: &str,
        dest_parent_id: Option<&str>,
        before_page_id: Option<&str>,
        updated_by: &str,
    ) -> anyhow::Result<MoveWikiPageOutcome> {
        let mut conn = self.pool.get().context("get sqlite conn")?;
        let source_entities = Db::list_entities_for_project_conn(&mut conn, source_project_id)
            .context("list source entities")?;
        let wiki_source: Vec<Entity> = source_entities
            .into_iter()
            .filter(|e| e.entity_id == WIKI_ENTITY)
            .collect();
        let wiki_by_id_source: HashMap<String, Entity> =
            wiki_source.iter().map(|e| (e.id.clone(), e.clone())).collect();

        let dest_entities = if dest_project_id == source_project_id {
            vec![]
        } else {
            Db::list_entities_for_project_conn(&mut conn, dest_project_id)
                .context("list dest entities")?
        };
        let wiki_dest: Vec<Entity> = dest_entities
            .into_iter()
            .filter(|e| e.entity_id == WIKI_ENTITY)
            .collect();

        let wiki_by_id_dest: HashMap<String, Entity> =
            wiki_dest.iter().map(|e| (e.id.clone(), e.clone())).collect();

        let subtree_ids = collect_subtree_ids(page_id, &wiki_by_id_source)?;
        let subtree_set: HashSet<String> = subtree_ids.iter().cloned().collect();

        if let Some(pp) = dest_parent_id {
            if subtree_set.contains(pp) {
                anyhow::bail!("cannot move under own descendant");
            }
            let parent = if dest_project_id == source_project_id {
                wiki_by_id_source.get(pp)
            } else {
                wiki_by_id_dest.get(pp)
            };
            let Some(parent_ent) = parent else {
                anyhow::bail!("destination parent not found");
            };
            if parent_ent.entity_id != WIKI_ENTITY {
                anyhow::bail!("destination parent is not a wiki page");
            }
        }

        if let Some(before) = before_page_id {
            let before_ent = if dest_project_id == source_project_id {
                wiki_by_id_source.get(before)
            } else {
                wiki_by_id_dest.get(before)
            };
            let Some(b) = before_ent else {
                anyhow::bail!("beforePage not found");
            };
            let bp = parent_id_from_props(&b.properties);
            let dest_p = dest_parent_id.map(|s| s.to_string());
            if bp != dest_p {
                anyhow::bail!("beforePage is not a sibling under destination parent");
            }
            if subtree_set.contains(before) {
                anyhow::bail!("invalid beforePage");
            }
        }

        // Pre-copy attachment files before DB transaction (cross-project only).
        copy_attachment_files_for_wiki_subtree(
            db_path,
            source_project_id,
            dest_project_id,
            &wiki_by_id_source,
            &subtree_ids,
        )?;

        let now = crate::time::now_ms();
        let cross_project = dest_project_id != source_project_id;

        let mut index_deletes: Vec<(String, String)> = vec![];
        if cross_project {
            for id in &subtree_ids {
                index_deletes.push((source_project_id.to_string(), id.clone()));
            }
        }

        let old_root_parent = parent_id_from_props(
            &wiki_by_id_source
                .get(page_id)
                .context("root missing")?
                .properties,
        );

        // --- Build ordered sibling list at destination (excluding subtree), then insert root ---
        let mut dest_sibling_candidates: Vec<Entity> = if dest_project_id == source_project_id {
            wiki_source
                .iter()
                .filter(|e| {
                    let p = parent_id_from_props(&e.properties);
                    let matches = match (dest_parent_id, p.as_deref()) {
                        (None, None) => true,
                        (Some(dp), Some(cp)) => dp == cp,
                        _ => false,
                    };
                    matches && !subtree_set.contains(&e.id)
                })
                .cloned()
                .collect()
        } else {
            wiki_dest
                .iter()
                .filter(|e| {
                    let p = parent_id_from_props(&e.properties);
                    let matches = match (dest_parent_id, p.as_deref()) {
                        (None, None) => true,
                        (Some(dp), Some(cp)) => dp == cp,
                        _ => false,
                    };
                    matches && !subtree_set.contains(&e.id)
                })
                .cloned()
                .collect()
        };
        dest_sibling_candidates.sort_by(|a, b| wiki_sort_key(a).cmp(&wiki_sort_key(b)));
        let mut dest_order_ids: Vec<String> =
            dest_sibling_candidates.iter().map(|e| e.id.clone()).collect();
        dest_order_ids = insert_root_into_sibling_order(dest_order_ids, page_id, before_page_id);

        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .context("begin tx")?;

        // 1) Reindex siblings under the old parent (excluding the whole subtree).
        let source_exclude: HashSet<String> = subtree_set.clone();
        if let Some(op) = old_root_parent.as_deref() {
            let _ = reindex_siblings_under_parent(
                &tx,
                source_project_id,
                Some(op),
                &source_exclude,
                now,
            )?;
        } else {
            let _ = reindex_siblings_under_parent(&tx, source_project_id, None, &source_exclude, now)?;
        }

        // 2) Cross-project: move subtree rows + collab to destination (with URL rewrites).
        if cross_project {
            for id in &subtree_ids {
                let (proj_row, props_json): (String, String) = tx
                    .query_row(
                        "SELECT project_id, properties_json FROM entities WHERE id = ?1",
                        params![id],
                        |r| Ok((r.get(0)?, r.get(1)?)),
                    )
                    .optional()
                    .context("select entity for cross move")?
                    .ok_or_else(|| anyhow::anyhow!("entity row missing"))?;
                if proj_row != source_project_id {
                    anyhow::bail!("entity not in source project");
                }
                let mut props: Map<String, serde_json::Value> =
                    serde_json::from_str(&props_json).context("deserialize")?;
                if let Some(serde_json::Value::String(doc)) = props.get_mut("doc") {
                    *doc = rewrite_project_in_attachment_urls(doc, source_project_id, dest_project_id);
                }
                props.insert(
                    "updatedBy".to_string(),
                    serde_json::Value::String(updated_by.to_string()),
                );
                let json = serde_json::to_string(&props).context("serialize")?;
                tx.execute(
                    "UPDATE entities SET project_id = ?1, updated_at = ?2, properties_json = ?3 WHERE id = ?4 AND project_id = ?5",
                    params![dest_project_id, now, json, id, source_project_id],
                )
                .context("update entity project")?;

                let collab: Option<(String, Vec<u8>)> = tx
                    .query_row(
                        "SELECT doc_json, crdt_blob FROM wiki_collab_states WHERE project_id = ?1 AND page_id = ?2",
                        params![source_project_id, id],
                        |r| Ok((r.get(0)?, r.get(1)?)),
                    )
                    .optional()
                    .context("select collab")?;
                if let Some((doc_json, blob)) = collab {
                    let new_doc = rewrite_project_in_attachment_urls(
                        &doc_json,
                        source_project_id,
                        dest_project_id,
                    );
                    tx.execute(
                        "DELETE FROM wiki_collab_states WHERE project_id = ?1 AND page_id = ?2",
                        params![source_project_id, id],
                    )
                    .context("delete old collab")?;
                    tx.execute(
                        "INSERT INTO wiki_collab_states (project_id, page_id, updated_at, doc_json, crdt_blob)
                         VALUES (?1, ?2, ?3, ?4, ?5)",
                        params![dest_project_id, id, now, new_doc, blob],
                    )
                    .context("insert new collab")?;
                }
            }
        }

        // 3) Order siblings under destination parent (root is now in dest project when cross-project).
        apply_sibling_order(
            &tx,
            dest_project_id,
            &dest_order_ids,
            now,
            updated_by,
        )?;

        // 4) Set parentId on the moved root.
        {
            let row: String = tx
                .query_row(
                    "SELECT properties_json FROM entities WHERE project_id = ?1 AND id = ?2",
                    params![dest_project_id, page_id],
                    |r| r.get(0),
                )
                .optional()
                .context("select root")?
                .ok_or_else(|| anyhow::anyhow!("root not in destination project"))?;
            let mut props: Map<String, serde_json::Value> =
                serde_json::from_str(&row).context("deserialize root")?;
            match dest_parent_id {
                None => {
                    props.remove("parentId");
                    props.insert("parentId".to_string(), serde_json::Value::Null);
                }
                Some(p) => {
                    props.insert(
                        "parentId".to_string(),
                        serde_json::Value::String(p.to_string()),
                    );
                }
            }
            props.insert(
                "updatedBy".to_string(),
                serde_json::Value::String(updated_by.to_string()),
            );
            let json = serde_json::to_string(&props).context("serialize root")?;
            tx.execute(
                "UPDATE entities SET updated_at = ?1, properties_json = ?2 WHERE project_id = ?3 AND id = ?4",
                params![now, json, dest_project_id, page_id],
            )
            .context("update root parent")?;
        }

        tx.execute(
            "UPDATE projects SET updated_at = ?1 WHERE id = ?2",
            params![now, source_project_id],
        )
        .context("touch source project")?;
        tx.execute(
            "UPDATE projects SET updated_at = ?1 WHERE id = ?2",
            params![now, dest_project_id],
        )
        .context("touch dest project")?;

        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('version', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![now.to_string()],
        )
        .context("bump meta version")?;

        tx.commit().context("commit move tx")?;

        if cross_project {
            delete_attachment_files_for_project(db_path, source_project_id, &wiki_by_id_source, &subtree_ids);
        }

        // Reload all touched entities for indexer + response.
        let mut index_upserts: Vec<(String, Entity)> = vec![];
        let mut seen_up: HashSet<(String, String)> = HashSet::new();

        let push_upsert = |pid: &str, eid: &str, upserts: &mut Vec<(String, Entity)>, seen: &mut HashSet<(String, String)>| {
            if let Ok(Some(e)) = self.get_entity_for_project(pid, eid) {
                let key = (pid.to_string(), eid.to_string());
                if seen.insert(key.clone()) {
                    upserts.push((pid.to_string(), e));
                }
            }
        };

        for id in &dest_order_ids {
            push_upsert(dest_project_id, id, &mut index_upserts, &mut seen_up);
        }

        // Source old parent's remaining siblings after subtree removal
        if let Some(op) = old_root_parent.as_deref() {
            let stmt_result = self.list_entities_for_project(source_project_id);
            if let Ok(ents) = stmt_result {
                let wiki_ids: Vec<String> = ents
                    .into_iter()
                    .filter(|e| e.entity_id == WIKI_ENTITY)
                    .filter(|e| parent_id_from_props(&e.properties).as_deref() == Some(op))
                    .map(|e| e.id)
                    .collect();
                for id in wiki_ids {
                    push_upsert(source_project_id, &id, &mut index_upserts, &mut seen_up);
                }
            }
        } else {
            let stmt_result = self.list_entities_for_project(source_project_id);
            if let Ok(ents) = stmt_result {
                let wiki_ids: Vec<String> = ents
                    .into_iter()
                    .filter(|e| e.entity_id == WIKI_ENTITY)
                    .filter(|e| parent_id_from_props(&e.properties).is_none())
                    .map(|e| e.id)
                    .collect();
                for id in wiki_ids {
                    push_upsert(source_project_id, &id, &mut index_upserts, &mut seen_up);
                }
            }
        }

        // Non-root subtree members (cross-project) already at dest — ensure indexer
        if cross_project {
            for id in &subtree_ids {
                if id == page_id {
                    continue;
                }
                push_upsert(dest_project_id, id, &mut index_upserts, &mut seen_up);
            }
        }

        Ok(MoveWikiPageOutcome {
            source_project_id: source_project_id.to_string(),
            dest_project_id: dest_project_id.to_string(),
            moved_page_ids: subtree_ids,
            index_deletes,
            index_upserts,
        })
    }
}
