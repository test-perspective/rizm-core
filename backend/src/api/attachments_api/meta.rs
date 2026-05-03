use serde::{Deserialize, Serialize};

use crate::models::Entity;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentMeta {
    pub id: String,
    pub file_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    pub size: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AttachmentListResponse {
    pub attachments: Vec<AttachmentMeta>,
}

/// ETag for entity-level optimistic locking, consistent with `entities_api`.
pub(super) fn etag_for_entity(e: &Entity) -> String {
    format!("\"{}\"", e.updated_at)
}

pub(super) fn is_attachment_supported_entity(e: &Entity) -> bool {
    e.entity_id == "task" || e.entity_id == "item" || e.entity_id == "wikiPage"
}

pub(crate) fn read_attachments_from_entity(e: &Entity) -> Vec<AttachmentMeta> {
    let Some(v) = e.properties.get("attachments") else {
        return vec![];
    };
    let Ok(list) = serde_json::from_value::<Vec<AttachmentMeta>>(v.clone()) else {
        return vec![];
    };
    list
}
