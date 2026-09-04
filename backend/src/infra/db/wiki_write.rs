//! Wiki page body writes that bypass the collaborative (Yjs) pipeline.

use anyhow::Context;
use rusqlite::{params, OptionalExtension, TransactionBehavior};

use super::Db;
use crate::models::Entity;

impl Db {
    /// Replace the BlockNote `doc` of a wiki page and drop its CRDT collab
    /// state in the same transaction.
    ///
    /// The editor prefers the CRDT blob over `doc` when rendering, so a doc
    /// update from MCP/AI tools must delete the `wiki_collab_states` row.
    /// The next editor open then re-seeds the Yjs document from `doc`.
    pub fn replace_wiki_doc_for_project(
        &self,
        project_id: &str,
        page_id: &str,
        doc_json: &str,
        updated_by: Option<&str>,
    ) -> anyhow::Result<Entity> {
        let mut conn = self.pool.get().context("get sqlite conn")?;
        // IMMEDIATE to avoid SQLITE_BUSY_SNAPSHOT under concurrent writers (REQ-276).
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .context("begin transaction")?;

        let row: Option<(String, String, i64, i64, String)> = tx
            .query_row(
                "SELECT id, entity_id, created_at, updated_at, properties_json
                 FROM entities
                 WHERE project_id = ?1 AND id = ?2",
                params![project_id, page_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .optional()
            .context("select wiki entity")?;

        let Some((id, entity_id, created_at, _old_updated_at, props_json)) = row else {
            return Err(anyhow::anyhow!("wiki page not found"));
        };
        if entity_id.trim() != "wikiPage" {
            return Err(anyhow::anyhow!("entity is not wikiPage"));
        }

        let mut props: serde_json::Map<String, serde_json::Value> =
            serde_json::from_str(&props_json).unwrap_or_default();
        props.insert(
            "doc".to_string(),
            serde_json::Value::String(doc_json.to_string()),
        );
        if let Some(user_id) = updated_by {
            props.insert(
                "updatedBy".to_string(),
                serde_json::Value::String(user_id.to_string()),
            );
        }
        let now = crate::time::now_ms();
        let next_json = serde_json::to_string(&props).context("serialize wiki props")?;

        tx.execute(
            "UPDATE entities
             SET updated_at = ?1, properties_json = ?2
             WHERE project_id = ?3 AND id = ?4",
            params![now, next_json, project_id, page_id],
        )
        .map_err(|e| anyhow::anyhow!("update wiki entity: {}", e))?;

        tx.execute(
            "DELETE FROM wiki_collab_states WHERE project_id = ?1 AND page_id = ?2",
            params![project_id, page_id],
        )
        .context("delete wiki collab state")?;

        tx.execute(
            "UPDATE projects SET updated_at = ?1 WHERE id = ?2",
            params![now, project_id],
        )
        .context("touch project updated_at")?;

        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('version', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![now.to_string()],
        )
        .context("update version")?;

        tx.commit().context("commit transaction")?;
        Ok(Entity {
            id,
            entity_id,
            created_at,
            updated_at: now,
            properties: props,
        })
    }
}
