//! Cross-project task move (REQ-309).

use serde_json::{json, Map, Value};

use super::{manifest_named, tmp_db_path};
use crate::infra::db::Db;
use crate::models::{Entity, Project, ProjectConfig};

fn task(id: &str, key: &str, title: &str, extra: Value) -> Entity {
    let mut properties = Map::new();
    properties.insert("taskKey".to_string(), json!(key));
    properties.insert("title".to_string(), json!(title));
    properties.insert("status".to_string(), json!("Todo"));
    if let Value::Object(map) = extra {
        for (k, v) in map {
            properties.insert(k, v);
        }
    }
    Entity {
        id: id.to_string(),
        entity_id: "task".to_string(),
        created_at: 1,
        updated_at: 1,
        properties,
    }
}

fn project(id: &str, key: &str, entities: Vec<Entity>) -> Project {
    Project {
        id: id.to_string(),
        name: id.to_uppercase(),
        project_key: Some(key.to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities,
        config: ProjectConfig {
            manifest: manifest_named(id),
        },
    }
}

/// Source project `pm1` (key `PM1`) plus an empty destination `pm2` (key `PM2`).
fn seed(db: &Db, source_entities: Vec<Entity>) {
    db.replace_project_state(project("pm1", "PM1", source_entities))
        .expect("seed source");
    db.replace_project_state(project("pm2", "PM2", vec![]))
        .expect("seed dest");
}

fn props_of(db: &Db, project_id: &str, id: &str) -> Map<String, Value> {
    db.get_entity_for_project(project_id, id)
        .expect("get entity")
        .unwrap_or_else(|| panic!("{id} not found in {project_id}"))
        .properties
}

fn string_list(props: &Map<String, Value>, key: &str) -> Vec<String> {
    props
        .get(key)
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn attachment_file(db_path: &str, project_id: &str, attachment_id: &str) -> std::path::PathBuf {
    crate::api::attachments_api::attachment_path(
        &crate::api::attachments_api::attachments_root_from_db_path(db_path),
        project_id,
        attachment_id,
    )
}

fn write_attachment(db_path: &str, project_id: &str, attachment_id: &str, body: &[u8]) {
    let path = attachment_file(db_path, project_id, attachment_id);
    std::fs::create_dir_all(path.parent().expect("parent")).expect("mkdir attachments");
    std::fs::write(&path, body).expect("write attachment");
}

fn next_task_seq(db: &Db, project_id: &str) -> i64 {
    // Exercised through the public counter behaviour: creating a task consumes
    // the next sequence number, so its key reveals the counter value.
    let e = db
        .create_entity_for_project(project_id, None, "task", Map::new())
        .expect("create probe task");
    let key = e.properties["taskKey"].as_str().expect("taskKey").to_string();
    let seq: i64 = key.rsplit_once('-').expect("key").1.parse().expect("seq");
    seq
}

#[test]
fn move_single_task_rekeys_and_records_previous_key() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    seed(&db, vec![task("t1", "PM1-7", "Move me", json!({}))]);

    let outcome = db
        .move_tasks_to_project(&db_path, "pm1", &["t1".to_string()], "pm2", "u1")
        .expect("move");

    assert_eq!(outcome.moved.len(), 1);
    assert_eq!(outcome.moved[0].previous_task_key, "PM1-7");
    assert_eq!(outcome.moved[0].task_key, "PM2-1");
    assert_eq!(outcome.moved[0].title, "Move me");

    assert!(
        db.get_entity_for_project("pm1", "t1").expect("get").is_none(),
        "task must not remain in the source project"
    );
    let moved = props_of(&db, "pm2", "t1");
    assert_eq!(moved["taskKey"], json!("PM2-1"));
    assert_eq!(string_list(&moved, "previousTaskKeys"), vec!["PM1-7"]);
    assert_eq!(moved["updatedBy"], json!("u1"));

    // The destination counter moved past the key that was just handed out.
    assert_eq!(next_task_seq(&db, "pm2"), 2);
}

#[test]
fn move_parent_moves_descendants_and_rewrites_internal_relations() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    seed(
        &db,
        vec![
            task("t1", "PM1-1", "Parent", json!({})),
            task(
                "t2",
                "PM1-2",
                "Child",
                json!({ "parentTaskKey": "PM1-1", "blockedBy": ["PM1-1"] }),
            ),
            task("t3", "PM1-3", "Grandchild", json!({ "parentTaskKey": "PM1-2" })),
        ],
    );

    let outcome = db
        .move_tasks_to_project(&db_path, "pm1", &["t1".to_string()], "pm2", "u1")
        .expect("move");

    assert_eq!(outcome.moved.len(), 3, "descendants move with the parent");
    // Parents are numbered before their children.
    assert_eq!(props_of(&db, "pm2", "t1")["taskKey"], json!("PM2-1"));
    assert_eq!(props_of(&db, "pm2", "t2")["taskKey"], json!("PM2-2"));
    assert_eq!(props_of(&db, "pm2", "t3")["taskKey"], json!("PM2-3"));

    let child = props_of(&db, "pm2", "t2");
    assert_eq!(child["parentTaskKey"], json!("PM2-1"));
    assert_eq!(string_list(&child, "blockedBy"), vec!["PM2-1"]);
    assert_eq!(props_of(&db, "pm2", "t3")["parentTaskKey"], json!("PM2-2"));

    assert!(
        outcome.detached.is_empty(),
        "nothing crosses projects, so nothing is detached: {:?}",
        outcome.detached
    );
}

