//! Shared task and wiki tools for MCP and AI Tools.

mod project;
mod task_write;
mod tasks;
mod wiki;

pub use project::resolve_project;
pub use task_write::{create_task_for_user, update_task_for_user};
pub use tasks::{list_tasks_for_user, search_tasks_for_user};
pub use wiki::{create_wiki_page_for_user, get_wiki_page_for_user, search_wiki_for_user};

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
}
