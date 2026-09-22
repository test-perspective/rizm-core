use super::{manifest_named, tmp_db_path};
use crate::infra::db::Db;
use crate::models::{Entity, Project, ProjectConfig};

#[test]
fn wiki_move_subtree_cross_project_moves_entities_collab_and_attachments() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    let mut props_root = serde_json::Map::new();
    props_root.insert("title".to_string(), serde_json::json!("Root"));
    props_root.insert("doc".to_string(), serde_json::json!(""));
    props_root.insert("__keelOrder".to_string(), serde_json::json!(0.0));
    props_root.insert(
        "attachments".to_string(),
        serde_json::json!([{
            "id": "att1",
            "fileName": "x.png",
            "size": 1,
            "createdAt": 1
        }]),
    );

    let mut props_child = serde_json::Map::new();
    props_child.insert("title".to_string(), serde_json::json!("Child"));
    props_child.insert("doc".to_string(), serde_json::json!(""));
    props_child.insert("parentId".to_string(), serde_json::json!("wiki-root"));
    props_child.insert("__keelOrder".to_string(), serde_json::json!(0.0));

    let p1 = Project {
        id: "pm1".to_string(),
        name: "P1".to_string(),
        project_key: Some("PM1".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![
            Entity {
                id: "wiki-root".to_string(),
                entity_id: "wikiPage".to_string(),
                created_at: 1,
                updated_at: 1,
                properties: props_root,
            },
            Entity {
                id: "wiki-child".to_string(),
                entity_id: "wikiPage".to_string(),
                created_at: 2,
                updated_at: 2,
                properties: props_child,
            },
        ],
        config: ProjectConfig {
            manifest: manifest_named("M1"),
        },
    };
    let p2 = Project {
        id: "pm2".to_string(),
        name: "P2".to_string(),
        project_key: Some("PM2".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![],
        config: ProjectConfig {
            manifest: manifest_named("M2"),
        },
    };
    db.replace_project_state(p1).expect("p1");
    db.replace_project_state(p2).expect("p2");

    let root_attach = crate::api::attachments_api::attachment_path(
        &crate::api::attachments_api::attachments_root_from_db_path(&db_path),
        "pm1",
        "att1",
    );
    std::fs::create_dir_all(root_attach.parent().expect("parent")).expect("mkdir attach");
    std::fs::write(&root_attach, b"x").expect("write attach");

    db.upsert_wiki_collab_state_for_project(
        "pm1",
        "wiki-root",
        r#"[{"type":"paragraph"}]"#,
        &[9_u8, 9_u8],
        Some("u"),
    )
    .expect("collab");

    let out = db
        .move_wiki_page_subtree(&db_path, "pm1", "wiki-root", "pm2", None, None, "u1")
        .expect("move");

    assert!(out.moved_page_ids.contains(&"wiki-root".to_string()));
    assert!(out.moved_page_ids.contains(&"wiki-child".to_string()));

    assert!(db
        .get_entity_for_project("pm2", "wiki-root")
        .expect("get")
        .is_some());
    assert!(db
        .get_entity_for_project("pm1", "wiki-root")
        .expect("get")
        .is_none());

    // REQ-319: a CRDT blob cannot be URL-rewritten, so a cross-project move drops the
    // collab row and lets the editor re-seed from the rewritten `doc`.
    assert!(db
        .get_wiki_collab_state_for_project("pm2", "wiki-root")
        .expect("gc")
        .is_none());
    assert!(db
        .get_wiki_collab_state_for_project("pm1", "wiki-root")
        .expect("gc")
        .is_none());

    let dst_attach = crate::api::attachments_api::attachment_path(
        &crate::api::attachments_api::attachments_root_from_db_path(&db_path),
        "pm2",
        "att1",
    );
    assert!(dst_attach.exists());
    assert!(!root_attach.exists());
}

fn attachment_url(project_id: &str, entity_id: &str, attachment_id: &str) -> String {
    format!(
        "http://localhost:48888/api/projects/{}/entities/{}/attachments/{}",
        project_id, entity_id, attachment_id
    )
}

fn image_doc(url: &str) -> String {
    serde_json::json!([{
        "id": "b1",
        "type": "image",
        "props": { "url": url },
        "children": []
    }])
    .to_string()
}

/// Seed `pm1` with `wiki-root` (custom props) + `wiki-child`, and an empty `pm2`.
fn seed_two_projects(db: &Db, root_props: serde_json::Map<String, serde_json::Value>) {
    let mut props_child = serde_json::Map::new();
    props_child.insert("title".to_string(), serde_json::json!("Child"));
    props_child.insert("doc".to_string(), serde_json::json!(""));
    props_child.insert("parentId".to_string(), serde_json::json!("wiki-root"));
    props_child.insert("__keelOrder".to_string(), serde_json::json!(0.0));

    let p1 = Project {
        id: "pm1".to_string(),
        name: "P1".to_string(),
        project_key: Some("PM1".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![
            Entity {
                id: "wiki-root".to_string(),
                entity_id: "wikiPage".to_string(),
                created_at: 1,
                updated_at: 1,
                properties: root_props,
            },
            Entity {
                id: "wiki-child".to_string(),
                entity_id: "wikiPage".to_string(),
                created_at: 2,
                updated_at: 2,
                properties: props_child,
            },
        ],
        config: ProjectConfig {
            manifest: manifest_named("M1"),
        },
    };
    let p2 = Project {
        id: "pm2".to_string(),
        name: "P2".to_string(),
        project_key: Some("PM2".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![],
        config: ProjectConfig {
            manifest: manifest_named("M2"),
        },
    };
    db.replace_project_state(p1).expect("p1");
    db.replace_project_state(p2).expect("p2");
}

fn write_attachment(db_path: &str, project_id: &str, attachment_id: &str) {
    let path = crate::api::attachments_api::attachment_path(
        &crate::api::attachments_api::attachments_root_from_db_path(db_path),
        project_id,
        attachment_id,
    );
    std::fs::create_dir_all(path.parent().expect("parent")).expect("mkdir attach");
    std::fs::write(&path, b"x").expect("write attach");
}

/// REQ-319: the editor renders from the CRDT blob when present, and the blob cannot be
/// string-rewritten. A cross-project move must therefore drop the collab row so the
/// editor re-seeds from the rewritten `doc`.
#[test]
fn wiki_move_cross_project_rewrites_doc_and_comment_urls_and_drops_collab_state() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    let old_url = attachment_url("pm1", "wiki-root", "att1");
    let new_url = attachment_url("pm2", "wiki-root", "att1");

    let mut props_root = serde_json::Map::new();
    props_root.insert("title".to_string(), serde_json::json!("Root"));
    props_root.insert("doc".to_string(), serde_json::json!(""));
    props_root.insert("__keelOrder".to_string(), serde_json::json!(0.0));
    props_root.insert(
        "attachments".to_string(),
        serde_json::json!([{ "id": "att1", "fileName": "x.png", "size": 1, "createdAt": 1 }]),
    );
    props_root.insert(
        "comments".to_string(),
        serde_json::json!([{ "id": "c1", "body": image_doc(&old_url), "createdAt": 1 }]),
    );

    seed_two_projects(&db, props_root);
    write_attachment(&db_path, "pm1", "att1");

    // Mirrors `doc` into the entity and stores an opaque blob, like a real editor save.
    db.upsert_wiki_collab_state_for_project(
        "pm1",
        "wiki-root",
        &image_doc(&old_url),
        &[9_u8, 9_u8],
        Some("u"),
    )
    .expect("collab");

    db.move_wiki_page_subtree(&db_path, "pm1", "wiki-root", "pm2", None, None, "u1")
        .expect("move");

    let moved = db
        .get_entity_for_project("pm2", "wiki-root")
        .expect("get")
        .expect("entity");
    let doc = moved
        .properties
        .get("doc")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    assert!(doc.contains(&new_url), "doc should use the dest url: {doc}");
    assert!(!doc.contains(&old_url), "doc should drop the source url: {doc}");

    let comments =
        serde_json::to_string(moved.properties.get("comments").expect("comments")).expect("json");
    assert!(
        comments.contains(&new_url),
        "comment attachment url should be rewritten: {comments}"
    );
    assert!(
        !comments.contains(&old_url),
        "comment attachment url should drop the source project: {comments}"
    );

    assert!(
        db.get_wiki_collab_state_for_project("pm2", "wiki-root")
            .expect("gc")
            .is_none(),
        "cross-project move must drop the stale CRDT blob"
    );
}

/// A same-project move must not disturb collaborative editing state.
#[test]
fn wiki_move_same_project_keeps_collab_state() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    let mut props_root = serde_json::Map::new();
    props_root.insert("title".to_string(), serde_json::json!("Root"));
    props_root.insert("doc".to_string(), serde_json::json!(""));
    props_root.insert("__keelOrder".to_string(), serde_json::json!(0.0));
    seed_two_projects(&db, props_root);

    db.upsert_wiki_collab_state_for_project(
        "pm1",
        "wiki-child",
        r#"[{"type":"paragraph"}]"#,
        &[7_u8, 7_u8],
        Some("u"),
    )
    .expect("collab");

    db.move_wiki_page_subtree(&db_path, "pm1", "wiki-child", "pm1", None, None, "u1")
        .expect("move");

    let collab = db
        .get_wiki_collab_state_for_project("pm1", "wiki-child")
        .expect("gc")
        .expect("row");
    assert_eq!(collab.0, vec![7_u8, 7_u8]);
}
