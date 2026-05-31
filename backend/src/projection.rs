use std::collections::{BTreeMap, HashMap};

use serde::Serialize;
use serde_json::Value;

use crate::models::{Entity, ProjectManifest, SortOrder, ViewType};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectionResponse {
    pub view_id: String,
    #[serde(rename = "type")]
    pub type_: ViewType,
    pub data: ProjectedData,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ProjectedData {
    List {
        visible_properties: Vec<String>,
        entities: Vec<Entity>,
    },
    Board {
        group_by: String,
        columns: Vec<BoardColumn>,
    },
    Table {
        visible_properties: Vec<String>,
        entities: Vec<Entity>,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardColumn {
    pub key: String,
    pub entities: Vec<Entity>,
}

pub fn project(
    manifest: &ProjectManifest,
    entities: &[Entity],
    view_id: &str,
) -> Option<ProjectionResponse> {
    let view = manifest.views.iter().find(|v| v.id == view_id)?;
    let _entity_def = manifest.entities.iter().find(|e| e.id == view.entity_id)?;
    let mut list: Vec<Entity> = entities
        .iter()
        .cloned()
        .filter(|e| e.entity_id == view.entity_id)
        .collect();

    match view.type_ {
        ViewType::List => {
            sort_entities(&mut list, view.sort_by.as_deref(), view.sort_order.as_ref());
            Some(ProjectionResponse {
                view_id: view_id.to_string(),
                type_: ViewType::List,
                data: ProjectedData::List {
                    visible_properties: view.visible_properties.clone(),
                    entities: list,
                },
            })
        }
        ViewType::Table => {
            sort_entities(&mut list, view.sort_by.as_deref(), view.sort_order.as_ref());
            Some(ProjectionResponse {
                view_id: view_id.to_string(),
                type_: ViewType::Table,
                data: ProjectedData::Table {
                    visible_properties: view.visible_properties.clone(),
                    entities: list,
                },
            })
        }
        ViewType::Board => {
            let group_by = view
                .group_by
                .clone()
                .unwrap_or_else(|| "status".to_string());
            let ordered_keys = manifest
                .entities
                .iter()
                .find(|e| e.id == view.entity_id)
                .and_then(|e| e.properties.iter().find(|p| p.name == group_by))
                .and_then(|p| p.options.clone())
                .unwrap_or_default();

            let mut buckets: HashMap<String, Vec<Entity>> = HashMap::new();
            for e in list {
                let key = value_to_key(e.properties.get(&group_by))
                    .unwrap_or_else(|| "Uncategorized".to_string());
                buckets.entry(key).or_default().push(e);
            }

            // Stable output: respect select options first, then remaining keys sorted.
            let mut columns: Vec<BoardColumn> = Vec::new();
            for k in ordered_keys {
                if let Some(mut es) = buckets.remove(&k) {
                    sort_entities_for_board(&mut es);
                    columns.push(BoardColumn {
                        key: k,
                        entities: es,
                    });
                } else {
                    columns.push(BoardColumn {
                        key: k,
                        entities: vec![],
                    });
                }
            }

            let mut rest: BTreeMap<String, Vec<Entity>> = BTreeMap::new();
            for (k, mut es) in buckets {
                sort_entities_for_board(&mut es);
                rest.insert(k, es);
            }
            for (k, es) in rest {
                columns.push(BoardColumn {
                    key: k,
                    entities: es,
                });
            }

            Some(ProjectionResponse {
                view_id: view_id.to_string(),
                type_: ViewType::Board,
                data: ProjectedData::Board { group_by, columns },
            })
        }
        ViewType::Wiki => {
            // Wiki is essentially a list of pages; project it the same way as list
            // so the endpoint remains usable even for wiki views.
            sort_entities(&mut list, view.sort_by.as_deref(), view.sort_order.as_ref());
            Some(ProjectionResponse {
                view_id: view_id.to_string(),
                type_: ViewType::Wiki,
                data: ProjectedData::List {
                    visible_properties: view.visible_properties.clone(),
                    entities: list,
                },
            })
        }
    }
}

/// Sort entities for board columns: __keelOrder ascending, then updatedAt desc, then id.
fn sort_entities_for_board(es: &mut [Entity]) {
    es.sort_by(|a, b| {
        let ao = a.properties.get("__keelOrder").and_then(|v| v.as_f64());
        let bo = b.properties.get("__keelOrder").and_then(|v| v.as_f64());
        let use_order = |x: &f64| x.is_finite();
        match (ao.filter(use_order), bo.filter(use_order)) {
            (Some(ao), Some(bo)) => {
                let ord = ao.partial_cmp(&bo).unwrap_or(std::cmp::Ordering::Equal);
                if ord != std::cmp::Ordering::Equal {
                    return ord;
                }
            }
            (Some(_), None) => return std::cmp::Ordering::Less,
            (None, Some(_)) => return std::cmp::Ordering::Greater,
            _ => {}
        }
        if a.updated_at != b.updated_at {
            return b.updated_at.cmp(&a.updated_at);
        }
        a.id.cmp(&b.id)
    });
}

fn sort_entities(list: &mut [Entity], sort_by: Option<&str>, sort_order: Option<&SortOrder>) {
    let sort_by = sort_by.unwrap_or("createdAt");
    let desc = matches!(sort_order, Some(SortOrder::Desc)) || sort_order.is_none();

    list.sort_by(|a, b| {
        let ka = sort_key(a, sort_by);
        let kb = sort_key(b, sort_by);
        let ord = cmp_value(&ka, &kb);
        if desc {
            ord.reverse()
        } else {
            ord
        }
    });
}

fn sort_key(e: &Entity, sort_by: &str) -> Value {
    match sort_by {
        "createdAt" => Value::from(e.created_at),
        "updatedAt" => Value::from(e.updated_at),
        "id" => Value::from(e.id.clone()),
        other => e.properties.get(other).cloned().unwrap_or(Value::Null),
    }
}

fn cmp_value(a: &Value, b: &Value) -> std::cmp::Ordering {
    use std::cmp::Ordering;
    match (a, b) {
        (Value::Number(na), Value::Number(nb)) => na
            .as_f64()
            .partial_cmp(&nb.as_f64())
            .unwrap_or(Ordering::Equal),
        (Value::String(sa), Value::String(sb)) => sa.cmp(sb),
        (Value::Bool(ba), Value::Bool(bb)) => ba.cmp(bb),
        (Value::Null, Value::Null) => Ordering::Equal,
        (Value::Null, _) => Ordering::Less,
        (_, Value::Null) => Ordering::Greater,
        _ => a.to_string().cmp(&b.to_string()),
    }
}

fn value_to_key(v: Option<&Value>) -> Option<String> {
    match v? {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        Value::Null => None,
        other => Some(other.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        EntityDefinition, ProjectManifest, PropertyDefinition, PropertyType, SortOrder, ViewConfig,
        ViewType,
    };

    fn entity(
        id: &str,
        created_at: i64,
        updated_at: i64,
        props: serde_json::Value,
    ) -> crate::models::Entity {
        crate::models::Entity {
            id: id.to_string(),
            entity_id: "e".to_string(),
            created_at,
            updated_at,
            properties: props.as_object().cloned().unwrap_or_default(),
        }
    }

    #[test]
    fn list_projection_sorts_desc_by_default() {
        let manifest = ProjectManifest {
            name: "m".to_string(),
            entities: vec![EntityDefinition {
                id: "e".to_string(),
                name: "E".to_string(),
                name_plural: "Es".to_string(),
                properties: vec![],
                default_view: Some("list".to_string()),
            }],
            views: vec![ViewConfig {
                id: "list".to_string(),
                name: "List".to_string(),
                type_: ViewType::List,
                entity_id: "e".to_string(),
                group_by: None,
                visible_properties: vec!["title".to_string()],
                sort_by: Some("createdAt".to_string()),
                sort_order: Some(SortOrder::Desc),
                column_order: None,
                hidden_columns: None,
                board_dividers: None,
            }],
            default_view: "list".to_string(),
        };

        let entities = vec![
            entity("a", 1, 1, serde_json::json!({"title": "A"})),
            entity("b", 3, 3, serde_json::json!({"title": "B"})),
            entity("c", 2, 2, serde_json::json!({"title": "C"})),
        ];

        let resp = project(&manifest, &entities, "list").expect("projection exists");
        match resp.data {
            ProjectedData::List { entities, .. } => {
                let ids: Vec<_> = entities.into_iter().map(|e| e.id).collect();
                assert_eq!(ids, vec!["b", "c", "a"]);
            }
            _ => panic!("expected list projection"),
        }
    }

    #[test]
    fn board_projection_respects_select_option_order_and_sorts_within_columns() {
        let manifest = ProjectManifest {
            name: "m".to_string(),
            entities: vec![EntityDefinition {
                id: "e".to_string(),
                name: "E".to_string(),
                name_plural: "Es".to_string(),
                properties: vec![PropertyDefinition {
                    name: "status".to_string(),
                    type_: PropertyType::Select,
                    options: Some(vec!["Todo".to_string(), "Done".to_string()]),
                    visible: Some(true),
                }],
                default_view: Some("board".to_string()),
            }],
            views: vec![ViewConfig {
                id: "board".to_string(),
                name: "Board".to_string(),
                type_: ViewType::Board,
                entity_id: "e".to_string(),
                group_by: Some("status".to_string()),
                visible_properties: vec!["title".to_string()],
                sort_by: None,
                sort_order: None,
                column_order: None,
                hidden_columns: None,
                board_dividers: None,
            }],
            default_view: "board".to_string(),
        };

        let entities = vec![
            entity(
                "1",
                1,
                10,
                serde_json::json!({"status": "Todo", "title": "t1"}),
            ),
            entity(
                "2",
                2,
                20,
                serde_json::json!({"status": "Todo", "title": "t2"}),
            ),
            entity(
                "3",
                3,
                15,
                serde_json::json!({"status": "Done", "title": "t3"}),
            ),
            entity("4", 4, 5, serde_json::json!({"title": "no status"})),
        ];

        let resp = project(&manifest, &entities, "board").expect("projection exists");
        match resp.data {
            ProjectedData::Board { group_by, columns } => {
                assert_eq!(group_by, "status");
                let keys: Vec<_> = columns.iter().map(|c| c.key.as_str()).collect();
                // options first, then remaining keys (e.g. Uncategorized)
                assert_eq!(keys, vec!["Todo", "Done", "Uncategorized"]);

                let todo = columns.iter().find(|c| c.key == "Todo").unwrap();
                let todo_ids: Vec<_> = todo.entities.iter().map(|e| e.id.as_str()).collect();
                // updated_at desc (20 then 10)
                assert_eq!(todo_ids, vec!["2", "1"]);

                let done = columns.iter().find(|c| c.key == "Done").unwrap();
                let done_ids: Vec<_> = done.entities.iter().map(|e| e.id.as_str()).collect();
                assert_eq!(done_ids, vec!["3"]);

                let unc = columns.iter().find(|c| c.key == "Uncategorized").unwrap();
                let unc_ids: Vec<_> = unc.entities.iter().map(|e| e.id.as_str()).collect();
                assert_eq!(unc_ids, vec!["4"]);
            }
            _ => panic!("expected board projection"),
        }
    }
}
