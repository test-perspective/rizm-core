//! Jira attachment id → Rizm attachment URLs for ADF / wiki import.

use std::collections::HashMap;

use serde_json::Value;

use crate::api::attachments_api::AttachmentMeta;

/// Maps Jira attachment ids / filenames to imported Rizm attachment files for the current entity.
#[derive(Clone)]
pub struct AdfImportContext {
    pub project_id: String,
    pub entity_pk: String,
    pub jira_to_rizm: HashMap<String, String>,
    pub rizm_meta_by_id: HashMap<String, AttachmentMeta>,
}

impl AdfImportContext {
    pub fn attachment_url(&self, rizm_id: &str) -> String {
        format!(
            "/api/projects/{}/entities/{}/attachments/{}",
            self.project_id, self.entity_pk, rizm_id
        )
    }

    /// Build BlockNote image or paragraph block for a Jira attachment id (ADF `media`).
    pub fn block_for_jira_file_id(&self, jira_id: &str) -> Option<Value> {
        let rizm_id = self.jira_to_rizm.get(jira_id)?;
        self.block_for_rizm_id(rizm_id)
    }

    fn block_for_rizm_id(&self, rizm_id: &str) -> Option<Value> {
        let url = self.attachment_url(rizm_id);
        let meta = self.rizm_meta_by_id.get(rizm_id)?;
        let fname = meta.file_name.as_str();
        let lower = fname.to_lowercase();
        let is_image = meta
            .mime_type
            .as_deref()
            .map(|m| m.starts_with("image/"))
            .unwrap_or(false)
            || lower.ends_with(".png")
            || lower.ends_with(".jpg")
            || lower.ends_with(".jpeg")
            || lower.ends_with(".gif")
            || lower.ends_with(".webp")
            || lower.ends_with(".svg");
        if is_image {
            Some(super::blocks::image_block(&url))
        } else {
            Some(super::blocks::paragraph_file_attachment(&url, fname))
        }
    }

    /// ADF `media` fallback: Jira sometimes uses UUID media ids while issue attachments are numeric ids.
    /// In those cases `attrs.alt` often carries the original filename, so match by filename.
    pub fn block_for_media_attrs(&self, attrs: &Value) -> Option<Value> {
        if let Some(jira_id) = attrs
            .get("id")
            .and_then(|v| v.as_str().map(str::to_string).or_else(|| v.as_i64().map(|n| n.to_string())))
        {
            if let Some(block) = self.block_for_jira_file_id(&jira_id) {
                return Some(block);
            }
        }
        let alt = attrs.get("alt").and_then(|v| v.as_str()).unwrap_or("").trim();
        if alt.is_empty() {
            return None;
        }
        let meta = self.find_meta_by_wiki_filename(alt)?;
        self.block_for_rizm_id(&meta.id)
    }

    /// Match Jira wiki `!filename.png|...!` to an imported attachment by file name.
    pub fn find_meta_by_wiki_filename(&self, wiki_ref: &str) -> Option<&AttachmentMeta> {
        let needle = wiki_ref.trim();
        if needle.is_empty() {
            return None;
        }
        for m in self.rizm_meta_by_id.values() {
            if m.file_name == needle {
                return Some(m);
            }
        }
        let nlower = needle.to_lowercase();
        for m in self.rizm_meta_by_id.values() {
            if m.file_name.to_lowercase() == nlower {
                return Some(m);
            }
        }
        for m in self.rizm_meta_by_id.values() {
            if m.file_name.ends_with(needle) || needle.ends_with(&m.file_name) {
                return Some(m);
            }
        }
        None
    }
}
