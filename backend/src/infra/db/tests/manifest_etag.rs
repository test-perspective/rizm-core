use super::{manifest_named, tmp_db_path};
use crate::infra::db::{Db, ManifestWriteError};
use crate::models::{Project, ProjectConfig};
use serde_json::json;

/// Regression tests for REQ-322: "deleting a field in the schema editor doesn't
/// stick".
///
/// The manifest ETag used to be derived from the newest `manifest_versions` row,
/// falling back to `projects.updated_at`. Both move for reasons unrelated to the
/// manifest, and a `silent` PUT returned `now_ms` -- a token no later read would
/// ever agree with. So the second manifest write of a session failed with 412, the
/// frontend swallowed the error and refreshed, and the deleted field came back.

fn project(id: &str) -> Project {
    Project {
        id: id.to_string(),
        name: "Etag Project".to_string(),
        project_key: Some("ETG".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![],
        config: ProjectConfig {
            manifest: manifest_named("Base Manifest"),
        },
    }
}

fn etag_of(db: &Db, project_id: &str) -> String {
    db.get_manifest_with_etag(project_id)
        .expect("get manifest with etag")
        .expect("manifest exists")
        .1
}

#[test]
fn entity_writes_do_not_change_the_manifest_etag() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    db.replace_project_state(project("petag1"))
        .expect("insert project");

    let before = etag_of(&db, "petag1");

    // Creating and patching a task bumps `projects.updated_at`.
    let mut props = serde_json::Map::new();
    props.insert("title".to_string(), json!("a task"));
    let entity = db
        .create_entity_for_project("petag1", None, "task", props)
        .expect("create entity");
    let mut patch = serde_json::Map::new();
    patch.insert("title".to_string(), json!("renamed"));
    db.patch_entity_for_project("petag1", &entity.id, entity.updated_at, patch)
        .expect("patch entity");

    assert_eq!(
        before,
        etag_of(&db, "petag1"),
        "entity writes must not invalidate the manifest ETag"
    );
}

#[test]
fn consecutive_silent_writes_succeed_with_the_returned_etag() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    db.replace_project_state(project("petag2"))
        .expect("insert project");

    let mut etag = etag_of(&db, "petag2");
    for i in 0..3 {
        let mut manifest = manifest_named("Base Manifest");
        manifest.name = format!("Silent {i}");
        etag = db
            .put_manifest_if_match("petag2", &etag, manifest, Some("silent"), None, None)
            .unwrap_or_else(|_| panic!("silent put #{i} must succeed"));
        assert_eq!(
            etag,
            etag_of(&db, "petag2"),
            "the ETag a write returns must be the one the next read reports"
        );
    }
}

#[test]
fn silent_writes_still_succeed_after_a_history_recording_write() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    db.replace_project_state(project("petag3"))
        .expect("insert project");

    let mut manifest = manifest_named("Base Manifest");
    manifest.name = "Edited In Editor".to_string();
    let etag = db
        .put_manifest_if_match(
            "petag3",
            &etag_of(&db, "petag3"),
            manifest,
            Some("manifest_editor"),
            Some("edit"),
            None,
        )
        .expect("manifest_editor put");

    let mut manifest = manifest_named("Base Manifest");
    manifest.name = "Silent After History".to_string();
    db.put_manifest_if_match("petag3", &etag, manifest, Some("silent"), None, None)
        .expect("silent put after history must succeed");
}

#[test]
fn a_stale_etag_is_still_a_conflict() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    db.replace_project_state(project("petag4"))
        .expect("insert project");

    let stale = etag_of(&db, "petag4");
    let mut manifest = manifest_named("Base Manifest");
    manifest.name = "First".to_string();
    db.put_manifest_if_match("petag4", &stale, manifest, Some("silent"), None, None)
        .expect("first put");

    let mut manifest = manifest_named("Base Manifest");
    manifest.name = "Second".to_string();
    match db.put_manifest_if_match("petag4", &stale, manifest, Some("silent"), None, None) {
        Err(ManifestWriteError::Conflict { .. }) => {}
        other => panic!("expected Conflict, got {other:?}"),
    }
}

#[test]
fn reverting_a_version_changes_the_etag() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    db.replace_project_state(project("petag5"))
        .expect("insert project");

    let mut manifest = manifest_named("Base Manifest");
    manifest.name = "Version One".to_string();
    db.put_manifest_if_match(
        "petag5",
        &etag_of(&db, "petag5"),
        manifest,
        Some("manifest_editor"),
        Some("v1"),
        None,
    )
    .expect("record a version");

    let version_id = db
        .list_manifest_versions("petag5", 50, 0)
        .expect("list versions")
        .first()
        .expect("at least one version")
        .id
        .clone();

    let before = etag_of(&db, "petag5");
    db.revert_manifest_to_version("petag5", &version_id, None, Some("revert"))
        .expect("revert to version");

    assert_ne!(
        before,
        etag_of(&db, "petag5"),
        "a revert must invalidate open clients' manifest ETags"
    );
}
