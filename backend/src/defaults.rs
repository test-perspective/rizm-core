use uuid::Uuid;

use crate::models::{
    Entity, EntityDefinition, ProjectManifest, PropertyDefinition, PropertyType, ViewConfig, ViewType,
};

/// Build manifest with custom status options and optional issue type options (e.g. from import).
/// backlog_status: status name for backlog column; backlog view shows only this column by default.
pub fn manifest_with_status_options(
    status_options: Vec<String>,
    backlog_status: Option<&str>,
    issue_type_options: Option<Vec<String>>,
) -> ProjectManifest {
    let mut m = default_manifest();
    if !status_options.is_empty() {
        if let Some(task) = m.entities.iter_mut().find(|e| e.id == "task") {
            if let Some(status_prop) = task.properties.iter_mut().find(|p| p.name == "status") {
                status_prop.options = Some(status_options.clone());
            }
        }
        // Backlog view: hidden_columns = all statuses except backlog (show only backlog by default)
        let backlog = backlog_status.unwrap_or("Backlog").trim();
        if !backlog.is_empty() {
            let hidden: Vec<String> = status_options
                .iter()
                .filter(|s| *s != backlog)
                .cloned()
                .collect();
            if !hidden.is_empty() {
                if let Some(backlog_view) = m.views.iter_mut().find(|v| v.id == "backlog") {
                    backlog_view.hidden_columns = Some(hidden);
                }
            }
        }
    }
    if let Some(ref opts) = issue_type_options {
        if !opts.is_empty() {
            if let Some(task) = m.entities.iter_mut().find(|e| e.id == "task") {
                if let Some(issue_type_prop) = task.properties.iter_mut().find(|p| p.name == "issueType") {
                    issue_type_prop.options = Some(opts.clone());
                }
            }
        }
    }
    m
}

