use anyhow::Context;
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use uuid::Uuid;

use crate::models::Entity;
use super::{Db, EntityWriteError};

impl Db {
    pub fn get_entity_for_project(&self, project_id: &str, entity_pk: &str) -> anyhow::Result<Option<Entity>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let row: Option<(String, String, i64, i64, String)> = conn
            .query_row(
                "SELECT id, entity_id, created_at, updated_at, properties_json
                 FROM entities
                 WHERE project_id = ?1 AND id = ?2",
                params![project_id, entity_pk],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .optional()
            .context("select entity by id")?;
        let Some((id, entity_id, created_at, updated_at, props_json)) = row else {
            return Ok(None);
        };
        let props: serde_json::Map<String, serde_json::Value> =
            serde_json::from_str(&props_json).context("deserialize entity props")?;
        Ok(Some(Entity {
            id,
            entity_id,
            created_at,
            updated_at,
            properties: props,
        }))
    }

    pub fn create_entity_for_project(
        &self,
        project_id: &str,
        id: Option<&str>,
        entity_id: &str,
        properties: serde_json::Map<String, serde_json::Value>,
    ) -> anyhow::Result<Entity> {
        let mut conn = self.pool.get().context("get sqlite conn")?;
        // IMMEDIATE to avoid race conditions for per-project counters.
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .context("begin transaction")?;

        let project_row: Option<(String, Option<String>)> = tx
            .query_row(
                "SELECT id, project_key FROM projects WHERE id = ?1",
                params![project_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .context("check project exists")?;
        let Some((_pid, project_key)) = project_row else {
            return Err(anyhow::anyhow!("project not found"));
        };

        let now = crate::time::now_ms();
        let id = match id {
            Some(s) if !s.trim().is_empty() => s.trim().to_string(),
            _ => Uuid::new_v4().to_string(),
        };

        let mut properties = properties;
        if entity_id.trim() == "task" {
            let key = project_key
                .as_deref()
                .map(Self::normalize_project_key)
                .unwrap_or_default();
            if key.is_empty() || !Self::is_valid_project_key(&key) {
                return Err(anyhow::anyhow!("projectKey not set or invalid"));
            }

            // Ensure counter row exists.
            tx.execute(
                "INSERT INTO project_counters (project_id, next_task_seq) VALUES (?1, 1)
                 ON CONFLICT(project_id) DO NOTHING",
                params![project_id],
            )
            .context("init project_counters row")?;

            let next_seq: i64 = tx
                .query_row(
                    "SELECT next_task_seq FROM project_counters WHERE project_id = ?1",
                    params![project_id],
                    |r| r.get(0),
                )
                .context("select next_task_seq")?;

            let (task_key, bump_to) = if let Some(serde_json::Value::String(ref provided)) = properties.get("taskKey") {
                let provided = provided.trim();
                if provided.is_empty() {
                    (format!("{key}-{next_seq}"), next_seq + 1)
                } else if let Some((prefix, num_str)) = provided.rsplit_once('-') {
                    if prefix.to_uppercase() == key.to_uppercase() {
                        if let Ok(n) = num_str.parse::<i64>() {
                            let bump_to = (next_seq).max(n + 1);
                            (provided.to_string(), bump_to)
                        } else {
                            (format!("{key}-{next_seq}"), next_seq + 1)
                        }
                    } else {
                        (format!("{key}-{next_seq}"), next_seq + 1)
                    }
                } else {
                    (format!("{key}-{next_seq}"), next_seq + 1)
                }
            } else {
                (format!("{key}-{next_seq}"), next_seq + 1)
            };

            tx.execute(
                "UPDATE project_counters SET next_task_seq = ?2 WHERE project_id = ?1",
                params![project_id, bump_to],
            )
            .context("bump next_task_seq")?;

            properties.insert("taskKey".to_string(), serde_json::Value::String(task_key));
        }

        let props_json = serde_json::to_string(&properties).context("serialize entity props")?;
        tx.execute(
            "INSERT INTO entities (id, project_id, entity_id, created_at, updated_at, properties_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, project_id, entity_id, now, now, props_json],
        )
        .context("insert entity")?;

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
            entity_id: entity_id.to_string(),
            created_at: now,
            updated_at: now,
            properties,
        })
    }

    pub fn patch_entity_for_project(
        &self,
        project_id: &str,
        entity_pk: &str,
        expected_updated_at: i64,
        mut patch: serde_json::Map<String, serde_json::Value>,
    ) -> Result<Entity, EntityWriteError> {
        let mut conn = match self.pool.get() {
            Ok(c) => c,
            Err(_) => return Err(EntityWriteError::ServiceUnavailable),
        };
        // IMMEDIATE acquires the write lock up-front so concurrent PATCHes
        // serialise through busy_timeout instead of racing DEFERRED snapshots
        // and hitting SQLITE_BUSY_SNAPSHOT (REQ-276).
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sqlite_err_to_entity_write_error)?;

