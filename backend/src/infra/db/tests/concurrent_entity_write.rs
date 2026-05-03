use super::{manifest_named, tmp_db_path};
use crate::infra::db::{Db, EntityWriteError};
use crate::models::{Project, ProjectConfig};
use serde_json::json;

/// Regression test for REQ-276: concurrent PATCHes to different entities must
/// not be silently turned into NotFound/404.
///
/// Before the fix, `patch_entity_for_project` used `BEGIN DEFERRED`. When two
/// transactions both took a read snapshot and one committed first, the other
/// hit `SQLITE_BUSY_SNAPSHOT` on its UPDATE. That error was `map_err(|_| NotFound)`,
/// so the API returned 404, the frontend silently kept optimistic UI, and the
/// user saw reverts only after a reload.
#[test]
fn concurrent_patch_different_entities_does_not_return_not_found() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    let p = Project {
        id: "pconc".to_string(),
        name: "Concurrent Project".to_string(),
        project_key: Some("CON".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![],
        config: ProjectConfig {
            manifest: manifest_named("Manifest Concurrent"),
        },
    };
    db.replace_project_state(p).expect("insert project");

    // Bulk status change in the UI creates many parallel PATCHes. Use enough
    // workers to reliably interleave DEFERRED transactions on multi-core hosts.
    const N: usize = 16;
    let mut initial = Vec::with_capacity(N);
    for i in 0..N {
        let mut props = serde_json::Map::new();
        props.insert("title".to_string(), json!(format!("init-{}", i)));
        let e = db
            .create_entity_for_project("pconc", Some(&format!("e{i}")), "task", props)
            .expect("create entity");
        initial.push(e);
    }

    let barrier = std::sync::Arc::new(std::sync::Barrier::new(N));
    let handles: Vec<_> = initial
        .into_iter()
        .enumerate()
        .map(|(i, e)| {
            let db = db.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                let mut patch = serde_json::Map::new();
                patch.insert("title".to_string(), json!(format!("updated-{i}")));
                patch.insert("status".to_string(), json!("Done"));
                // Start all threads roughly together to maximise interleaving
                // of DEFERRED transactions and writes.
                barrier.wait();
                db.patch_entity_for_project("pconc", &e.id, e.updated_at, patch)
            })
        })
        .collect();

    for (i, h) in handles.into_iter().enumerate() {
        let result = h.join().expect("worker thread panicked");
        match result {
            Ok(entity) => {
                assert_eq!(
                    entity.properties.get("status").and_then(|v| v.as_str()),
                    Some("Done"),
                    "entity e{i} must reflect the patched status",
                );
            }
            Err(EntityWriteError::NotFound) => panic!(
                "patch for existing entity e{i} returned NotFound — SQLITE_BUSY_SNAPSHOT was masked as 404"
            ),
            Err(EntityWriteError::Conflict { current_updated_at }) => panic!(
                "patch for e{i} unexpectedly returned Conflict(current_updated_at={current_updated_at}); each entity was patched by exactly one worker"
            ),
            Err(EntityWriteError::ServiceUnavailable) => panic!(
                "patch for e{i} returned ServiceUnavailable under normal concurrency; busy_timeout should have covered lock waits"
            ),
        }
    }

    // All server-side values must match the final per-entity PATCH.
    for i in 0..N {
        let e = db
            .get_entity_for_project("pconc", &format!("e{i}"))
            .expect("get entity")
            .unwrap_or_else(|| panic!("entity e{i} missing after patch"));
        assert_eq!(
            e.properties.get("title").and_then(|v| v.as_str()),
            Some(format!("updated-{i}").as_str()),
            "entity e{i} must be persisted with its patched title after concurrent PATCHes",
        );
    }
}

/// Companion regression test: concurrent DELETE on distinct rows must also not
/// be turned into NotFound/404 by a masked `SQLITE_BUSY_SNAPSHOT`.
#[test]
fn concurrent_delete_different_entities_does_not_return_not_found() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    let p = Project {
        id: "pdel".to_string(),
        name: "Concurrent Delete Project".to_string(),
        project_key: Some("DEL".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![],
        config: ProjectConfig {
            manifest: manifest_named("Manifest Delete"),
        },
    };
    db.replace_project_state(p).expect("insert project");

    const N: usize = 16;
    let mut initial = Vec::with_capacity(N);
    for i in 0..N {
        let mut props = serde_json::Map::new();
        props.insert("title".to_string(), json!(format!("to-delete-{}", i)));
        let e = db
            .create_entity_for_project("pdel", Some(&format!("d{i}")), "task", props)
            .expect("create entity");
        initial.push(e);
    }

    let barrier = std::sync::Arc::new(std::sync::Barrier::new(N));
    let handles: Vec<_> = initial
        .into_iter()
        .enumerate()
        .map(|(_, e)| {
            let db = db.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                db.delete_entity_for_project("pdel", &e.id, e.updated_at)
            })
        })
        .collect();

    for (i, h) in handles.into_iter().enumerate() {
        match h.join().expect("worker thread panicked") {
            Ok(()) => {}
            Err(EntityWriteError::NotFound) => panic!(
                "delete for existing entity d{i} returned NotFound — SQLITE_BUSY_SNAPSHOT was masked as 404"
            ),
            Err(e) => panic!("unexpected delete error for d{i}: {e:?}"),
        }
    }
}
