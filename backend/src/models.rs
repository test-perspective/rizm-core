use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entity {
    pub id: String,
    pub entity_id: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub properties: serde_json::Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    pub manifest: ProjectManifest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lifecycle_status: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub entities: Vec<Entity>,
    pub config: ProjectConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PropertyDefinition {
    pub name: String,
    #[serde(rename = "type")]
    pub type_: PropertyType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visible: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PropertyType {
    Text,
    Richtext,
    Select,
    Labels,
    Number,
    Date,
    Boolean,
    Link,
    User,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardDivider {
    pub id: String,
    pub title: String,
    pub column_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub after_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sort: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewConfig {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub type_: ViewType,
    pub entity_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_by: Option<String>,
    pub visible_properties: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sort_by: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sort_order: Option<SortOrder>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub column_order: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hidden_columns: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub board_dividers: Option<Vec<BoardDivider>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ViewType {
    List,
    Board,
    Table,
    Wiki,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SortOrder {
    Asc,
    Desc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityDefinition {
    pub id: String,
    pub name: String,
    pub name_plural: String,
    pub properties: Vec<PropertyDefinition>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_view: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectManifest {
    pub name: String,
    pub entities: Vec<EntityDefinition>,
    pub views: Vec<ViewConfig>,
    pub default_view: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageData {
    pub projects: Vec<Project>,
    pub active_project_id: String,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestVersionSummary {
    pub id: String,
    pub project_id: String,
    pub created_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actor_user_id: Option<String>,
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Permission {
    #[default]
    None,
    Read,
    Write,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPolicy {
    pub project_defaults: PolicyDefaults,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyDefaults {
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub groups: HashMap<String, Permission>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub users: HashMap<String, Permission>,
    #[serde(default)]
    pub anonymous: Permission,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entity_serializes_with_camel_case_fields() {
        let mut props = serde_json::Map::new();
        props.insert("title".to_string(), Value::String("Hello".to_string()));

        let e = Entity {
            id: "id-1".to_string(),
            entity_id: "task".to_string(),
            created_at: 1,
            updated_at: 2,
            properties: props,
        };

        let v = serde_json::to_value(&e).expect("serialize entity");
        assert_eq!(v.get("id").and_then(Value::as_str), Some("id-1"));
        assert_eq!(v.get("entityId").and_then(Value::as_str), Some("task"));
        assert_eq!(v.get("createdAt").and_then(Value::as_i64), Some(1));
        assert_eq!(v.get("updatedAt").and_then(Value::as_i64), Some(2));
        assert!(v.get("created_at").is_none());
        assert!(v.get("updated_at").is_none());
        assert!(v.get("properties").is_some());
    }

    #[test]
    fn property_definition_serializes_type_field_as_type() {
        let pd = PropertyDefinition {
            name: "status".to_string(),
            type_: PropertyType::Select,
            options: Some(vec!["Todo".to_string()]),
            visible: Some(true),
        };

        let v = serde_json::to_value(&pd).expect("serialize property definition");
        assert_eq!(v.get("name").and_then(Value::as_str), Some("status"));
        assert_eq!(v.get("type").and_then(Value::as_str), Some("select"));
        assert!(v.get("type_").is_none());
    }
}