        let row: Option<(String, String, i64, i64, String)> = tx
            .query_row(
                "SELECT id, entity_id, created_at, updated_at, properties_json
                 FROM entities
                 WHERE project_id = ?1 AND id = ?2",
                params![project_id, entity_pk],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .optional()
            .map_err(sqlite_err_to_entity_write_error)?;

        let Some((id, entity_id, created_at, current_updated_at, props_json)) = row else {
            return Err(EntityWriteError::NotFound);
        };

        if current_updated_at != expected_updated_at {
            return Err(EntityWriteError::Conflict {
                current_updated_at,
            });
        }

        // Prevent clients from changing server-managed keys.
        if entity_id.trim() == "task" {
            patch.remove("taskKey");
        }

        let mut props: serde_json::Map<String, serde_json::Value> =
            serde_json::from_str(&props_json).unwrap_or_default();
        for (k, v) in patch {
            props.insert(k, v);
        }

        let now = crate::time::now_ms();
        // Serialisation is deterministic for a valid JSON Map, but treat any
        // failure as transient rather than silently turning it into a 404.
        let next_json =
            serde_json::to_string(&props).map_err(|_| EntityWriteError::ServiceUnavailable)?;
        tx.execute(
            "UPDATE entities SET updated_at = ?1, properties_json = ?2 WHERE project_id = ?3 AND id = ?4",
            params![now, next_json, project_id, entity_pk],
        )
        .map_err(sqlite_err_to_entity_write_error)?;

        tx.execute(
            "UPDATE projects SET updated_at = ?1 WHERE id = ?2",
            params![now, project_id],
        )
        .map_err(sqlite_err_to_entity_write_error)?;

        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('version', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![now.to_string()],
        )
        .map_err(sqlite_err_to_entity_write_error)?;

        tx.commit().map_err(sqlite_err_to_entity_write_error)?;

        Ok(Entity {
            id,
            entity_id,
            created_at,
            updated_at: now,
            properties: props,
        })
    }

    pub fn get_wiki_collab_state_for_project(
        &self,
        project_id: &str,
        page_id: &str,
    ) -> anyhow::Result<Option<(Vec<u8>, String, i64)>> {
        let conn = self.pool.get().context("get sqlite conn")?;
        let row: Option<(Vec<u8>, String, i64)> = conn
            .query_row(
                "SELECT crdt_blob, doc_json, updated_at
                 FROM wiki_collab_states
                 WHERE project_id = ?1 AND page_id = ?2",
                params![project_id, page_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()
            .context("select wiki_collab_state")?;
        Ok(row)
    }

    pub fn upsert_wiki_collab_state_for_project(
        &self,
        project_id: &str,
        page_id: &str,
        doc_json: &str,
        crdt_blob: &[u8],
        updated_by: Option<&str>,
    ) -> anyhow::Result<Entity> {
        let mut conn = self.pool.get().context("get sqlite conn")?;
        let tx = conn.transaction().context("begin transaction")?;

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
            "INSERT INTO wiki_collab_states (project_id, page_id, updated_at, doc_json, crdt_blob)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(project_id, page_id) DO UPDATE SET
               updated_at = excluded.updated_at,
               doc_json = excluded.doc_json,
               crdt_blob = excluded.crdt_blob",
            params![project_id, page_id, now, doc_json, crdt_blob],
        )
        .context("upsert wiki collab state")?;

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

    pub fn delete_entity_for_project(
        &self,
        project_id: &str,
        entity_pk: &str,
        expected_updated_at: i64,
    ) -> Result<(), EntityWriteError> {
        let mut conn = match self.pool.get() {
            Ok(c) => c,
            Err(_) => return Err(EntityWriteError::ServiceUnavailable),
        };
        // IMMEDIATE for the same reason as `patch_entity_for_project`: avoid
        // SQLITE_BUSY_SNAPSHOT under concurrent writers (REQ-276).
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sqlite_err_to_entity_write_error)?;

        let current: Option<i64> = tx
            .query_row(
                "SELECT updated_at FROM entities WHERE project_id = ?1 AND id = ?2",
                params![project_id, entity_pk],
                |r| r.get(0),
            )
            .optional()
            .map_err(sqlite_err_to_entity_write_error)?;

        let Some(current_updated_at) = current else {
            return Err(EntityWriteError::NotFound);
        };
        if current_updated_at != expected_updated_at {
            return Err(EntityWriteError::Conflict {
                current_updated_at,
            });
        }

        tx.execute(
            "DELETE FROM entities WHERE project_id = ?1 AND id = ?2",
            params![project_id, entity_pk],
        )
        .map_err(sqlite_err_to_entity_write_error)?;

        let now = crate::time::now_ms();
        tx.execute(
            "UPDATE projects SET updated_at = ?1 WHERE id = ?2",
            params![now, project_id],
        )
        .map_err(sqlite_err_to_entity_write_error)?;

        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('version', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![now.to_string()],
        )
        .map_err(sqlite_err_to_entity_write_error)?;

        tx.commit().map_err(sqlite_err_to_entity_write_error)?;
        Ok(())
    }
}

/// Map an unexpected rusqlite error produced during an entity write to a
/// transport-friendly `EntityWriteError`. Lock/busy conditions must surface as
/// `ServiceUnavailable` (HTTP 503) so the client retries; silently reporting
/// them as `NotFound` caused REQ-276 (optimistic UI kept while the server
/// never persisted the change).
fn sqlite_err_to_entity_write_error(e: rusqlite::Error) -> EntityWriteError {
    match e {
        rusqlite::Error::SqliteFailure(err, _)
            if matches!(
                err.code,
                rusqlite::ErrorCode::DatabaseBusy | rusqlite::ErrorCode::DatabaseLocked
            ) =>
        {
            EntityWriteError::ServiceUnavailable
        }
        _ => EntityWriteError::ServiceUnavailable,
    }
}