pub fn default_manifest() -> ProjectManifest {
    ProjectManifest {
        name: "Task Manager".to_string(),
        entities: vec![
            EntityDefinition {
                id: "task".to_string(),
                name: "Task".to_string(),
                name_plural: "Tasks".to_string(),
                properties: vec![
                    PropertyDefinition {
                        name: "taskKey".to_string(),
                        type_: PropertyType::Text,
                        options: None,
                        visible: Some(true),
                    },
                    PropertyDefinition {
                        name: "title".to_string(),
                        type_: PropertyType::Text,
                        options: None,
                        visible: Some(true),
                    },
                    PropertyDefinition {
                        name: "status".to_string(),
                        type_: PropertyType::Select,
                        options: Some(vec!["Backlog".to_string(), "Todo".to_string(), "In Progress".to_string(), "Done".to_string()]),
                        visible: Some(true),
                    },
                    PropertyDefinition {
                        name: "issueType".to_string(),
                        type_: PropertyType::Select,
                        options: None,
                        visible: Some(true),
                    },
                    PropertyDefinition {
                        name: "priority".to_string(),
                        type_: PropertyType::Select,
                        options: Some(vec!["Low".to_string(), "Medium".to_string(), "High".to_string()]),
                        visible: Some(true),
                    },
                    PropertyDefinition {
                        name: "assigneeId".to_string(),
                        type_: PropertyType::User,
                        options: None,
                        visible: Some(true),
                    },
                    PropertyDefinition {
                        name: "Description".to_string(),
                        type_: PropertyType::Richtext,
                        options: None,
                        visible: Some(true),
                    },
                    PropertyDefinition {
                        name: "link".to_string(),
                        type_: PropertyType::Link,
                        options: None,
                        visible: Some(true),
                    },
                    PropertyDefinition {
                        name: "labels".to_string(),
                        type_: PropertyType::Labels,
                        options: None,
                        visible: Some(true),
                    },
                ],
                default_view: Some("table".to_string()),
            },
            EntityDefinition {
                id: "wikiPage".to_string(),
                name: "Notes Page".to_string(),
                name_plural: "Notes Pages".to_string(),
                properties: vec![
                    PropertyDefinition {
                        name: "title".to_string(),
                        type_: PropertyType::Text,
                        options: None,
                        visible: Some(true),
                    },
                    PropertyDefinition {
                        name: "doc".to_string(),
                        type_: PropertyType::Text,
                        options: None,
                        visible: Some(false),
                    },
                ],
                default_view: Some("wiki".to_string()),
            },
        ],
        views: vec![
            ViewConfig {
                id: "table".to_string(),
                name: "Table".to_string(),
                type_: ViewType::Table,
                entity_id: "task".to_string(),
                group_by: None,
                visible_properties: vec![
                    "taskKey".to_string(),
                    "title".to_string(),
                    "status".to_string(),
                    "priority".to_string(),
                    "assigneeId".to_string(),
                    "link".to_string(),
                    "labels".to_string(),
                ],
                sort_by: Some("createdAt".to_string()),
                sort_order: Some(crate::models::SortOrder::Desc),
                column_order: None,
                hidden_columns: None,
                board_dividers: None,
            },
            ViewConfig {
                id: "backlog".to_string(),
                name: "Backlog".to_string(),
                type_: ViewType::Board,
                entity_id: "task".to_string(),
                group_by: Some("status".to_string()),
                visible_properties: vec!["taskKey".to_string(), "title".to_string(), "priority".to_string(), "assigneeId".to_string(), "labels".to_string()],
                sort_by: None,
                sort_order: None,
                column_order: None,
                hidden_columns: Some(vec!["Todo".to_string(), "In Progress".to_string(), "Done".to_string()]),
                board_dividers: None,
            },
            ViewConfig {
                id: "board".to_string(),
                name: "Board".to_string(),
                type_: ViewType::Board,
                entity_id: "task".to_string(),
                group_by: Some("status".to_string()),
                visible_properties: vec!["title".to_string(), "priority".to_string(), "assigneeId".to_string(), "labels".to_string()],
                sort_by: None,
                sort_order: None,
                column_order: None,
                hidden_columns: Some(vec!["Backlog".to_string()]),
                board_dividers: None,
            },
            ViewConfig {
                id: "wiki".to_string(),
                name: "Notes".to_string(),
                type_: ViewType::Wiki,
                entity_id: "wikiPage".to_string(),
                group_by: None,
                visible_properties: vec!["title".to_string()],
                sort_by: Some("updatedAt".to_string()),
                sort_order: Some(crate::models::SortOrder::Desc),
                column_order: None,
                hidden_columns: None,
                board_dividers: None,
            },
        ],
        default_view: "table".to_string(),
    }
}

