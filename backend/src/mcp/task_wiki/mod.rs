//! Shared task and wiki tools for MCP and AI Tools.

mod project;
mod task_relations;
mod task_relations_view;
mod task_write;
mod task_write_fields;
mod task_write_input;
mod tasks;
#[cfg(test)]
mod tests_relations;
mod wiki;

pub use project::resolve_project;
pub use task_relations_view::{derive_relations, done_status_from_manifest, DerivedRelations};
pub use task_write::{create_task_for_user, update_task_for_user};
pub use task_write_input::{TaskCreateInput, TaskUpdateInput};
pub use tasks::{list_tasks_for_user, search_tasks_for_user};
pub use wiki::{
    create_wiki_page_for_user, get_wiki_page_for_user, list_wiki_pages_for_user,
    search_wiki_for_user, update_wiki_page_for_user,
};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_state::{AppState, AuthConfig, LoginLimiter};
    use crate::auth::Role;
    use crate::db::Db;
    use crate::defaults::default_manifest;
    use crate::models::{Project, ProjectConfig};
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn tmp_state(project_id: &str, project_key: &str) -> (tempfile::TempDir, AppState) {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("test.sqlite3");
        let db = Db::new(path.to_string_lossy().as_ref()).expect("db");
        let project = Project {
            id: project_id.to_string(),
            name: "Test".to_string(),
            project_key: Some(project_key.to_string()),
            lifecycle_status: Some("ready".to_string()),
            created_at: 1,
            updated_at: 1,
            entities: vec![],
            config: ProjectConfig {
                manifest: default_manifest(),
            },
        };
        db.replace_project_state(project).expect("replace");
        let state = AppState {
            db: Arc::new(RwLock::new(db)),
            db_path: path.to_string_lossy().to_string(),
            service_gate: Arc::new(tokio::sync::RwLock::new(())),
            auth: AuthConfig::default(),
            login_limiter: Arc::new(LoginLimiter::new()),
            indexer_debounce: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
        };
        (dir, state)
    }

    fn admin_user() -> crate::auth::AuthedUser {
        crate::auth::AuthedUser {
            user_id: "u1".to_string(),
            email: "admin@example.local".to_string(),
            role: Role::Admin,
            last_login_at: None,
            session_id: "s1".to_string(),
        }
    }

    fn viewer_user() -> crate::auth::AuthedUser {
        crate::auth::AuthedUser {
            user_id: "u2".to_string(),
            email: "viewer@example.local".to_string(),
            role: Role::Viewer,
            last_login_at: None,
            session_id: "s2".to_string(),
        }
    }

    fn create_wiki_entity(state: &AppState, id: &str, title: &str, doc: &str) {
        state
            .db
            .blocking_read()
            .create_entity_for_project(
                "p1",
                Some(id),
                "wikiPage",
                serde_json::json!({"title": title, "doc": doc})
                    .as_object()
                    .cloned()
                    .unwrap_or_default(),
            )
            .expect("create wiki");
    }

    fn wiki_doc_blocks(state: &AppState, id: &str) -> Vec<serde_json::Value> {
        let doc = state
            .db
            .blocking_read()
            .get_entity_for_project("p1", id)
            .expect("get entity")
            .expect("entity exists")
            .properties
            .get("doc")
            .and_then(|v| v.as_str())
            .expect("doc")
            .to_string();
        serde_json::from_str(&doc).expect("doc json")
    }

    #[test]
    fn list_tasks_returns_tasks() {
        let (_dir, state) = tmp_state("p1", "P1A");
        state
            .db
            .blocking_read()
            .create_entity_for_project(
                "p1",
                Some("t1"),
                "task",
                serde_json::json!({"title": "Task 1"})
                    .as_object()
                    .cloned()
                    .unwrap_or_default(),
            )
            .expect("create task");
        let user = admin_user();

        let out = list_tasks_for_user(&state, &user, Some("P1A"), None, 10).expect("list_tasks");
        let v: serde_json::Value = serde_json::from_str(&out).expect("parse");
        let total_count = v
            .get("totalCount")
            .and_then(|c| c.as_i64())
            .expect("totalCount");
        assert_eq!(total_count, 1);
        let tasks = v
            .get("tasks")
            .and_then(|t| t.as_array())
            .expect("tasks array");
        assert_eq!(tasks.len(), 1);
        assert_eq!(
            tasks[0].get("taskKey").and_then(|k| k.as_str()),
            Some("P1A-1")
        );
    }

    #[test]
    fn list_tasks_total_count_exceeds_limit() {
        let (_dir, state) = tmp_state("p1", "P1A");
        for i in 1..=5 {
            state
                .db
                .blocking_read()
                .create_entity_for_project(
                    "p1",
                    Some(&format!("t{i}")),
                    "task",
                    serde_json::json!({"title": format!("Task {i}")})
                        .as_object()
                        .cloned()
                        .unwrap_or_default(),
                )
                .expect("create task");
        }
        let user = admin_user();
        let out = list_tasks_for_user(&state, &user, Some("P1A"), None, 2).expect("list_tasks");
        let v: serde_json::Value = serde_json::from_str(&out).expect("parse");
        let total_count = v
            .get("totalCount")
            .and_then(|c| c.as_i64())
            .expect("totalCount");
        assert_eq!(total_count, 5);
        let tasks = v
            .get("tasks")
            .and_then(|t| t.as_array())
            .expect("tasks array");
        assert_eq!(tasks.len(), 2);
    }

    #[test]
    fn list_tasks_requires_project() {
        let (_dir, state) = tmp_state("p1", "P1A");
        let user = admin_user();
        let err = list_tasks_for_user(&state, &user, None, None, 10).unwrap_err();
        assert!(format!("{err}").contains("projectKey or projectId"));
    }

    #[test]
    fn search_tasks_by_labels_requires_project() {
        let (_dir, state) = tmp_state("p1", "P1A");
        let user = admin_user();
        let err = search_tasks_for_user(
            &state,
            &user,
            None,
            None,
            None,
            Some(&["bug".to_string()]),
            None,
            None,
            10,
        )
        .unwrap_err();
        assert!(format!("{err}").contains("projectKey or projectId"));
    }

    #[test]
    fn search_tasks_by_labels_filters() {
        let (_dir, state) = tmp_state("p1", "P1A");
        state
            .db
            .blocking_read()
            .create_entity_for_project(
                "p1",
                Some("t1"),
                "task",
                serde_json::json!({
                    "title": "Bug fix",
                    "labels": ["bug", "urgent"],
                    "status": "In Progress"
                })
                .as_object()
                .cloned()
                .unwrap_or_default(),
            )
            .expect("create task");
        state
            .db
            .blocking_read()
            .create_entity_for_project(
                "p1",
                Some("t2"),
                "task",
                serde_json::json!({
                    "title": "Feature",
                    "labels": ["feature"],
                    "status": "Todo"
                })
                .as_object()
                .cloned()
                .unwrap_or_default(),
            )
            .expect("create task");
        let user = admin_user();

        let out = search_tasks_for_user(
            &state,
            &user,
            None,
            Some("P1A"),
            None,
            Some(&["bug".to_string()]),
            None,
            None,
            10,
        )
        .expect("search");
        let v: serde_json::Value = serde_json::from_str(&out).expect("parse");
        let results = v
            .get("results")
            .and_then(|r| r.as_array())
            .expect("results");
        assert_eq!(results.len(), 1);
        assert_eq!(
            results[0].get("title").and_then(|t| t.as_str()),
            Some("Bug fix")
        );
    }

    #[test]
    fn get_wiki_page_by_page_id() {
        let (_dir, state) = tmp_state("p1", "P1A");
        state
            .db
            .blocking_read()
            .create_entity_for_project(
                "p1",
                Some("w1"),
                "wikiPage",
                serde_json::json!({"title": "My Wiki", "doc": "[{\"type\":\"paragraph\"}]"})
                    .as_object()
                    .cloned()
                    .unwrap_or_default(),
            )
            .expect("create wiki");
        let user = admin_user();

        let out = get_wiki_page_for_user(&state, &user, Some("P1A"), None, Some("w1"), None)
            .expect("get_wiki_page");
        let v: serde_json::Value = serde_json::from_str(&out).expect("parse");
        let page = v.get("page").expect("page");
        assert_eq!(page.get("title").and_then(|t| t.as_str()), Some("My Wiki"));
        assert_eq!(page.get("id").and_then(|i| i.as_str()), Some("w1"));
    }

    fn insert_wiki(state: &AppState, id: &str, props: serde_json::Value) {
        state
            .db
            .blocking_read()
            .create_entity_for_project(
                "p1",
                Some(id),
                "wikiPage",
                props.as_object().cloned().unwrap_or_default(),
            )
            .expect("create wiki");
    }

    #[test]
    fn list_wiki_pages_returns_pages_in_order() {
        let (_dir, state) = tmp_state("p1", "P1A");
        insert_wiki(
            &state,
            "w3",
            serde_json::json!({"title": "Third", "__keelOrder": 3000}),
        );
        insert_wiki(
            &state,
            "w1",
            serde_json::json!({"title": "First", "__keelOrder": 1000}),
        );
        insert_wiki(
            &state,
            "w2",
            serde_json::json!({"title": "Second", "__keelOrder": 2000}),
        );
        let user = admin_user();

        let out = list_wiki_pages_for_user(&state, &user, Some("P1A"), None, 10)
            .expect("list_wiki_pages");
        let v: serde_json::Value = serde_json::from_str(&out).expect("parse");
        assert_eq!(v.get("totalCount").and_then(|c| c.as_i64()), Some(3));
        assert_eq!(v.get("projectKey").and_then(|k| k.as_str()), Some("P1A"));
        let pages = v.get("pages").and_then(|p| p.as_array()).expect("pages");
        assert_eq!(pages.len(), 3);
        let titles: Vec<&str> = pages
            .iter()
            .filter_map(|p| p.get("title").and_then(|t| t.as_str()))
            .collect();
        assert_eq!(titles, vec!["First", "Second", "Third"]);
        assert_eq!(pages[0].get("order").and_then(|o| o.as_i64()), Some(1000));
    }

    #[test]
    fn list_wiki_pages_omits_doc_body() {
        let (_dir, state) = tmp_state("p1", "P1A");
        const SECRET: &str = "UNIQUE_DOC_BODY_SHOULD_NOT_LEAK";
        insert_wiki(
            &state,
            "w1",
            serde_json::json!({
                "title": "Secret page",
                "doc": SECRET,
                "__keelOrder": 1000
            }),
        );
        let user = admin_user();

        let out = list_wiki_pages_for_user(&state, &user, Some("P1A"), None, 10)
            .expect("list_wiki_pages");
        assert!(
            !out.contains(SECRET),
            "list output must not include page body: {out}"
        );
        let v: serde_json::Value = serde_json::from_str(&out).expect("parse");
        let page = &v.get("pages").and_then(|p| p.as_array()).expect("pages")[0];
        assert!(page.get("doc").is_none());
        assert_eq!(page.get("title").and_then(|t| t.as_str()), Some("Secret page"));
    }

    #[test]
    fn list_wiki_pages_includes_folder_and_parent() {
        let (_dir, state) = tmp_state("p1", "P1A");
        insert_wiki(
            &state,
            "folder1",
            serde_json::json!({
                "title": "Notes",
                "nodeType": "folder",
                "__keelOrder": 1000
            }),
        );
        insert_wiki(
            &state,
            "child1",
            serde_json::json!({
                "title": "Child note",
                "nodeType": "page",
                "parentId": "folder1",
                "__keelOrder": 2000
            }),
        );
        let user = admin_user();

        let out = list_wiki_pages_for_user(&state, &user, Some("P1A"), None, 10)
            .expect("list_wiki_pages");
        let v: serde_json::Value = serde_json::from_str(&out).expect("parse");
        let pages = v.get("pages").and_then(|p| p.as_array()).expect("pages");
        let folder = pages
            .iter()
            .find(|p| p.get("id").and_then(|i| i.as_str()) == Some("folder1"))
            .expect("folder");
        assert_eq!(folder.get("nodeType").and_then(|t| t.as_str()), Some("folder"));
        assert!(folder.get("parentId").and_then(|v| v.as_str()).is_none());
        let child = pages
            .iter()
            .find(|p| p.get("id").and_then(|i| i.as_str()) == Some("child1"))
            .expect("child");
        assert_eq!(child.get("nodeType").and_then(|t| t.as_str()), Some("page"));
        assert_eq!(
            child.get("parentId").and_then(|i| i.as_str()),
            Some("folder1")
        );
    }

    #[test]
    fn list_wiki_pages_total_count_exceeds_limit() {
        let (_dir, state) = tmp_state("p1", "P1A");
        for i in 1..=5 {
            insert_wiki(
                &state,
                &format!("w{i}"),
                serde_json::json!({
                    "title": format!("Page {i}"),
                    "__keelOrder": i * 1000
                }),
            );
        }
        let user = admin_user();
        let out = list_wiki_pages_for_user(&state, &user, Some("P1A"), None, 2)
            .expect("list_wiki_pages");
        let v: serde_json::Value = serde_json::from_str(&out).expect("parse");
        assert_eq!(v.get("totalCount").and_then(|c| c.as_i64()), Some(5));
        let pages = v.get("pages").and_then(|p| p.as_array()).expect("pages");
        assert_eq!(pages.len(), 2);
        assert_eq!(
            pages[0].get("title").and_then(|t| t.as_str()),
            Some("Page 1")
        );
    }

    #[test]
    fn list_wiki_pages_requires_project() {
        let (_dir, state) = tmp_state("p1", "P1A");
        let user = admin_user();
        let err = list_wiki_pages_for_user(&state, &user, None, None, 10).unwrap_err();
        assert!(format!("{err}").contains("projectKey or projectId"));
    }

    #[tokio::test]
    async fn create_wiki_page_creates_with_title_and_content() {
        let (_dir, state) = tmp_state("p1", "P1A");
        let user = admin_user();

        let out = tokio::task::spawn_blocking({
            let state = state.clone();
            let user = user.clone();
            move || {
                create_wiki_page_for_user(
                    &state,
                    &user,
                    Some("P1A"),
                    None,
                    "Investigation Results",
                    Some("# Summary\n\n- Finding 1\n- Finding 2\n\n| Name | Value |\n| --- | --- |\n| alpha | 1 |"),
                )
            }
        })
        .await
        .expect("join")
        .expect("create_wiki_page");
        let v: serde_json::Value = serde_json::from_str(&out).expect("parse");
        assert!(v.get("pageId").and_then(|i| i.as_str()).is_some());
        assert_eq!(
            v.get("title").and_then(|t| t.as_str()),
            Some("Investigation Results")
        );

        let entities = state
            .db
            .read()
            .await
            .list_entities_for_project("p1")
            .expect("list");
        let wiki: Vec<_> = entities
            .into_iter()
            .filter(|e| e.entity_id == "wikiPage")
            .collect();
        assert_eq!(wiki.len(), 1);
        assert_eq!(
            wiki[0].properties.get("title").and_then(|v| v.as_str()),
            Some("Investigation Results")
        );
        let doc = wiki[0]
            .properties
            .get("doc")
            .and_then(|v| v.as_str())
            .expect("doc");
        let blocks: Vec<serde_json::Value> = serde_json::from_str(doc).expect("doc json");
        assert!(!blocks.is_empty());
        assert_eq!(
            blocks[0].get("type").and_then(|v| v.as_str()),
            Some("heading")
        );
        assert!(
            blocks
                .iter()
                .any(|b| b.get("type").and_then(|v| v.as_str()) == Some("table")),
            "MCP-created wiki markdown table should be stored as BlockNote table: {doc}"
        );
    }

    #[tokio::test]
    async fn create_wiki_page_creates_empty_page_without_content() {
        let (_dir, state) = tmp_state("p1", "P1A");
        let user = admin_user();

        let out = tokio::task::spawn_blocking({
            let state = state.clone();
            let user = user.clone();
            move || create_wiki_page_for_user(&state, &user, Some("P1A"), None, "Empty Page", None)
        })
        .await
        .expect("join")
        .expect("create_wiki_page");
        let v: serde_json::Value = serde_json::from_str(&out).expect("parse");
        assert!(v.get("pageId").and_then(|i| i.as_str()).is_some());
        assert_eq!(v.get("title").and_then(|t| t.as_str()), Some("Empty Page"));

        let entities = state
            .db
            .read()
            .await
            .list_entities_for_project("p1")
            .expect("list");
        let wiki: Vec<_> = entities
            .into_iter()
            .filter(|e| e.entity_id == "wikiPage")
            .collect();
        assert_eq!(wiki.len(), 1);
        assert_eq!(
            wiki[0].properties.get("doc").and_then(|v| v.as_str()),
            Some("[]")
        );
    }

    #[test]
    fn add_comment_converts_markdown_table_for_task_comments() {
        let (_dir, state) = tmp_state("p1", "P1A");
        state
            .db
            .blocking_read()
            .create_entity_for_project(
                "p1",
                Some("t1"),
                "task",
                serde_json::json!({
                    "taskKey": "P1A-1",
                    "title": "Task 1"
                })
                .as_object()
                .cloned()
                .unwrap_or_default(),
            )
            .expect("create task");
        let user = admin_user();

        crate::mcp::tools::add_comment_for_target(
            &state,
            &user,
            &serde_json::json!({
                "taskKey": "P1A-1",
                "text": "| Name | Value |\n| --- | --- |\n| alpha | 1 |"
            }),
        )
        .expect("add_comment");

        let entities = state
            .db
            .blocking_read()
            .list_entities_for_project("p1")
            .expect("list");
        let task = entities.into_iter().find(|e| e.id == "t1").expect("task");
        let comments = task
            .properties
            .get("comments")
            .and_then(|v| v.as_array())
            .expect("comments");
        let doc = comments[0]
            .get("doc")
            .and_then(|v| v.as_str())
            .expect("doc");
        let blocks: Vec<serde_json::Value> = serde_json::from_str(doc).expect("doc json");
        assert_eq!(
            blocks[0].get("type").and_then(|v| v.as_str()),
            Some("table")
        );
        assert_eq!(
            blocks[0]["content"]["rows"][1]["cells"][0]["content"][0]["text"].as_str(),
            Some("alpha")
        );
    }

    #[test]
    fn create_wiki_page_requires_project() {
        let (_dir, state) = tmp_state("p1", "P1A");
        let user = admin_user();

        let err = create_wiki_page_for_user(&state, &user, None, None, "Title", None).unwrap_err();
        assert!(format!("{err}").contains("projectKey or projectId"));
    }

    #[test]
    fn create_wiki_page_requires_title() {
        let (_dir, state) = tmp_state("p1", "P1A");
        let user = admin_user();

        let err =
            create_wiki_page_for_user(&state, &user, Some("P1A"), None, "", None).unwrap_err();
        assert!(format!("{err}").contains("title"));
    }

    #[tokio::test]
    async fn update_wiki_page_replace_swaps_whole_body() {
        let (_dir, state) = tmp_state("p1", "P1A");
        tokio::task::spawn_blocking({
            let state = state.clone();
            move || {
                create_wiki_entity(
                    &state,
                    "w1",
                    "Progress",
                    "[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"old body\",\"styles\":{}}],\"children\":[]}]",
                );
                let user = admin_user();

                let out = update_wiki_page_for_user(
                    &state,
                    &user,
                    Some("P1A"),
                    None,
                    Some("w1"),
                    None,
                    "# New Heading\n\n| Name | Value |\n| --- | --- |\n| alpha | 1 |",
                    None,
                )
                .expect("update");
                let v: serde_json::Value = serde_json::from_str(&out).expect("parse");
                assert_eq!(v.get("pageId").and_then(|i| i.as_str()), Some("w1"));
                assert_eq!(v.get("mode").and_then(|m| m.as_str()), Some("replace"));

                let blocks = wiki_doc_blocks(&state, "w1");
                assert_eq!(
                    blocks[0].get("type").and_then(|v| v.as_str()),
                    Some("heading")
                );
                assert!(
                    blocks
                        .iter()
                        .any(|b| b.get("type").and_then(|v| v.as_str()) == Some("table")),
                    "markdown table should become a BlockNote table: {blocks:?}"
                );
                let serialized = serde_json::to_string(&blocks).expect("serialize");
                assert!(
                    !serialized.contains("old body"),
                    "replace must drop the previous body: {serialized}"
                );
            }
        })
        .await
        .expect("join");
    }

    #[tokio::test]
    async fn update_wiki_page_append_keeps_existing_blocks() {
        let (_dir, state) = tmp_state("p1", "P1A");
        tokio::task::spawn_blocking({
            let state = state.clone();
            move || {
                create_wiki_entity(
                    &state,
                    "w1",
                    "Progress",
                    "[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"existing intro\",\"styles\":{}}],\"children\":[]}]",
                );
                let user = admin_user();

                update_wiki_page_for_user(
                    &state,
                    &user,
                    Some("P1A"),
                    None,
                    Some("w1"),
                    None,
                    "## Update 2\n\n- done",
                    Some("append"),
                )
                .expect("append");

                let blocks = wiki_doc_blocks(&state, "w1");
                assert!(
                    blocks.len() >= 3,
                    "expected old + appended blocks: {blocks:?}"
                );
                assert_eq!(
                    blocks[0]["content"][0]["text"].as_str(),
                    Some("existing intro"),
                    "existing blocks must be preserved"
                );
                assert_eq!(
                    blocks[1].get("type").and_then(|v| v.as_str()),
                    Some("heading"),
                    "appended markdown should follow existing blocks"
                );
            }
        })
        .await
        .expect("join");
    }

    #[tokio::test]
    async fn update_wiki_page_drops_collab_state() {
        let (_dir, state) = tmp_state("p1", "P1A");
        tokio::task::spawn_blocking({
            let state = state.clone();
            move || {
                create_wiki_entity(&state, "w1", "Progress", "[]");
                state
                    .db
                    .blocking_read()
                    .upsert_wiki_collab_state_for_project(
                        "p1",
                        "w1",
                        "[]",
                        &[1_u8, 2, 3],
                        Some("u1"),
                    )
                    .expect("upsert collab");
                let user = admin_user();

                update_wiki_page_for_user(
                    &state,
                    &user,
                    Some("P1A"),
                    None,
                    Some("w1"),
                    None,
                    "fresh",
                    None,
                )
                .expect("update");

                let collab = state
                    .db
                    .blocking_read()
                    .get_wiki_collab_state_for_project("p1", "w1")
                    .expect("read collab");
                assert!(
                    collab.is_none(),
                    "CRDT snapshot must be dropped so the editor re-seeds from doc"
                );
            }
        })
        .await
        .expect("join");
    }

    #[tokio::test]
    async fn update_wiki_page_resolves_by_title_and_rejects_ambiguous() {
        let (_dir, state) = tmp_state("p1", "P1A");
        tokio::task::spawn_blocking({
            let state = state.clone();
            move || {
                create_wiki_entity(&state, "w1", "Unique Page", "[]");
                create_wiki_entity(&state, "w2", "Dup", "[]");
                create_wiki_entity(&state, "w3", "Dup", "[]");
                let user = admin_user();

                let out = update_wiki_page_for_user(
                    &state,
                    &user,
                    Some("P1A"),
                    None,
                    None,
                    Some("Unique Page"),
                    "by title",
                    None,
                )
                .expect("update by title");
                let v: serde_json::Value = serde_json::from_str(&out).expect("parse");
                assert_eq!(v.get("pageId").and_then(|i| i.as_str()), Some("w1"));

                let err = update_wiki_page_for_user(
                    &state,
                    &user,
                    Some("P1A"),
                    None,
                    None,
                    Some("Dup"),
                    "text",
                    None,
                )
                .unwrap_err();
                assert!(format!("{err}").contains("ambiguous"));

                let err = update_wiki_page_for_user(
                    &state,
                    &user,
                    Some("P1A"),
                    None,
                    None,
                    Some("Missing"),
                    "text",
                    None,
                )
                .unwrap_err();
                assert!(format!("{err}").contains("not found"));
            }
        })
        .await
        .expect("join");
    }

    #[test]
    fn update_wiki_page_rejects_invalid_mode_and_empty_content() {
        let (_dir, state) = tmp_state("p1", "P1A");
        create_wiki_entity(&state, "w1", "Page", "[]");
        let user = admin_user();

        let err = update_wiki_page_for_user(
            &state,
            &user,
            Some("P1A"),
            None,
            Some("w1"),
            None,
            "text",
            Some("prepend"),
        )
        .unwrap_err();
        assert!(format!("{err}").contains("invalid mode"));

        let err = update_wiki_page_for_user(
            &state,
            &user,
            Some("P1A"),
            None,
            Some("w1"),
            None,
            "  ",
            None,
        )
        .unwrap_err();
        assert!(format!("{err}").contains("content is required"));
    }

    #[test]
    fn update_wiki_page_requires_write_permission() {
        let (_dir, state) = tmp_state("p1", "P1A");
        create_wiki_entity(&state, "w1", "Page", "[]");
        let user = viewer_user();

        let err = update_wiki_page_for_user(
            &state,
            &user,
            Some("P1A"),
            None,
            Some("w1"),
            None,
            "text",
            None,
        )
        .unwrap_err();
        assert!(format!("{err}").contains("insufficient permissions"));
    }

    async fn create_task_with_labels(state: &AppState, labels: &[&str]) {
        state
            .db
            .write()
            .await
            .create_entity_for_project(
                "p1",
                Some("t1"),
                "task",
                serde_json::json!({
                    "title": "Label Task",
                    "labels": labels
                })
                .as_object()
                .cloned()
                .unwrap_or_default(),
            )
            .expect("create task");
    }

    async fn task_labels_async(state: &AppState) -> Vec<String> {
        state
            .db
            .read()
            .await
            .list_entities_for_project("p1")
            .expect("list")
            .into_iter()
            .find(|e| e.properties.get("taskKey").and_then(|v| v.as_str()) == Some("P1A-1"))
            .expect("task")
            .properties
            .get("labels")
            .and_then(|v| v.as_array())
            .expect("labels")
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect()
    }

    #[tokio::test]
    async fn update_task_add_labels_preserves_existing() {
        let (_dir, state) = tmp_state("p1", "P1A");
        create_task_with_labels(&state, &["alpha", "beta"]).await;
        let user = admin_user();

        tokio::task::spawn_blocking({
            let state = state.clone();
            let user = user.clone();
            move || {
                update_task_for_user(
                    &state,
                    &user,
                    TaskUpdateInput {
                        task_key: "P1A-1".to_string(),
                        add_labels: Some(vec![
                            "gamma".to_string(),
                            "  ".to_string(),
                            "gamma".to_string(),
                        ]),
                        ..Default::default()
                    },
                )
            }
        })
        .await
        .expect("join")
        .expect("update");

        assert_eq!(task_labels_async(&state).await, vec!["alpha", "beta", "gamma"]);
    }

    #[tokio::test]
    async fn update_task_remove_labels_keeps_others() {
        let (_dir, state) = tmp_state("p1", "P1A");
        create_task_with_labels(&state, &["alpha", "beta", "gamma"]).await;
        let user = admin_user();

        tokio::task::spawn_blocking({
            let state = state.clone();
            let user = user.clone();
            move || {
                update_task_for_user(
                    &state,
                    &user,
                    TaskUpdateInput {
                        task_key: "P1A-1".to_string(),
                        remove_labels: Some(vec!["beta".to_string()]),
                        ..Default::default()
                    },
                )
            }
        })
        .await
        .expect("join")
        .expect("update");

        assert_eq!(task_labels_async(&state).await, vec!["alpha", "gamma"]);
    }

    #[tokio::test]
    async fn update_task_labels_replace_then_add_and_remove() {
        let (_dir, state) = tmp_state("p1", "P1A");
        create_task_with_labels(&state, &["old"]).await;
        let user = admin_user();

        tokio::task::spawn_blocking({
            let state = state.clone();
            let user = user.clone();
            move || {
                update_task_for_user(
                    &state,
                    &user,
                    TaskUpdateInput {
                        task_key: "P1A-1".to_string(),
                        labels: Some(vec!["base".to_string()]),
                        add_labels: Some(vec!["extra".to_string()]),
                        remove_labels: Some(vec!["base".to_string()]),
                        ..Default::default()
                    },
                )
            }
        })
        .await
        .expect("join")
        .expect("update");

        assert_eq!(task_labels_async(&state).await, vec!["extra"]);
    }

    #[test]
    fn update_task_add_labels_noop_when_already_present() {
        let (_dir, state) = tmp_state("p1", "P1A");
        state
            .db
            .blocking_read()
            .create_entity_for_project(
                "p1",
                Some("t1"),
                "task",
                serde_json::json!({
                    "title": "Label Task",
                    "labels": ["alpha"]
                })
                .as_object()
                .cloned()
                .unwrap_or_default(),
            )
            .expect("create task");
        let user = admin_user();

        let err = update_task_for_user(
            &state,
            &user,
            TaskUpdateInput {
                task_key: "P1A-1".to_string(),
                add_labels: Some(vec!["alpha".to_string()]),
                ..Default::default()
            },
        )
        .unwrap_err();
        assert!(format!("{err}").contains("no task fields to update"));
    }
}