#[test]
fn move_detaches_relations_to_tasks_left_behind() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    seed(
        &db,
        vec![
            task("t1", "PM1-1", "Moving", json!({ "blockedBy": ["PM1-2"] })),
            task(
                "t2",
                "PM1-2",
                "Staying",
                json!({ "blockedBy": ["PM1-1"], "link": ["PM1-1"] }),
            ),
        ],
    );

    let outcome = db
        .move_tasks_to_project(&db_path, "pm1", &["t1".to_string()], "pm2", "u1")
        .expect("move");

    // The moved task drops the reference it can no longer hold.
    let moved = props_of(&db, "pm2", "t1");
    assert!(string_list(&moved, "blockedBy").is_empty());

    // And so does the task left behind, in both directions.
    let stayed = props_of(&db, "pm1", "t2");
    assert!(string_list(&stayed, "blockedBy").is_empty());
    assert!(string_list(&stayed, "link").is_empty());

    let mut reported: Vec<(String, String, Vec<String>)> = outcome
        .detached
        .iter()
        .map(|d| (d.task_key.clone(), d.property.clone(), d.removed_keys.clone()))
        .collect();
    reported.sort();
    assert_eq!(
        reported,
        vec![
            ("PM1-2".to_string(), "blockedBy".to_string(), vec!["PM1-1".to_string()]),
            ("PM1-2".to_string(), "link".to_string(), vec!["PM1-1".to_string()]),
            ("PM2-1".to_string(), "blockedBy".to_string(), vec!["PM1-2".to_string()]),
        ]
    );

    // The task left behind is re-indexed so search reflects the cleaned relations.
    assert!(outcome
        .index_upserts
        .iter()
        .any(|(pid, e)| pid == "pm1" && e.id == "t2"));
    assert_eq!(outcome.index_deletes, vec![("pm1".to_string(), "t1".to_string())]);
}

#[test]
fn move_clears_parent_when_the_parent_stays_behind() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    seed(
        &db,
        vec![
            task("t1", "PM1-1", "Parent", json!({})),
            task("t2", "PM1-2", "Child", json!({ "parentTaskKey": "PM1-1" })),
        ],
    );

    let outcome = db
        .move_tasks_to_project(&db_path, "pm1", &["t2".to_string()], "pm2", "u1")
        .expect("move");

    assert_eq!(outcome.moved.len(), 1);
    let moved = props_of(&db, "pm2", "t2");
    assert!(
        !moved.contains_key("parentTaskKey"),
        "cross-project parent link must be dropped"
    );
    assert_eq!(
        outcome.detached[0].removed_keys,
        vec!["PM1-1".to_string()],
        "the dropped parent is reported"
    );
}

