use super::{Db, DEFAULT_PROJECT_ID};

use crate::models::{
    Entity, EntityDefinition, Project, ProjectConfig, ProjectManifest, StorageData, ViewConfig, ViewType,
};

fn tmp_db_path() -> (tempfile::TempDir, String) {
    let dir = tempfile::tempdir().expect("create tempdir");
    let path = dir.path().join("keel_test.sqlite3");
    (dir, path.to_string_lossy().to_string())
}

fn manifest_named(name: &str) -> ProjectManifest {
    ProjectManifest {
        name: name.to_string(),
        entities: vec![EntityDefinition {
            id: "thing".to_string(),
            name: "Thing".to_string(),
            name_plural: "Things".to_string(),
            properties: vec![],
            default_view: Some("list".to_string()),
        }],
        views: vec![ViewConfig {
            id: "list".to_string(),
            name: "List".to_string(),
            type_: ViewType::List,
            entity_id: "thing".to_string(),
            group_by: None,
            visible_properties: vec![],
            sort_by: None,
            sort_order: None,
            column_order: None,
            hidden_columns: None,
            board_dividers: None,
        }],
        default_view: "list".to_string(),
    }
}

#[test]
fn task_key_is_project_scoped_sequential_and_not_reused() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    // Create a project with a valid projectKey.
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

    // Delete the first task; sequence must NOT be reused.
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

#[test]
fn new_db_seeds_default_state() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    let state = db.get_state().expect("get state");

    assert!(!state.projects.is_empty());
    assert!(state.projects.iter().any(|p| p.id == DEFAULT_PROJECT_ID));
    assert_eq!(state.active_project_id, DEFAULT_PROJECT_ID);
    let default = state.projects.iter().find(|p| p.id == DEFAULT_PROJECT_ID).unwrap();
    assert_eq!(default.config.manifest.name, "Task Manager");
    assert!(!default.entities.is_empty());

    // Seeded demo tasks should have taskKey assigned (DEF-1..).
    let mut task_keys: Vec<String> = default
        .entities
        .iter()
        .filter(|e| e.entity_id == "task")
        .filter_map(|e| e.properties.get("taskKey").and_then(|v| v.as_str()).map(|s| s.to_string()))
        .collect();
    assert!(!task_keys.is_empty());
    task_keys.sort();
    for (idx, key) in task_keys.iter().enumerate() {
        assert_eq!(key, &format!("DEF-{}", idx + 1));
    }

    // project_counters for default project should start after seeded tasks.
    let conn = db.pool.get().expect("get sqlite conn");
    let next_seq: i64 = conn
        .query_row(
            "SELECT next_task_seq FROM project_counters WHERE project_id = ?1",
            [DEFAULT_PROJECT_ID],
            |r| r.get(0),
        )
        .expect("select next_task_seq");
    assert_eq!(next_seq, task_keys.len() as i64 + 1);

    // Default manifest should include labels property and expose it in common views.
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
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    let entities = vec![Entity {
        id: "e1".to_string(),
        entity_id: "thing".to_string(),
        created_at: 1,
        updated_at: 2,
        properties: serde_json::json!({"title": "hello"}).as_object().cloned().unwrap_or_default(),
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
        state.projects[0].entities[0].properties.get("title").and_then(|v| v.as_str()),
        Some("hello")
    );
}

#[test]
fn project_key_lookup_resolves_project_id_and_meta() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    let p = Project {
        id: "pkey".to_string(),
        name: "Project Key".to_string(),
        project_key: Some("ABC".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![],
        config: ProjectConfig {
            manifest: manifest_named("Manifest Key"),
        },
    };
    db.replace_project_state(p).expect("insert project");

    let pid = db
        .get_project_id_by_key("abc")
        .expect("lookup by key")
        .expect("found project id");
    assert_eq!(pid, "pkey");

    let meta = db
        .get_project_meta_by_key("AbC")
        .expect("lookup meta by key")
        .expect("found meta");
    assert_eq!(meta.id, "pkey");
    assert_eq!(meta.name, "Project Key");
    assert_eq!(meta.project_key, "ABC");
}

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

#[test]
fn scm_config_and_credentials_round_trip() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    let project_id = "psc1";
    let p = Project {
        id: project_id.to_string(),
        name: "Project SCM".to_string(),
        project_key: Some("PSC".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![],
        config: ProjectConfig {
            manifest: manifest_named("Manifest SCM"),
        },
    };
    db.replace_project_state(p).expect("insert project");

    let config_json = serde_json::json!({
        "workspace": "example",
        "repo_slug": "demo",
    })
    .to_string();

    db.set_project_scm_config(project_id, "bitbucket", &config_json)
        .expect("set project scm config");
    let cfg = db
        .get_project_scm_config(project_id, "bitbucket")
        .expect("get project scm config")
        .expect("config exists");
    assert_eq!(cfg.project_id, project_id);
    assert_eq!(cfg.provider, "bitbucket");
    assert_eq!(cfg.config_json, config_json);    let user = db
        .create_local_user("user1@test.local", "editor", "dummy_hash")
        .expect("create user");
    let token_json = serde_json::json!({
        "accessToken": "token-123",
        "obtainedAt": 123
    })
    .to_string();
    db.set_user_scm_credential(&user.id, "bitbucket", &token_json)
        .expect("set user scm credential");
    let cred = db
        .get_user_scm_credential(&user.id, "bitbucket")
        .expect("get user scm credential")
        .expect("credential exists");
    assert_eq!(cred.user_id, user.id);
    assert_eq!(cred.provider, "bitbucket");
    assert_eq!(cred.token_json, token_json);
}

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

