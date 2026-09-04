use super::{manifest_named, tmp_db_path};
use crate::infra::db::Db;
use crate::models::{Entity, Project, ProjectConfig};

#[test]
fn wiki_collab_state_upsert_and_read_round_trip() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    let p = Project {
        id: "pcollab".to_string(),
        name: "Project Collab".to_string(),
        project_key: Some("PCB".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![Entity {
            id: "wiki-1".to_string(),
            entity_id: "wikiPage".to_string(),
            created_at: 1,
            updated_at: 1,
            properties: serde_json::json!({
                "title": "Page 1",
                "doc": "[{\"type\":\"paragraph\",\"content\":[],\"children\":[]}]"
            })
            .as_object()
            .cloned()
            .unwrap_or_default(),
        }],
        config: ProjectConfig {
            manifest: manifest_named("Manifest Collab"),
        },
    };
    db.replace_project_state(p).expect("insert project");

    let blob = vec![1_u8, 2_u8, 3_u8, 4_u8];
    let updated = db
        .upsert_wiki_collab_state_for_project(
            "pcollab",
            "wiki-1",
            "[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"hello\"}],\"children\":[]}]",
            &blob,
            Some("user-1"),
        )
        .expect("upsert collab");
    assert_eq!(updated.entity_id, "wikiPage");
    assert_eq!(
        updated.properties.get("updatedBy").and_then(|v| v.as_str()),
        Some("user-1")
    );

    let row = db
        .get_wiki_collab_state_for_project("pcollab", "wiki-1")
        .expect("read collab row")
        .expect("collab row exists");
    assert_eq!(row.0, blob);
    assert!(row.1.contains("hello"));
}

// REQ-315 regression: the editor renders from the CRDT blob when present,
// so a doc replacement must delete the collab row or the update stays invisible.
#[test]
fn replace_wiki_doc_replaces_doc_and_drops_collab_state() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    let p = Project {
        id: "pcollab".to_string(),
        name: "Project Collab".to_string(),
        project_key: Some("PCB".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![Entity {
            id: "wiki-1".to_string(),
            entity_id: "wikiPage".to_string(),
            created_at: 1,
            updated_at: 1,
            properties: serde_json::json!({
                "title": "Page 1",
                "doc": "[{\"type\":\"paragraph\",\"content\":[],\"children\":[]}]"
            })
            .as_object()
            .cloned()
            .unwrap_or_default(),
        }],
        config: ProjectConfig {
            manifest: manifest_named("Manifest Collab"),
        },
    };
    db.replace_project_state(p).expect("insert project");

    db.upsert_wiki_collab_state_for_project(
        "pcollab",
        "wiki-1",
        "[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"stale\"}],\"children\":[]}]",
        &[1_u8, 2, 3, 4],
        Some("user-1"),
    )
    .expect("upsert collab");

    let new_doc =
        "[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"fresh\"}],\"children\":[]}]";
    let updated = db
        .replace_wiki_doc_for_project("pcollab", "wiki-1", new_doc, Some("user-2"))
        .expect("replace doc");

    assert_eq!(updated.entity_id, "wikiPage");
    assert_eq!(
        updated.properties.get("doc").and_then(|v| v.as_str()),
        Some(new_doc)
    );
    assert_eq!(
        updated.properties.get("updatedBy").and_then(|v| v.as_str()),
        Some("user-2")
    );

    let stored = db
        .get_entity_for_project("pcollab", "wiki-1")
        .expect("read entity")
        .expect("entity exists");
    assert_eq!(
        stored.properties.get("doc").and_then(|v| v.as_str()),
        Some(new_doc)
    );

    let collab = db
        .get_wiki_collab_state_for_project("pcollab", "wiki-1")
        .expect("read collab row");
    assert!(
        collab.is_none(),
        "collab state must be dropped so the editor re-seeds from doc"
    );
}

#[test]
fn replace_wiki_doc_rejects_non_wiki_entities() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    let p = Project {
        id: "pcollab".to_string(),
        name: "Project Collab".to_string(),
        project_key: Some("PCB".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![Entity {
            id: "task-1".to_string(),
            entity_id: "task".to_string(),
            created_at: 1,
            updated_at: 1,
            properties: serde_json::json!({"title": "Task"})
                .as_object()
                .cloned()
                .unwrap_or_default(),
        }],
        config: ProjectConfig {
            manifest: manifest_named("Manifest Collab"),
        },
    };
    db.replace_project_state(p).expect("insert project");

    let err = db
        .replace_wiki_doc_for_project("pcollab", "task-1", "[]", None)
        .unwrap_err();
    assert!(format!("{err}").contains("not wikiPage"));

    let err = db
        .replace_wiki_doc_for_project("pcollab", "missing", "[]", None)
        .unwrap_err();
    assert!(format!("{err}").contains("not found"));
}
