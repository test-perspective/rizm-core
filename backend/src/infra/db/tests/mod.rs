//! `db` integration-style tests. Split by topic (task keys, manifest history, scm, wiki, ...).

use crate::models::{EntityDefinition, ProjectManifest, ViewConfig, ViewType};

pub(super) fn tmp_db_path() -> (tempfile::TempDir, String) {
    let dir = tempfile::tempdir().expect("create tempdir");
    let path = dir.path().join("keel_test.sqlite3");
    (dir, path.to_string_lossy().to_string())
}

pub(super) fn manifest_named(name: &str) -> ProjectManifest {
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

mod concurrent_entity_write;
mod manifest_history;
mod project_key_lookup;
mod scm;
mod seed;
mod task_keys;
mod wiki_collab;
mod wiki_move;
