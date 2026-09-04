use serde_json::{json, Value as JsonValue};

use super::{admin_user, app_state, tmp_db};
use crate::ai_tools::tool_exec_wiki::list_wiki_pages;

fn make_project_with_key(db: &crate::db::Db, id: &str, key: &str) {
    let project = crate::models::Project {
        id: id.to_string(),
        name: id.to_string(),
        project_key: Some(key.to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![],
        config: crate::models::ProjectConfig {
            manifest: crate::defaults::default_manifest(),
        },
    };
    db.replace_project_state(project).expect("replace");
}

#[test]
fn list_wiki_pages_returns_pages_without_doc() {
    let (_dir, db) = tmp_db();
    make_project_with_key(&db, "p1", "P1A");
    db.create_entity_for_project(
        "p1",
        Some("w1"),
        "wikiPage",
        json!({
            "title": "AIA listed page",
            "doc": "SHOULD_NOT_APPEAR_IN_LIST",
            "__keelOrder": 1000
        })
        .as_object()
        .cloned()
        .unwrap_or_default(),
    )
    .expect("create wiki");
    let state = app_state(db);
    let user = admin_user();

    let raw = list_wiki_pages(&state, &user, &json!({ "projectId": "p1" }))
        .expect("list_wiki_pages");
    assert!(
        !raw.contains("SHOULD_NOT_APPEAR_IN_LIST"),
        "AIA list must omit page body: {raw}"
    );
    let parsed: JsonValue = serde_json::from_str(&raw).expect("parse");
    assert_eq!(parsed.get("totalCount").and_then(|c| c.as_i64()), Some(1));
    let pages = parsed
        .get("pages")
        .and_then(|v| v.as_array())
        .expect("pages");
    assert_eq!(pages.len(), 1);
    assert_eq!(
        pages[0].get("title").and_then(|t| t.as_str()),
        Some("AIA listed page")
    );
    assert!(pages[0].get("doc").is_none());
}
