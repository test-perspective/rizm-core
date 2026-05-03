//! ADF media → BlockNote image blocks (requires an [AdfImportContext]).

use serde_json::Value;

use super::super::context::AdfImportContext;

fn jira_attachment_id_from_attrs(attrs: &Value) -> Option<String> {
    let id = attrs.get("id")?;
    if let Some(s) = id.as_str() {
        return Some(s.to_string());
    }
    if let Some(n) = id.as_i64() {
        return Some(n.to_string());
    }
    if let Some(n) = id.as_u64() {
        return Some(n.to_string());
    }
    None
}

pub(super) fn adf_media_single_blocks(node: &Value, ctx: Option<&AdfImportContext>) -> Vec<Value> {
    let Some(ctx) = ctx else {
        return vec![];
    };
    let content = match node.get("content").and_then(|c| c.as_array()) {
        Some(c) => c,
        None => return vec![],
    };
    for child in content {
        if child.get("type").and_then(|t| t.as_str()) != Some("media") {
            continue;
        }
        let Some(attrs) = child.get("attrs") else {
            continue;
        };
        if let Some(jid) = jira_attachment_id_from_attrs(attrs) {
            if let Some(block) = ctx.block_for_jira_file_id(&jid) {
                return vec![block];
            }
        }
        if let Some(block) = ctx.block_for_media_attrs(attrs) {
            return vec![block];
        }
    }
    vec![]
}