#[test]
fn move_detaches_every_parent_key_when_the_link_input_left_several() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    // The detail panel's link input can store more than one parentTaskKey even
    // though everything that validates it expects a single key.
    seed(
        &db,
        vec![
            task("t1", "PM1-1", "Moving parent", json!({})),
            task("t2", "PM1-2", "Staying parent", json!({})),
            task(
                "t3",
                "PM1-3",
                "Child of both",
                json!({ "parentTaskKey": ["PM1-1", "PM1-2"] }),
            ),
        ],
    );

    let outcome = db
        .move_tasks_to_project(&db_path, "pm1", &["t1".to_string()], "pm2", "u1")
        .expect("move");

    assert_eq!(outcome.moved.len(), 2, "the child follows its first parent");
    let child = props_of(&db, "pm2", "t3");
    assert_eq!(
        child["parentTaskKey"],
        json!("PM2-1"),
        "the parent that moved is re-pointed and the one left behind is dropped"
    );
    assert!(outcome
        .detached
        .iter()
        .any(|d| d.property == "parentTaskKey" && d.removed_keys == vec!["PM1-2".to_string()]));
}

#[test]
fn move_batch_assigns_sequential_keys_and_bumps_counter_once() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    seed(
        &db,
        vec![
            task("t1", "PM1-1", "A", json!({})),
            task("t2", "PM1-2", "B", json!({})),
            task("t3", "PM1-3", "C", json!({})),
        ],
    );

    db.move_tasks_to_project(
        &db_path,
        "pm1",
        &["t1".to_string(), "t2".to_string(), "t3".to_string()],
        "pm2",
        "u1",
    )
    .expect("move");

    assert_eq!(props_of(&db, "pm2", "t1")["taskKey"], json!("PM2-1"));
    assert_eq!(props_of(&db, "pm2", "t2")["taskKey"], json!("PM2-2"));
    assert_eq!(props_of(&db, "pm2", "t3")["taskKey"], json!("PM2-3"));
    assert_eq!(next_task_seq(&db, "pm2"), 4);
}

#[test]
fn move_selecting_an_ancestor_and_a_descendant_does_not_duplicate() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    seed(
        &db,
        vec![
            task("t1", "PM1-1", "Parent", json!({})),
            task("t2", "PM1-2", "Child", json!({ "parentTaskKey": "PM1-1" })),
        ],
    );

    let outcome = db
        .move_tasks_to_project(
            &db_path,
            "pm1",
            &["t1".to_string(), "t2".to_string()],
            "pm2",
            "u1",
        )
        .expect("move");

    assert_eq!(outcome.moved.len(), 2);
    assert_eq!(props_of(&db, "pm2", "t2")["parentTaskKey"], json!("PM2-1"));
}

#[test]
fn move_rewrites_attachment_urls_and_relocates_the_files() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    let doc = json!([{
        "type": "image",
        "props": { "url": "/api/projects/pm1/entities/t1/attachments/att1" }
    }])
    .to_string();
    let comment_body = json!([{
        "type": "paragraph",
        "content": [{ "type": "link", "href": "/api/projects/pm1/entities/t1/attachments/att1" }]
    }])
    .to_string();

    seed(
        &db,
        vec![task(
            "t1",
            "PM1-1",
            "With attachment",
            json!({
                "Description": doc,
                "comments": [{ "id": "c1", "body": comment_body }],
                "attachments": [{ "id": "att1", "fileName": "x.png", "size": 1, "createdAt": 1 }]
            }),
        )],
    );
    write_attachment(&db_path, "pm1", "att1", b"blob");

    db.move_tasks_to_project(&db_path, "pm1", &["t1".to_string()], "pm2", "u1")
        .expect("move");

    let moved = props_of(&db, "pm2", "t1");
    let description = moved["Description"].as_str().expect("Description");
    assert!(
        description.contains("/api/projects/pm2/entities/t1/attachments/att1"),
        "description URL not rewritten: {description}"
    );
    assert!(!description.contains("/api/projects/pm1/"));
    let comments = moved["comments"].to_string();
    assert!(
        comments.contains("/api/projects/pm2/entities/t1/attachments/att1"),
        "comment URL not rewritten: {comments}"
    );
    assert!(!comments.contains("/api/projects/pm1/"));

    assert!(attachment_file(&db_path, "pm2", "att1").exists());
    assert!(!attachment_file(&db_path, "pm1", "att1").exists());
}

