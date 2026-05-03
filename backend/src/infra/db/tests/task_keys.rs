use super::{manifest_named, tmp_db_path};
use crate::infra::db::Db;
use crate::models::{Project, ProjectConfig};

#[test]
fn task_key_is_project_scoped_sequential_and_not_reused() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    let p = Project {
        id: "pseq".to_string(),
        name: "Project Seq".to_string(),
        project_key: Some("ABC".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![],
        config: ProjectConfig {
            manifest: manifest_named("Manifest Seq"),
        },
    };
    db.replace_project_state(p).expect("insert project");

    let empty_props: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();
    let e1 = db
        .create_entity_for_project("pseq", None, "task", empty_props.clone())
        .expect("create task 1");
    let e2 = db
        .create_entity_for_project("pseq", None, "task", empty_props.clone())
        .expect("create task 2");

    assert_eq!(
        e1.properties.get("taskKey").and_then(|v| v.as_str()),
        Some("ABC-1")
    );
    assert_eq!(
        e2.properties.get("taskKey").and_then(|v| v.as_str()),
        Some("ABC-2")
    );

    db.delete_entity_for_project("pseq", &e1.id, e1.updated_at)
        .expect("delete task 1");

    let e3 = db
        .create_entity_for_project("pseq", None, "task", empty_props)
        .expect("create task 3");
    assert_eq!(
        e3.properties.get("taskKey").and_then(|v| v.as_str()),
        Some("ABC-3")
    );
}
