//! Bring the destination manifest up to what the moved tasks actually use.
//!
//! Property definitions and select options are per-project, so a task moved into
//! a project whose manifest never heard of `issueType` (or of the status it sits
//! in) would keep the value but lose the column. The move therefore copies the
//! missing definitions over from the source manifest first.

use crate::models::{Entity, EntityDefinition, ProjectManifest, PropertyDefinition, PropertyType};

const TASK_ENTITY: &str = "task";

/// Properties every task carries that are never part of the manifest schema.
const INTERNAL_PROPS: [&str; 7] = [
    "taskKey",
    "previousTaskKeys",
    "__keelOrder",
    "comments",
    "attachments",
    "createdBy",
    "updatedBy",
];

/// Returns the merged manifest, or `None` when the destination already covers
/// everything the moved tasks use.
pub fn plan_task_manifest_merge(
    source: &ProjectManifest,
    dest: &ProjectManifest,
    moved: &[Entity],
) -> Option<ProjectManifest> {
    let source_task = source.entities.iter().find(|e| e.id == TASK_ENTITY);
    let mut merged = dest.clone();
    let mut changed = false;

    if !merged.entities.iter().any(|e| e.id == TASK_ENTITY) {
        let def = source_task.cloned().unwrap_or_else(default_task_definition);
        merged.entities.push(def);
        changed = true;
    }
    let dest_task = merged
        .entities
        .iter_mut()
        .find(|e| e.id == TASK_ENTITY)
        .expect("task definition present");

    for name in used_property_names(moved) {
        if dest_task.properties.iter().any(|p| p.name == name) {
            continue;
        }
        let Some(def) = source_task
            .and_then(|t| t.properties.iter().find(|p| p.name == name))
        else {
            // No definition to copy: keep the value, invent nothing.
            continue;
        };
        dest_task.properties.push(def.clone());
        changed = true;
    }

    for prop in dest_task.properties.iter_mut() {
        if !matches!(prop.type_, PropertyType::Select) {
            continue;
        }
        let Some(options) = prop.options.as_mut() else {
            continue;
        };
        for value in used_values(moved, &prop.name) {
            if options.iter().any(|o| o == &value) {
                continue;
            }
            insert_option(&prop.name, options, value);
            changed = true;
        }
    }

    if changed {
        Some(merged)
    } else {
        None
    }
}

/// `done_status_from_manifest` treats the last status option as the completed
/// one, so a new status has to land before it or the destination project's
/// readiness calculation silently changes meaning.
fn insert_option(prop_name: &str, options: &mut Vec<String>, value: String) {
    if prop_name == "status" && !options.is_empty() {
        options.insert(options.len() - 1, value);
    } else {
        options.push(value);
    }
}

fn used_property_names(moved: &[Entity]) -> Vec<String> {
    let mut names: Vec<String> = vec![];
    for entity in moved {
        for (name, value) in &entity.properties {
            if INTERNAL_PROPS.contains(&name.as_str()) || name.starts_with("__") {
                continue;
            }
            if value.is_null() {
                continue;
            }
            if !names.iter().any(|n| n == name) {
                names.push(name.clone());
            }
        }
    }
    names
}

fn used_values(moved: &[Entity], prop_name: &str) -> Vec<String> {
    let mut values: Vec<String> = vec![];
    for entity in moved {
        let Some(value) = entity.properties.get(prop_name).and_then(|v| v.as_str()) else {
            continue;
        };
        let value = value.trim();
        if value.is_empty() {
            continue;
        }
        if !values.iter().any(|v| v == value) {
            values.push(value.to_string());
        }
    }
    values
}

