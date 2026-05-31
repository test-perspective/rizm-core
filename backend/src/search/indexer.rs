use std::sync::{Mutex, OnceLock};

use anyhow::Context;
use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};
use rusqlite::params;
use zerocopy::AsBytes;

use crate::app_state::AppState;
use crate::db::Db;
use crate::models::Entity;

use super::text_extract::{chunk_text, extract_entity_text};

const EMBEDDING_DIM: usize = 384;
const CHUNK_MAX_CHARS: usize = 800;
const CHUNK_OVERLAP: usize = 200;

static EMBEDDER: OnceLock<anyhow::Result<Mutex<TextEmbedding>>> = OnceLock::new();

fn with_embedder<T>(f: impl FnOnce(&mut TextEmbedding) -> anyhow::Result<T>) -> anyhow::Result<T> {
    let cell = EMBEDDER.get_or_init(|| {
        TextEmbedding::try_new(InitOptions::new(EmbeddingModel::BGESmallENV15))
            .context("init fastembed")
            .map(Mutex::new)
    });
    let mutex = cell.as_ref().map_err(|e| anyhow::anyhow!(e.to_string()))?;
    let mut guard = mutex
        .lock()
        .map_err(|_| anyhow::anyhow!("embedding lock poisoned"))?;
    f(&mut guard)
}

fn embed_texts(texts: &[String], prefix: &str) -> anyhow::Result<Vec<Vec<f32>>> {
    if texts.is_empty() {
        return Ok(Vec::new());
    }
    let docs: Vec<String> = texts.iter().map(|t| format!("{prefix}{t}")).collect();
    with_embedder(|model| model.embed(docs, None).context("embed texts"))
}

pub fn embed_query(text: &str) -> anyhow::Result<Vec<f32>> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let embeddings = embed_texts(&vec![trimmed.to_string()], "query: ")?;
    Ok(embeddings.into_iter().next().unwrap_or_default())
}

fn is_indexable(entity: &Entity) -> bool {
    matches!(entity.entity_id.as_str(), "task" | "item" | "wikiPage")
}

pub fn upsert_entity(db: &Db, project_id: &str, entity: &Entity) -> anyhow::Result<()> {
    if !is_indexable(entity) {
        return Ok(());
    }
    let text = extract_entity_text(entity);
    let full_text = format!("{} {}", text.title, text.content)
        .trim()
        .to_string();
    let chunks = chunk_text(&full_text, CHUNK_MAX_CHARS, CHUNK_OVERLAP);
    if chunks.is_empty() {
        let conn = db.pool.get().context("get sqlite conn")?;
        conn.execute(
            "DELETE FROM vec_entities WHERE project_id = ?1 AND entity_pk = ?2",
            params![project_id, entity.id],
        )
        .context("delete existing vec rows")?;
        return Ok(());
    }

    let embeddings = embed_texts(&chunks, "passage: ")?;
    let mut conn = db.pool.get().context("get sqlite conn")?;
    let tx = conn.transaction().context("begin transaction")?;

    tx.execute(
        "DELETE FROM vec_entities WHERE project_id = ?1 AND entity_pk = ?2",
        params![project_id, entity.id],
    )
    .context("delete existing vec rows")?;
    for (idx, (chunk, embedding)) in chunks.into_iter().zip(embeddings).enumerate() {
        if embedding.len() != EMBEDDING_DIM {
            return Err(anyhow::anyhow!("unexpected embedding dim"));
        }
        tx.execute(
            "INSERT INTO vec_entities (project_id, entity_kind, entity_pk, updated_at, chunk_index, embedding, title, content)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                project_id,
                entity.entity_id,
                entity.id,
                entity.updated_at,
                idx as i64,
                embedding.as_bytes(),
                text.title,
                chunk
            ],
        )
        .context("insert vec row")?;
    }

    tx.commit().context("commit transaction")?;
    Ok(())
}

pub fn delete_entity(db: &Db, project_id: &str, entity_pk: &str) -> anyhow::Result<()> {
    let conn = db.pool.get().context("get sqlite conn")?;
    conn.execute(
        "DELETE FROM vec_entities WHERE project_id = ?1 AND entity_pk = ?2",
        params![project_id, entity_pk],
    )
    .context("delete vec rows")?;
    Ok(())
}

pub fn reindex_project(db: &Db, project_id: &str) -> anyhow::Result<()> {
    let entities = db
        .list_entities_for_project(project_id)
        .context("list project entities")?;
    let mut conn = db.pool.get().context("get sqlite conn")?;
    let tx = conn.transaction().context("begin transaction")?;
    tx.execute(
        "DELETE FROM vec_entities WHERE project_id = ?1",
        params![project_id],
    )
    .context("clear project vec rows")?;
    tx.commit().context("commit delete transaction")?;

    for entity in entities {
        upsert_entity(db, project_id, &entity)?;
    }
    Ok(())
}

const INDEXER_DELAY_SECS: u64 = 5;

pub fn enqueue_entity_upsert(state: AppState, project_id: String, entity: Entity) {
    let key = format!("{}:{}", project_id, entity.id);
    let service_gate = state.service_gate.clone();
    let debounce = state.indexer_debounce.clone();
    let db_lock = state.db.clone();
    let entity_clone = entity.clone();

    tokio::spawn(async move {
        let delay_secs = std::env::var("KEEL_INDEXER_DELAY_SECS")
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(INDEXER_DELAY_SECS);

        let (tx, rx) = tokio::sync::oneshot::channel();
        {
            let mut map = debounce.lock().await;
            if let Some(old_tx) = map.remove(&key) {
                let _ = old_tx.send(());
            }
            map.insert(key.clone(), tx);
        }

        let run = tokio::time::sleep(tokio::time::Duration::from_secs(delay_secs));
        tokio::select! {
            _ = run => {
                debounce.lock().await.remove(&key);
                let _gate = service_gate.read().await;
                let db = db_lock.read().await.clone();
                let result = tokio::task::spawn_blocking(move || upsert_entity(&db, &project_id, &entity_clone)).await;
                if let Err(err) = result {
                    tracing::warn!(error = ?err, "indexer task join failed");
                } else if let Ok(Err(err)) = result {
                    tracing::warn!(error = %err, "indexer upsert failed");
                }
            }
            _ = rx => {}
        }
    });
}

pub fn enqueue_entity_delete(state: AppState, project_id: String, entity_pk: String) {
    let service_gate = state.service_gate.clone();
    let db_lock = state.db.clone();
    tokio::spawn(async move {
        let _gate = service_gate.read().await;
        let db = db_lock.read().await.clone();
        let result =
            tokio::task::spawn_blocking(move || delete_entity(&db, &project_id, &entity_pk)).await;
        if let Err(err) = result {
            tracing::warn!(error = ?err, "indexer delete task join failed");
        } else if let Ok(Err(err)) = result {
            tracing::warn!(error = %err, "indexer delete failed");
        }
    });
}

pub fn enqueue_reindex_project(state: AppState, project_id: String) {
    let service_gate = state.service_gate.clone();
    let db_lock = state.db.clone();
    tokio::spawn(async move {
        let _gate = service_gate.read().await;
        let db = db_lock.read().await.clone();
        let result = tokio::task::spawn_blocking(move || reindex_project(&db, &project_id)).await;
        if let Err(err) = result {
            tracing::warn!(error = ?err, "indexer reindex task join failed");
        } else if let Ok(Err(err)) = result {
            tracing::warn!(error = %err, "indexer reindex failed");
        }
    });
}
