//! Jira wiki text and description classification for import.

use serde_json::{json, Value};

use super::blocks;
use super::context::AdfImportContext;
use super::convert::adf_to_blocknote_doc_with_context;
use crate::api::attachments_api::AttachmentMeta;

fn is_adf_doc_root(v: &Value) -> bool {
    v.as_object()
        .and_then(|o| o.get("type"))
        .and_then(|t| t.as_str())
        == Some("doc")
}

/// ADF JSON object, legacy wiki / plain (needs conversion), or pass-through for BlockNote JSON strings.
#[derive(Debug, Clone)]
pub enum JiraDescriptionKind {
    Adf(Value),
    LegacyWiki(String),
}

/// Classify Jira description field. Returns `None` when the value should be mapped as-is (e.g. BlockNote JSON string).
pub fn classify_jira_description_value(raw: Option<&Value>) -> Option<JiraDescriptionKind> {
    let raw = raw?;
    if is_adf_doc_root(raw) {
        return Some(JiraDescriptionKind::Adf(raw.clone()));
    }
    if let Some(s) = raw.as_str() {
        if is_blocknote_doc_json_string(s) {
            return None;
        }
        if let Ok(v) = serde_json::from_str::<Value>(s) {
            if is_adf_doc_root(&v) {
                return Some(JiraDescriptionKind::Adf(v));
            }
        }
        return Some(JiraDescriptionKind::LegacyWiki(s.to_string()));
    }
    None
}

/// True if `s` is a JSON array of BlockNote blocks (each object has non-empty string `type`).
pub fn is_blocknote_doc_json_string(s: &str) -> bool {
    let t = s.trim();
    if !t.starts_with('[') {
        return false;
    }
    let Ok(arr) = serde_json::from_str::<Vec<Value>>(t) else {
        return false;
    };
    if arr.is_empty() {
        return true;
    }
    arr.iter().all(|b| {
        b.as_object()
            .and_then(|o| o.get("type"))
            .and_then(|ty| ty.as_str())
            .map(|x| !x.is_empty())
            .unwrap_or(false)
    })
}

fn wiki_block_for_meta(meta: &AttachmentMeta, url: &str) -> Value {
    let lower = meta.file_name.to_lowercase();
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
        blocks::image_block(url)
    } else {
        blocks::paragraph_file_attachment(url, &meta.file_name)
    }
}

fn wiki_push_text_segments(blocks: &mut Vec<Value>, text: &str) {
    let t = text.trim_end_matches('\n');
    if t.trim().is_empty() {
        return;
    }
    for para in t.split("\n\n") {
        let p = para.trim();
        if p.is_empty() {
            continue;
        }
        let id = uuid::Uuid::new_v4().to_string();
        let lines: Vec<&str> = p.split('\n').collect();
        let mut content: Vec<Value> = Vec::new();
        for (idx, line) in lines.iter().enumerate() {
            if idx > 0 {
                content.push(json!({"type": "text", "text": "\n", "styles": {}}));
            }
            content.push(json!({
                "type": "text",
                "text": line,
                "styles": {}
            }));
        }
        blocks.push(json!({
            "id": id,
            "type": "paragraph",
            "props": {
                "backgroundColor": "default",
                "textColor": "default",
                "textAlignment": "left"
            },
            "content": content,
            "children": []
        }));
    }
}

/// Jira wiki or plain multiline text → BlockNote JSON string.
pub fn jira_wiki_text_to_blocknote_doc(s: &str, ctx: &AdfImportContext) -> Option<String> {
    let blocks = jira_wiki_to_blocks(s, ctx);
    if blocks.is_empty() {
        return Some("[]".to_string());
    }
    serde_json::to_string(&blocks).ok()
}

fn jira_wiki_to_blocks(s: &str, ctx: &AdfImportContext) -> Vec<Value> {
    let mut out: Vec<Value> = Vec::new();
    let mut rest = s;
    while let Some(start) = rest.find('!') {
        wiki_push_text_segments(&mut out, &rest[..start]);
        let after = &rest[start + 1..];
        if let Some(end_rel) = after.find('!') {
            let inner = &after[..end_rel];
            let fname = inner.split('|').next().unwrap_or("").trim();
            if let Some(meta) = ctx.find_meta_by_wiki_filename(fname) {
                let url = ctx.attachment_url(&meta.id);
                out.push(wiki_block_for_meta(meta, &url));
            }
            rest = &after[end_rel + 1..];
        } else {
            wiki_push_text_segments(&mut out, rest);
            return out;
        }
    }
    wiki_push_text_segments(&mut out, rest);
    out
}

/// Jira comment `body`: ADF object, stringified ADF, BlockNote JSON, or wiki/plain text (with `ctx` for `!file!` and images).
pub fn jira_comment_body_to_blocknote_doc(
    body: &Value,
    ctx: Option<&AdfImportContext>,
) -> Option<String> {
    if is_adf_doc_root(body) {
        return adf_to_blocknote_doc_with_context(body, ctx);
    }
    if let Some(s) = body.as_str() {
        if is_blocknote_doc_json_string(s) {
            return Some(s.to_string());
        }
        if let Ok(v) = serde_json::from_str::<Value>(s) {
            if is_adf_doc_root(&v) {
                return adf_to_blocknote_doc_with_context(&v, ctx);
            }
        }
        if let Some(c) = ctx {
            return jira_wiki_text_to_blocknote_doc(s, c);
        }
        return None;
    }
    None
}

#[cfg(test)]
mod comment_body_tests {
    use super::super::context::AdfImportContext;
    use super::jira_comment_body_to_blocknote_doc;
    use serde_json::json;
    use std::collections::HashMap;

    #[test]
    fn comment_plain_text_with_ctx_becomes_paragraph_doc() {
        let ctx = AdfImportContext {
            project_id: "p".to_string(),
            entity_pk: "e".to_string(),
            jira_to_rizm: HashMap::new(),
            rizm_meta_by_id: HashMap::new(),
        };
        let body = json!("Hello comment");
        let s = jira_comment_body_to_blocknote_doc(&body, Some(&ctx)).expect("doc");
        assert!(s.contains("Hello comment"));
        assert!(s.contains("paragraph"));
    }

    #[test]
    fn comment_adf_doc_resolves_without_ctx_when_no_media() {
        let adf = json!({
            "type": "doc",
            "version": 1,
            "content": [{
                "type": "paragraph",
                "content": [{ "type": "text", "text": "x", "styles": {} }]
            }]
        });
        let s = jira_comment_body_to_blocknote_doc(&adf, None).expect("doc");
        assert!(s.contains("x"));
    }
}
