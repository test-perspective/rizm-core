use super::{manifest_named, tmp_db_path};
use crate::infra::db::{Db, DEFAULT_PROJECT_ID};
use crate::models::{Project, ProjectConfig};

#[test]
fn manifest_versions_include_name_and_can_be_fetched() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    let (current_manifest, etag) = db
        .get_manifest_with_etag(DEFAULT_PROJECT_ID)
        .expect("get manifest with etag")
        .expect("default manifest exists");

    let mut updated = current_manifest.clone();
    updated.name = "History Manifest".to_string();
    let new_id = db
        .put_manifest_if_match(
            DEFAULT_PROJECT_ID,
            &etag,
            updated,
            Some("ai_transform"),
            Some("Make it a CRM"),
            None,
        )
        .expect("put manifest with history");

    let versions = db
        .list_manifest_versions(DEFAULT_PROJECT_ID, 50, 0)
        .expect("list manifest versions");
    let latest = versions.first().expect("has history entry");
    assert_eq!(latest.id, new_id);

    let detail = db
        .get_manifest_version(DEFAULT_PROJECT_ID, &new_id)
        .expect("get manifest version")
        .expect("manifest version exists");
    assert_eq!(detail.0.id, new_id);
    assert_eq!(detail.1.name, "History Manifest");
}

#[test]
fn first_visible_manifest_history_includes_initial_seed_once() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    let project_id = "phist";
    let p = Project {
        id: project_id.to_string(),
        name: "Project History".to_string(),
        project_key: Some("PHS".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![],
        config: ProjectConfig {
            manifest: manifest_named("Base Manifest"),
        },
    };
    db.replace_project_state(p).expect("insert project");

    let (base_manifest, etag1) = db
        .get_manifest_with_etag(project_id)
        .expect("get base manifest")
        .expect("project manifest exists");
    assert_eq!(base_manifest.name, "Base Manifest");

    let mut m1 = base_manifest.clone();
    m1.name = "After First Change".to_string();
    let v1 = db
        .put_manifest_if_match(
            project_id,
            &etag1,
            m1,
            Some("ai_transform"),
            Some("first"),
            None,
        )
        .expect("put first manifest history");

    let versions_after_first = db
        .list_manifest_versions(project_id, 50, 0)
        .expect("list versions after first change");
    assert_eq!(versions_after_first.len(), 2);
    assert_eq!(versions_after_first[0].id, v1);
    assert_eq!(versions_after_first[0].source, "ai_transform");
    assert_eq!(versions_after_first[1].source, "seed");

    let seed_id = versions_after_first
        .iter()
        .find(|v| v.source == "seed")
        .expect("seed version exists")
        .id
        .clone();
    let seed_detail = db
        .get_manifest_version(project_id, &seed_id)
        .expect("get seed version")
        .expect("seed version detail exists");
    assert_eq!(seed_detail.1.name, "Base Manifest");

    let (_, etag2) = db
        .get_manifest_with_etag(project_id)
        .expect("get manifest after first change")
        .expect("project manifest exists");
    let mut m2 = seed_detail.1.clone();
    m2.name = "After Second Change".to_string();
    db.put_manifest_if_match(
        project_id,
        &etag2,
        m2,
        Some("ai_transform"),
        Some("second"),
        None,
    )
    .expect("put second manifest history");

    let versions_after_second = db
        .list_manifest_versions(project_id, 50, 0)
        .expect("list versions after second change");
    assert_eq!(
        versions_after_second
            .iter()
            .filter(|v| v.source == "seed")
            .count(),
        1
    );
    assert_eq!(versions_after_second.len(), 3);
}