/// Fallback when the source manifest has no task definition either (legacy
/// projects). Mirrors the shape `defaults::default_manifest` produces.
fn default_task_definition() -> EntityDefinition {
    crate::defaults::default_manifest()
        .entities
        .into_iter()
        .find(|e| e.id == TASK_ENTITY)
        .unwrap_or(EntityDefinition {
            id: TASK_ENTITY.to_string(),
            name: "Task".to_string(),
            name_plural: "Tasks".to_string(),
            properties: vec![PropertyDefinition {
                name: "title".to_string(),
                type_: PropertyType::Text,
                options: None,
                visible: Some(true),
            }],
            default_view: None,
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mcp::task_wiki::done_status_from_manifest;
    use serde_json::{json, Map, Value};

    fn manifest(task_props: Vec<PropertyDefinition>) -> ProjectManifest {
        ProjectManifest {
            name: "M".to_string(),
            entities: vec![EntityDefinition {
                id: TASK_ENTITY.to_string(),
                name: "Task".to_string(),
                name_plural: "Tasks".to_string(),
                properties: task_props,
                default_view: None,
            }],
            views: vec![],
            default_view: "table".to_string(),
        }
    }

    fn select(name: &str, options: &[&str]) -> PropertyDefinition {
        PropertyDefinition {
            name: name.to_string(),
            type_: PropertyType::Select,
            options: Some(options.iter().map(|s| s.to_string()).collect()),
            visible: Some(true),
        }
    }

    fn text(name: &str) -> PropertyDefinition {
        PropertyDefinition {
            name: name.to_string(),
            type_: PropertyType::Text,
            options: None,
            visible: Some(true),
        }
    }

    fn task(props: Value) -> Entity {
        let mut properties = Map::new();
        if let Value::Object(map) = props {
            for (k, v) in map {
                properties.insert(k, v);
            }
        }
        Entity {
            id: "t1".to_string(),
            entity_id: TASK_ENTITY.to_string(),
            created_at: 1,
            updated_at: 1,
            properties,
        }
    }

    fn task_properties(m: &ProjectManifest) -> &[PropertyDefinition] {
        &m.entities
            .iter()
            .find(|e| e.id == TASK_ENTITY)
            .expect("task def")
            .properties
    }

    fn options_of(m: &ProjectManifest, name: &str) -> Vec<String> {
        task_properties(m)
            .iter()
            .find(|p| p.name == name)
            .and_then(|p| p.options.clone())
            .unwrap_or_default()
    }

    #[test]
    fn returns_none_when_the_destination_already_covers_everything() {
        let source = manifest(vec![text("title"), select("status", &["Todo", "Done"])]);
        let dest = manifest(vec![text("title"), select("status", &["Todo", "Done"])]);
        let moved = vec![task(json!({ "title": "A", "status": "Todo" }))];
        assert!(plan_task_manifest_merge(&source, &dest, &moved).is_none());
    }

    #[test]
    fn copies_a_missing_property_definition_with_its_options() {
        let source = manifest(vec![text("title"), select("issueType", &["Bug", "Story"])]);
        let dest = manifest(vec![text("title")]);
        let moved = vec![task(json!({ "title": "A", "issueType": "Bug" }))];

        let merged = plan_task_manifest_merge(&source, &dest, &moved).expect("merged");
        assert_eq!(options_of(&merged, "issueType"), vec!["Bug", "Story"]);
    }

    #[test]
    fn adds_a_missing_status_option_before_the_completed_one() {
        let source = manifest(vec![select(
            "status",
            &["Backlog", "Todo", "Verifying", "Done"],
        )]);
        let dest = manifest(vec![select("status", &["Backlog", "Todo", "Done"])]);
        let moved = vec![task(json!({ "status": "Verifying" }))];

        let merged = plan_task_manifest_merge(&source, &dest, &moved).expect("merged");
        assert_eq!(
            options_of(&merged, "status"),
            vec!["Backlog", "Todo", "Verifying", "Done"]
        );
        // The destination's notion of "completed" must not shift to the new option.
        assert_eq!(
            done_status_from_manifest(Some(&merged)),
            Some("Done".to_string())
        );
    }

    #[test]
    fn appends_other_missing_select_options_at_the_end() {
        let source = manifest(vec![select("priority", &["Low", "Medium", "Urgent"])]);
        let dest = manifest(vec![select("priority", &["Low", "Medium"])]);
        let moved = vec![task(json!({ "priority": "Urgent" }))];

        let merged = plan_task_manifest_merge(&source, &dest, &moved).expect("merged");
        assert_eq!(options_of(&merged, "priority"), vec!["Low", "Medium", "Urgent"]);
    }

    #[test]
    fn does_not_carry_over_options_the_moved_tasks_do_not_use() {
        let source = manifest(vec![select("priority", &["Low", "Medium", "Urgent"])]);
        let dest = manifest(vec![select("priority", &["Low"])]);
        let moved = vec![task(json!({ "priority": "Urgent" }))];

        let merged = plan_task_manifest_merge(&source, &dest, &moved).expect("merged");
        assert_eq!(options_of(&merged, "priority"), vec!["Low", "Urgent"]);
    }

    #[test]
    fn creates_the_task_definition_when_the_destination_lacks_it() {
        let source = manifest(vec![text("title"), select("status", &["Todo", "Done"])]);
        let dest = ProjectManifest {
            name: "M".to_string(),
            entities: vec![],
            views: vec![],
            default_view: "table".to_string(),
        };
        let moved = vec![task(json!({ "title": "A", "status": "Todo" }))];

        let merged = plan_task_manifest_merge(&source, &dest, &moved).expect("merged");
        assert!(task_properties(&merged).iter().any(|p| p.name == "title"));
    }

    #[test]
    fn ignores_server_managed_properties() {
        let source = manifest(vec![text("title")]);
        let dest = manifest(vec![text("title")]);
        let moved = vec![task(json!({
            "title": "A",
            "taskKey": "PM2-1",
            "previousTaskKeys": ["PM1-1"],
            "__keelOrder": 1000.0,
            "comments": [],
            "attachments": [],
            "createdBy": "u1",
            "updatedBy": "u1"
        }))];
        assert!(plan_task_manifest_merge(&source, &dest, &moved).is_none());
    }
}