#[test]
fn move_rewrites_task_link_nodes_that_point_inside_the_moved_set() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    let doc = json!([{
        "type": "paragraph",
        "content": [
            { "type": "taskLink", "props": { "taskKey": "PM1-2" } },
            { "type": "taskLink", "props": { "taskKey": "PM1-9" } }
        ]
    }])
    .to_string();

    seed(
        &db,
        vec![
            task("t1", "PM1-1", "Parent", json!({ "Description": doc })),
            task("t2", "PM1-2", "Child", json!({ "parentTaskKey": "PM1-1" })),
            task("t9", "PM1-9", "Outsider", json!({})),
        ],
    );

    db.move_tasks_to_project(&db_path, "pm1", &["t1".to_string()], "pm2", "u1")
        .expect("move");

    let description = props_of(&db, "pm2", "t1")["Description"]
        .as_str()
        .expect("Description")
        .to_string();
    assert!(
        description.contains("PM2-2"),
        "link to a moved task must follow it: {description}"
    );
    assert!(
        description.contains("PM1-9"),
        "link to a task left behind is untouched: {description}"
    );
}

#[test]
fn move_transfers_entity_external_ids() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    seed(&db, vec![task("t1", "PM1-1", "Imported", json!({}))]);
    db.upsert_entity_external_id("pm1", "t1", "jira", "10001", Some("JRA-1"))
        .expect("seed external id");

    db.move_tasks_to_project(&db_path, "pm1", &["t1".to_string()], "pm2", "u1")
        .expect("move");

    assert_eq!(
        db.get_entity_id_by_external("pm2", "jira", "10001")
            .expect("lookup dest"),
        Some("t1".to_string())
    );
    assert_eq!(
        db.get_entity_id_by_external("pm1", "jira", "10001")
            .expect("lookup source"),
        None
    );
}

#[test]
fn move_registers_an_alias_resolvable_by_the_old_key() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    seed(&db, vec![task("t1", "PM1-4", "Move me", json!({}))]);

    db.move_tasks_to_project(&db_path, "pm1", &["t1".to_string()], "pm2", "u1")
        .expect("move");

    let (project, entity) = db
        .resolve_task_by_alias("pm1-4")
        .expect("resolve")
        .expect("alias hit");
    assert_eq!(project.id, "pm2");
    assert_eq!(project.project_key, "PM2");
    assert_eq!(entity.id, "t1");
    assert_eq!(entity.properties["taskKey"], json!("PM2-1"));

    assert!(db.resolve_task_by_alias("PM1-99").expect("resolve").is_none());
}

#[test]
fn move_back_and_forth_keeps_every_old_key_resolvable() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    seed(&db, vec![]);
    // Created through the normal path so the source counter exists, as in production.
    let created = db
        .create_entity_for_project("pm1", Some("t1"), "task", Map::new())
        .expect("create task");
    assert_eq!(created.properties["taskKey"], json!("PM1-1"));

    db.move_tasks_to_project(&db_path, "pm1", &["t1".to_string()], "pm2", "u1")
        .expect("move out");
    db.move_tasks_to_project(&db_path, "pm2", &["t1".to_string()], "pm1", "u1")
        .expect("move back");

    let props = props_of(&db, "pm1", "t1");
    assert_eq!(
        string_list(&props, "previousTaskKeys"),
        vec!["PM1-1", "PM2-1"]
    );
    // The counter never rewinds, so the task comes back under a fresh number.
    assert_eq!(props["taskKey"], json!("PM1-2"));

    for old in ["PM1-1", "PM2-1"] {
        let (project, entity) = db
            .resolve_task_by_alias(old)
            .expect("resolve")
            .unwrap_or_else(|| panic!("{old} should resolve"));
        assert_eq!(project.id, "pm1");
        assert_eq!(entity.id, "t1");
    }
}

#[test]
fn move_never_reissues_a_key_an_existing_destination_task_holds() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    db.replace_project_state(project("pm1", "PM1", vec![task("t1", "PM1-1", "A", json!({}))]))
        .expect("seed source");
    // Restored state keeps the tasks but not the counter row.
    db.replace_project_state(project(
        "pm2",
        "PM2",
        vec![task("e1", "PM2-1", "Existing", json!({}))],
    ))
    .expect("seed dest");

    db.move_tasks_to_project(&db_path, "pm1", &["t1".to_string()], "pm2", "u1")
        .expect("move");

    assert_eq!(props_of(&db, "pm2", "t1")["taskKey"], json!("PM2-2"));
    assert_eq!(props_of(&db, "pm2", "e1")["taskKey"], json!("PM2-1"));
}

