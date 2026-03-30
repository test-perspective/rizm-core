#[cfg(test)]
mod tests {
    use super::super::adf::adf_to_blocknote_doc_with_context;
    use super::super::{FieldMapping, ImportMappingConfig, ImportProvider, StatusMapping};
    use serde_json::json;

    #[test]
    fn adf_to_blocknote_without_attachment_ctx_smoke() {
        let adf = json!({"type": "doc", "version": 1, "content": []});
        assert!(adf_to_blocknote_doc_with_context(&adf, None).is_none());
    }

    #[test]
    fn import_provider_from_str() {
        assert_eq!(ImportProvider::from_str("jira"), Some(ImportProvider::Jira));
        assert_eq!(ImportProvider::from_str("JIRA"), Some(ImportProvider::Jira));
        assert_eq!(ImportProvider::from_str("backlog"), Some(ImportProvider::Backlog));
        assert_eq!(ImportProvider::from_str("unknown"), None);
    }

    #[test]
    fn import_provider_as_str() {
        assert_eq!(ImportProvider::Jira.as_str(), "jira");
        assert_eq!(ImportProvider::Backlog.as_str(), "backlog");
    }

    #[test]
    fn import_mapping_config_serialization() {
        let config = ImportMappingConfig {
            field_mappings: vec![FieldMapping {
                external_field_id: "summary".to_string(),
                external_field_name: "Summary".to_string(),
                rizm_property: "title".to_string(),
            }],
            status_mappings: vec![StatusMapping {
                external_status_id: "1".to_string(),
                external_status_name: "To Do".to_string(),
                rizm_status: "To Do".to_string(),
            }],
            user_mappings: None,
            excluded_statuses: None,
            map_backlog_to_status: None,
        };
        let json = serde_json::to_string(&config).expect("serialize");
        assert!(json.contains("summary"));
        assert!(json.contains("title"));
    }
}
