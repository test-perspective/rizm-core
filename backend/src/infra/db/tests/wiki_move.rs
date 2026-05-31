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

    let collab = db
        .get_wiki_collab_state_for_project("pm2", "wiki-root")
        .expect("gc")
        .expect("row");
    assert_eq!(collab.0, vec![9_u8, 9_u8]);

    let dst_attach = crate::api::attachments_api::attachment_path(
        &crate::api::attachments_api::attachments_root_from_db_path(&db_path),
        "pm2",
        "att1",
    );
    assert!(dst_attach.exists());
    assert!(!root_attach.exists());
}