#[test]
fn move_survives_a_parent_cycle_in_broken_data() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    seed(
        &db,
        vec![
            task("t1", "PM1-1", "A", json!({ "parentTaskKey": "PM1-2" })),
            task("t2", "PM1-2", "B", json!({ "parentTaskKey": "PM1-1" })),
        ],
    );

    let outcome = db
        .move_tasks_to_project(&db_path, "pm1", &["t1".to_string()], "pm2", "u1")
        .expect("move");

    assert_eq!(outcome.moved.len(), 2, "the cycle is walked once, not forever");
    assert_eq!(props_of(&db, "pm2", "t1")["parentTaskKey"], json!("PM2-2"));
    assert_eq!(props_of(&db, "pm2", "t2")["parentTaskKey"], json!("PM2-1"));
}

#[test]
fn move_rejects_invalid_requests() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    seed(
        &db,
        vec![
            task("t1", "PM1-1", "A", json!({})),
            Entity {
                id: "w1".to_string(),
                entity_id: "wikiPage".to_string(),
                created_at: 1,
                updated_at: 1,
                properties: Map::new(),
            },
        ],
    );

    let cases: Vec<(&str, &str, Vec<String>, &str)> = vec![
        ("same project", "pm1", vec!["t1".to_string()], "pm1"),
        ("empty selection", "pm1", vec![], "pm2"),
        ("unknown task", "pm1", vec!["nope".to_string()], "pm2"),
        ("not a task", "pm1", vec!["w1".to_string()], "pm2"),
        ("unknown destination", "pm1", vec!["t1".to_string()], "pm404"),
    ];
    for (label, source, ids, dest) in cases {
        assert!(
            db.move_tasks_to_project(&db_path, source, &ids, dest, "u1")
                .is_err(),
            "{label} should be rejected"
        );
    }

    // The rejected attempts left the task exactly where it was.
    assert_eq!(props_of(&db, "pm1", "t1")["taskKey"], json!("PM1-1"));
}

#[test]
fn move_rolls_back_and_cleans_up_copied_files_when_a_blob_collides() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    seed(
        &db,
        vec![task(
            "t1",
            "PM1-1",
            "Two attachments",
            json!({
                "attachments": [
                    { "id": "att1", "fileName": "a.png", "size": 1, "createdAt": 1 },
                    { "id": "att2", "fileName": "b.png", "size": 1, "createdAt": 1 }
                ]
            }),
        )],
    );
    write_attachment(&db_path, "pm1", "att1", b"source-a");
    write_attachment(&db_path, "pm1", "att2", b"source-b");
    // Something already occupies the second destination slot.
    write_attachment(&db_path, "pm2", "att2", b"dest-b");

    let err = db
        .move_tasks_to_project(&db_path, "pm1", &["t1".to_string()], "pm2", "u1")
        .expect_err("collision must abort the move");
    assert!(
        err.to_string().contains("already exists"),
        "unexpected error: {err}"
    );

    // Nothing moved.
    assert_eq!(props_of(&db, "pm1", "t1")["taskKey"], json!("PM1-1"));
    assert!(db.get_entity_for_project("pm2", "t1").expect("get").is_none());
    // Source blobs are intact and the half-finished copy is gone.
    assert_eq!(
        std::fs::read(attachment_file(&db_path, "pm1", "att1")).expect("source a"),
        b"source-a"
    );
    assert!(
        !attachment_file(&db_path, "pm2", "att1").exists(),
        "the copy made before the collision must be cleaned up"
    );
    assert_eq!(
        std::fs::read(attachment_file(&db_path, "pm2", "att2")).expect("dest b"),
        b"dest-b"
    );
}

#[test]
fn move_puts_tasks_at_the_end_of_the_destination_order() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");
    db.replace_project_state(project(
        "pm1",
        "PM1",
        vec![task("t1", "PM1-1", "Incoming", json!({ "__keelOrder": 10.0 }))],
    ))
    .expect("seed source");
    db.replace_project_state(project(
        "pm2",
        "PM2",
        vec![task("e1", "PM2-1", "Existing", json!({ "__keelOrder": 5000.0 }))],
    ))
    .expect("seed dest");

    db.move_tasks_to_project(&db_path, "pm1", &["t1".to_string()], "pm2", "u1")
        .expect("move");

    let moved_order = props_of(&db, "pm2", "t1")["__keelOrder"]
        .as_f64()
        .expect("order");
    assert!(
        moved_order > 5000.0,
        "moved task should sort after the existing ones, got {moved_order}"
    );
}