pub fn default_entities(now_ms: i64) -> Vec<Entity> {
    vec![
        Entity {
            id: Uuid::new_v4().to_string(),
            entity_id: "task".to_string(),
            created_at: now_ms - 3_600_000,
            updated_at: now_ms - 3_600_000,
            properties: serde_json::json!({
              "title": "Build the Keel prototype",
              "status": "In Progress",
              "priority": "High"
            })
            .as_object()
            .cloned()
            .unwrap_or_default(),
        },
        Entity {
            id: Uuid::new_v4().to_string(),
            entity_id: "task".to_string(),
            created_at: now_ms - 7_200_000,
            updated_at: now_ms - 7_200_000,
            properties: serde_json::json!({
              "title": "Design the manifest structure",
              "status": "Done",
              "priority": "High"
            })
            .as_object()
            .cloned()
            .unwrap_or_default(),
        },
        Entity {
            id: Uuid::new_v4().to_string(),
            entity_id: "task".to_string(),
            created_at: now_ms - 1_800_000,
            updated_at: now_ms - 1_800_000,
            properties: serde_json::json!({
              "title": "Test AI transformation feature",
              "status": "Backlog",
              "priority": "Medium"
            })
            .as_object()
            .cloned()
            .unwrap_or_default(),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_manifest_has_expected_shape() {
        let m = default_manifest();
        assert_eq!(m.name, "Task Manager");
        assert_eq!(m.default_view, "table");

        // entities
        assert_eq!(m.entities.len(), 2);
        assert_eq!(m.entities[0].id, "task");
        assert_eq!(m.entities[0].name, "Task");
        assert_eq!(m.entities[0].name_plural, "Tasks");
        assert_eq!(m.entities[0].default_view.as_deref(), Some("table"));
        assert_eq!(m.entities[1].id, "wikiPage");
        assert_eq!(m.entities[1].name, "Notes Page");
        assert_eq!(m.entities[1].name_plural, "Notes Pages");
        assert_eq!(m.entities[1].default_view.as_deref(), Some("wiki"));

        // properties
        assert_eq!(m.entities[0].properties.len(), 9);
        let names: Vec<_> = m.entities[0].properties.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(
            names,
            vec!["taskKey", "title", "status", "issueType", "priority", "assigneeId", "Description", "link", "labels"]
        );

        // views
        assert_eq!(m.views.len(), 4);
        let table = m.views.iter().find(|v| v.id == "table").expect("table view exists");
        assert!(matches!(table.type_, ViewType::Table));
        assert!(table.visible_properties.contains(&"labels".to_string()));
        assert_eq!(table.sort_by.as_deref(), Some("createdAt"));
        assert!(matches!(table.sort_order, Some(crate::models::SortOrder::Desc)));

        let board = m.views.iter().find(|v| v.id == "board").expect("board view exists");
        assert!(matches!(board.type_, ViewType::Board));
        assert_eq!(board.group_by.as_deref(), Some("status"));
        assert!(board.visible_properties.contains(&"labels".to_string()));

        let backlog = m.views.iter().find(|v| v.id == "backlog").expect("backlog view exists");
        assert!(matches!(backlog.type_, ViewType::Board));
        assert_eq!(backlog.group_by.as_deref(), Some("status"));
        assert!(backlog.visible_properties.contains(&"taskKey".to_string()));
        assert!(backlog.visible_properties.contains(&"labels".to_string()));

        let wiki = m.views.iter().find(|v| v.id == "wiki").expect("wiki view exists");
        assert!(matches!(wiki.type_, ViewType::Wiki));
        assert_eq!(wiki.entity_id, "wikiPage");
        assert_eq!(wiki.sort_by.as_deref(), Some("updatedAt"));
        assert!(matches!(wiki.sort_order, Some(crate::models::SortOrder::Desc)));
        assert!(wiki.visible_properties.contains(&"title".to_string()));
    }

    #[test]
    fn manifest_with_status_options_sets_backlog_hidden_and_issue_types() {
        let status_opts = vec!["Backlog".to_string(), "To Do".to_string(), "Done".to_string()];
        let issue_opts = vec!["Task".to_string(), "Story".to_string(), "Bug".to_string()];
        let m = manifest_with_status_options(status_opts, Some("Backlog"), Some(issue_opts));
        // Backlog view: only Backlog visible (To Do, Done hidden)
        let backlog = m.views.iter().find(|v| v.id == "backlog").expect("backlog view");
        let hidden: std::collections::HashSet<&str> = backlog
            .hidden_columns
            .as_deref()
            .unwrap_or(&[])
            .iter()
            .map(|s| s.as_str())
            .collect();
        assert!(hidden.contains("To Do"));
        assert!(hidden.contains("Done"));
        assert!(!hidden.contains("Backlog"));
        // issueType options
        let task = m.entities.iter().find(|e| e.id == "task").expect("task entity");
        let issue_type = task.properties.iter().find(|p| p.name == "issueType").expect("issueType prop");
        let opts = issue_type.options.as_deref().expect("issueType has options");
        assert_eq!(opts, ["Task", "Story", "Bug"]);
    }

    #[test]
    fn default_entities_have_expected_properties_and_timestamps() {
        let now = 10_000_000_i64;
        let es = default_entities(now);
        assert_eq!(es.len(), 3);

        for e in &es {
            assert!(!e.id.trim().is_empty());
            assert!(e.created_at <= now);
            assert!(e.updated_at <= now);
            assert!(e.properties.contains_key("title"));
            assert!(e.properties.contains_key("status"));
            assert!(e.properties.contains_key("priority"));
        }

        // Ensure offsets were applied (created_at != now for seeded data)
        assert!(es.iter().any(|e| e.created_at != now));
    }
}
