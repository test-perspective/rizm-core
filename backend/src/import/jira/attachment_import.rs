//! Download Jira issue attachments and store them using the same on-disk layout as the attachments API.

use std::collections::HashMap;

use serde_json::Value;

use crate::api::attachments_api::{write_import_attachment_bytes, AttachmentMeta};

use super::client;
use super::super::ImportEngineError;

fn jira_attachment_id_str(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => n.as_i64().map(|i| i.to_string()),
        _ => None,
    }
}

/// Download all attachments for an issue from Jira and write them under the project attachments dir.
/// Returns metadata in Jira API order and a map from Jira attachment id -> Rizm attachment id.
pub async fn download_issue_attachments(
    connection_config: &Value,
    db_path: &str,
    project_id: &str,
    attachment_field: Option<&Value>,
) -> Result<(Vec<AttachmentMeta>, HashMap<String, String>), ImportEngineError> {
    let Some(arr) = attachment_field.and_then(|v| v.as_array()) else {
        return Ok((Vec::new(), HashMap::new()));
    };

    let mut metas: Vec<AttachmentMeta> = Vec::new();
    let mut id_map: HashMap<String, String> = HashMap::new();

    for att in arr {
        let Some(obj) = att.as_object() else {
            continue;
        };
        let jira_id = obj
            .get("id")
            .and_then(jira_attachment_id_str)
            .filter(|s| !s.is_empty());
        let Some(jira_id) = jira_id else {
            continue;
        };
        let filename = obj
            .get("filename")
            .and_then(|v| v.as_str())
            .unwrap_or("file")
            .to_string();
        let mime_type = obj
            .get("mimeType")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .filter(|s| !s.trim().is_empty());
        let created_ms = obj
            .get("created")
            .and_then(|v| v.as_str())
            .and_then(|s| super::transform::parse_jira_datetime(s));

        let path = format!(
            "{}/attachment/content/{}",
            client::jira_api_path(),
            urlencoding::encode(&jira_id)
        );
        let bytes = match client::request_bytes(connection_config, &path).await {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!(error = %e, jira_id = %jira_id, "jira import: skip attachment download");
                continue;
            }
        };

        let mut meta = write_import_attachment_bytes(
            db_path,
            project_id,
            &filename,
            mime_type,
            &bytes,
        )
        .map_err(|e: std::io::Error| ImportEngineError::Internal(e.to_string()))?;

        if let Some(ms) = created_ms {
            meta.created_at = ms;
        }

        id_map.insert(jira_id, meta.id.clone());
        metas.push(meta);
    }

    Ok((metas, id_map))
}
