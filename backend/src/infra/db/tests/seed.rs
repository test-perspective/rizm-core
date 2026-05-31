use super::tmp_db_path;
use crate::infra::db::{Db, DEFAULT_PROJECT_ID};

#[test]
fn new_db_seeds_default_state() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    let state = db.get_state().expect("get state");

    assert!(!state.projects.is_empty());
    assert!(state.projects.iter().any(|p| p.id == DEFAULT_PROJECT_ID));
    assert_eq!(state.active_project_id, DEFAULT_PROJECT_ID);
    let default = state
        .projects
        .iter()
        .find(|p| p.id == DEFAULT_PROJECT_ID)
        .unwrap();
    assert_eq!(default.config.manifest.name, "Task Manager");
    assert!(!default.entities.is_empty());

    let mut task_keys: Vec<String> = default
        .entities
        .iter()
        .filter(|e| e.entity_id == "task")
        .filter_map(|e| {
            e.properties
                .get("taskKey")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .collect();
    assert!(!task_keys.is_empty());
    task_keys.sort();
    for (idx, key) in task_keys.iter().enumerate() {
        assert_eq!(key, &format!("DEF-{}", idx + 1));
    }

    let conn = db.pool.get().expect("get sqlite conn");
    let next_seq: i64 = conn
        .query_row(
            "SELECT next_task_seq FROM project_counters WHERE project_id = ?1",
            [DEFAULT_PROJECT_ID],
            |r| r.get(0),
        )
        .expect("select next_task_seq");
    assert_eq!(next_seq, task_keys.len() as i64 + 1);

    let task_def = default
        .config
        .manifest
        .entities
        .iter()
        .find(|e| e.id == "task")
        .expect("task entity definition exists");
    assert!(task_def.properties.iter().any(|p| p.name == "labels"));
    let table = default
        .config
        .manifest
        .views
        .iter()
        .find(|v| v.id == "table")
        .expect("table view exists");
    assert!(table.visible_properties.contains(&"labels".to_string()));
    assert!(state.version > 0);
}

#[test]
fn replace_state_round_trips_projects_manifests_entities_and_version() {
    use super::manifest_named;
    use crate::models::{Entity, Project, ProjectConfig, StorageData};

    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    let entities = vec![Entity {
        id: "e1".to_string(),
        entity_id: "thing".to_string(),
        created_at: 1,
        updated_at: 2,
        properties: serde_json::json!({"title": "hello"})
            .as_object()
            .cloned()
            .unwrap_or_default(),
    }];

    let p1 = Project {
        id: "p1".to_string(),
        name: "Project 1".to_string(),
        project_key: Some("P1A".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 10,
        updated_at: 11,
        entities,
        config: ProjectConfig {
            manifest: manifest_named("Manifest 1"),
        },
    };

    let data = StorageData {
        projects: vec![p1],
        active_project_id: "p1".to_string(),
        version: 123,
    };

    db.replace_state(data).expect("replace state");
    let state = db.get_state().expect("get state after replace");

    assert_eq!(state.version, 123);
    assert_eq!(state.active_project_id, "p1");
    assert_eq!(state.projects.len(), 1);
    assert_eq!(state.projects[0].config.manifest.name, "Manifest 1");
    assert_eq!(state.projects[0].entities.len(), 1);
    assert_eq!(state.projects[0].entities[0].id, "e1");
    assert_eq!(
        state.projects[0].entities[0]
            .properties
            .get("title")
            .and_then(|v| v.as_str()),
        Some("hello")
    );
}
