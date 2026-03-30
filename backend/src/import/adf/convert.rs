//! ADF → BlockNote JSON. Optional [AdfImportContext] resolves Jira `media` attachments.

use serde_json::{json, Value};

use super::blocks;
use super::context::AdfImportContext;

fn adf_marks_to_styles(marks: Option<&Value>) -> Value {
    let mut styles = serde_json::Map::new();
    if let Some(arr) = marks.and_then(|m| m.as_array()) {
        for m in arr {
            if let Some(t) = m.get("type").and_then(|v| v.as_str()) {
                match t {
                    "strong" => styles.insert("bold".to_string(), Value::Bool(true)),
                    "em" => styles.insert("italic".to_string(), Value::Bool(true)),
                    "code" => styles.insert("code".to_string(), Value::Bool(true)),
                    "strike" => styles.insert("strikethrough".to_string(), Value::Bool(true)),
                    "underline" => styles.insert("underline".to_string(), Value::Bool(true)),
                    _ => None,
                };
            }
        }
    }
    Value::Object(styles)
}

fn adf_inline_to_blocknote_content(nodes: &[Value]) -> Vec<Value> {
    let mut out = Vec::new();
    for node in nodes {
        if let Some(obj) = node.as_object() {
            let t = obj.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if t == "text" {
                let text = obj.get("text").and_then(|v| v.as_str()).unwrap_or("");
                let styles = adf_marks_to_styles(obj.get("marks"));
                if !text.is_empty() {
                    out.push(json!({
                        "type": "text",
                        "text": text,
                        "styles": styles
                    }));
                }
            } else if t == "hardBreak" {
                out.push(json!({
                    "type": "text",
                    "text": "\n",
                    "styles": {}
                }));
            }
        }
    }
    out
}

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

fn adf_media_single_blocks(node: &Value, ctx: Option<&AdfImportContext>) -> Vec<Value> {
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

fn adf_blocks_from_node(node: &Value, ctx: Option<&AdfImportContext>) -> Vec<Value> {
    let obj = match node.as_object() {
        Some(o) => o,
        None => return vec![],
    };
    let t = match obj.get("type").and_then(|v| v.as_str()) {
        Some(x) => x,
        None => return vec![],
    };
    let content: &[Value] = obj.get("content").and_then(|c| c.as_array()).map(|v| v.as_slice()).unwrap_or(&[]);

    if t == "mediaSingle" {
        return adf_media_single_blocks(node, ctx);
    }

    if t == "bulletList" || t == "orderedList" {
        let item_type = if t == "orderedList" {
            "numberedListItem"
        } else {
            "bulletListItem"
        };
        let mut blocks = Vec::new();
        for item in content {
            if let Some(block) = adf_list_item_to_blocknote(item, item_type, ctx) {
                blocks.push(block);
            }
        }
        return blocks;
    }

    if let Some(block) = adf_block_to_blocknote(node, ctx) {
        return vec![block];
    }

    // Wrappers (panel, expand, table*, etc.): flatten children so nested `mediaSingle` is kept.
    if !content.is_empty() {
        let mut out = Vec::new();
        for child in content {
            out.extend(adf_blocks_from_node(child, ctx));
        }
        if !out.is_empty() {
            return out;
        }
    }

    vec![]
}

fn adf_block_to_blocknote(node: &Value, ctx: Option<&AdfImportContext>) -> Option<Value> {
    let obj = node.as_object()?;
    let t = obj.get("type")?.as_str()?;
    let content: &[Value] = obj.get("content").and_then(|c| c.as_array()).map(|v| v.as_slice()).unwrap_or(&[]);

    let id = uuid::Uuid::new_v4().to_string();

    match t {
        "paragraph" => {
            let segs = adf_inline_to_blocknote_content(content);
            Some(json!({
                "id": id,
                "type": "paragraph",
                "props": blocks::block_props(),
                "content": segs,
                "children": []
            }))
        }
        "heading" => {
            let level = obj
                .get("attrs")
                .and_then(|a| a.get("level"))
                .and_then(|l| l.as_i64())
                .unwrap_or(1);
            let mut props = blocks::block_props().as_object().cloned().unwrap_or_default();
            props.insert("level".to_string(), Value::Number(serde_json::Number::from(level)));
            let segs = adf_inline_to_blocknote_content(content);
            Some(json!({
                "id": id,
                "type": "heading",
                "props": props,
                "content": segs,
                "children": []
            }))
        }
        "bulletList" | "orderedList" => None,
        "listItem" => adf_list_item_to_blocknote(node, "bulletListItem", ctx),
        "codeBlock" => {
            let mut text = String::new();
            for c in content {
                if let Some(obj) = c.as_object() {
                    if obj.get("type").and_then(|v| v.as_str()) == Some("text") {
                        text.push_str(obj.get("text").and_then(|v| v.as_str()).unwrap_or(""));
                    }
                }
            }
            let segs = if text.is_empty() {
                vec![]
            } else {
                vec![json!({
                    "type": "text",
                    "text": text,
                    "styles": {"code": true}
                })]
            };
            Some(json!({
                "id": id,
                "type": "paragraph",
                "props": blocks::block_props(),
                "content": segs,
                "children": []
            }))
        }
        "blockquote" => {
            let mut children = Vec::new();
            for c in content {
                children.extend(adf_blocks_from_node(c, ctx));
            }
            if children.is_empty() {
                None
            } else {
                Some(json!({
                    "id": id,
                    "type": "quote",
                    "props": blocks::block_props(),
                    "content": [],
                    "children": children
                }))
            }
        }
        "rule" => Some(json!({
            "id": id,
            "type": "paragraph",
            "props": blocks::block_props(),
            "content": [{"type": "text", "text": "---", "styles": {}}],
            "children": []
        })),
        _ => {
            // Defer to `adf_blocks_from_node` recursion for wrappers (panel, table, etc.).
            if !content.is_empty() {
                return None;
            }
            let mut text = String::new();
            fn extract_text(v: &Value, acc: &mut String) {
                if let Some(obj) = v.as_object() {
                    if let Some(t) = obj.get("text").and_then(|x| x.as_str()) {
                        acc.push_str(t);
                        return;
                    }
                    for (k, val) in obj {
                        if k == "content" || k == "children" {
                            if let Some(arr) = val.as_array() {
                                for item in arr {
                                    extract_text(item, acc);
                                }
                            }
                        }
                    }
                }
            }
            extract_text(node, &mut text);
            if text.trim().is_empty() {
                None
            } else {
                let segs = vec![json!({
                    "type": "text",
                    "text": text,
                    "styles": {}
                })];
                Some(json!({
                    "id": id,
                    "type": "paragraph",
                    "props": blocks::block_props(),
                    "content": segs,
                    "children": []
                }))
            }
        }
    }
}

fn adf_list_item_to_blocknote(node: &Value, item_type: &str, ctx: Option<&AdfImportContext>) -> Option<Value> {
    let obj = node.as_object()?;
    let content: &[Value] = obj.get("content").and_then(|c| c.as_array()).map(|v| v.as_slice()).unwrap_or(&[]);

    let id = uuid::Uuid::new_v4().to_string();

    let mut inline_segs = Vec::new();
    let mut child_blocks: Vec<Value> = Vec::new();

    for c in content {
        if let Some(o) = c.as_object() {
            let t = o.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if t == "paragraph" {
                let p_content: &[Value] = o.get("content").and_then(|x| x.as_array()).map(|v| v.as_slice()).unwrap_or(&[]);
                inline_segs.extend(adf_inline_to_blocknote_content(p_content));
            } else if t == "mediaSingle" {
                child_blocks.extend(adf_media_single_blocks(c, ctx));
            } else if t == "bulletList" || t == "orderedList" {
                for item in o.get("content").and_then(|x| x.as_array()).map(|v| v.as_slice()).unwrap_or(&[]) {
                    if let Some(block) = adf_list_item_to_blocknote(
                        item,
                        if t == "bulletList" {
                            "bulletListItem"
                        } else {
                            "numberedListItem"
                        },
                        ctx,
                    ) {
                        child_blocks.push(block);
                    }
                }
            }
        }
    }

    let bn_type = if item_type == "numberedListItem" {
        "numberedListItem"
    } else {
        "bulletListItem"
    };

    Some(json!({
        "id": id,
        "type": bn_type,
        "props": blocks::block_props(),
        "content": inline_segs,
        "children": child_blocks
    }))
}

/// Convert ADF with optional Jira attachment resolution for embedded media.
pub fn adf_to_blocknote_doc_with_context(adf: &Value, ctx: Option<&AdfImportContext>) -> Option<String> {
    let content = adf.get("content").and_then(|c| c.as_array())?;
    let mut blocks: Vec<Value> = Vec::new();

    for node in content {
        blocks.extend(adf_blocks_from_node(node, ctx));
    }

    if blocks.is_empty() {
        return None;
    }

    serde_json::to_string(&blocks).ok()
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::super::context::AdfImportContext;
    use super::adf_to_blocknote_doc_with_context;
    use crate::api::attachments_api::AttachmentMeta;
    use serde_json::{json, Value};

    fn test_ctx(jira_id: &str, rizm_id: &str, fname: &str, mime: &str) -> AdfImportContext {
        let mut jira_to_rizm = HashMap::new();
        jira_to_rizm.insert(jira_id.to_string(), rizm_id.to_string());
        let mut rizm_meta_by_id = HashMap::new();
        rizm_meta_by_id.insert(
            rizm_id.to_string(),
            AttachmentMeta {
                id: rizm_id.to_string(),
                file_name: fname.to_string(),
                mime_type: Some(mime.to_string()),
                size: 1,
                created_at: 0,
            },
        );
        AdfImportContext {
            project_id: "p".to_string(),
            entity_pk: "e".to_string(),
            jira_to_rizm,
            rizm_meta_by_id,
        }
    }

    #[test]
    fn adf_to_blocknote_doc_empty_content_none() {
        let adf = json!({"type": "doc", "version": 1, "content": []});
        assert!(adf_to_blocknote_doc_with_context(&adf, None).is_none());
    }

    #[test]
    fn nested_media_single_in_panel_emits_image_block() {
        let ctx = test_ctx("10001", "rizm-1", "shot.png", "image/png");
        let adf = json!({
            "type": "doc",
            "version": 1,
            "content": [{
                "type": "panel",
                "content": [{
                    "type": "mediaSingle",
                    "content": [{
                        "type": "media",
                        "attrs": { "type": "file", "id": "10001", "collection": "" }
                    }]
                }]
            }]
        });
        let s = adf_to_blocknote_doc_with_context(&adf, Some(&ctx)).expect("doc");
        let blocks: Vec<Value> = serde_json::from_str(&s).unwrap();
        assert!(blocks.iter().any(|b| b.get("type").and_then(|t| t.as_str()) == Some("image")));
    }

    #[test]
    fn nested_media_single_in_blockquote_emits_image_in_quote_children() {
        let ctx = test_ctx("10002", "rizm-2", "a.png", "image/png");
        let adf = json!({
            "type": "doc",
            "version": 1,
            "content": [{
                "type": "blockquote",
                "content": [{
                    "type": "mediaSingle",
                    "content": [{
                        "type": "media",
                        "attrs": { "type": "file", "id": "10002", "collection": "" }
                    }]
                }]
            }]
        });
        let s = adf_to_blocknote_doc_with_context(&adf, Some(&ctx)).expect("doc");
        let blocks: Vec<Value> = serde_json::from_str(&s).unwrap();
        let quote = blocks.iter().find(|b| b.get("type").and_then(|t| t.as_str()) == Some("quote"));
        let quote = quote.expect("quote block");
        let children = quote.get("children").and_then(|c| c.as_array()).expect("children");
        assert!(children.iter().any(|b| b.get("type").and_then(|t| t.as_str()) == Some("image")));
    }

    #[test]
    fn media_single_inside_list_item_emits_image_child() {
        let ctx = test_ctx("10003", "rizm-3", "b.png", "image/png");
        let adf = json!({
            "type": "doc",
            "version": 1,
            "content": [{
                "type": "bulletList",
                "content": [{
                    "type": "listItem",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{ "type": "text", "text": "see:" }]
                        },
                        {
                            "type": "mediaSingle",
                            "content": [{
                                "type": "media",
                                "attrs": { "type": "file", "id": "10003", "collection": "" }
                            }]
                        }
                    ]
                }]
            }]
        });
        let s = adf_to_blocknote_doc_with_context(&adf, Some(&ctx)).expect("doc");
        let blocks: Vec<Value> = serde_json::from_str(&s).unwrap();
        let li = blocks.iter().find(|b| b.get("type").and_then(|t| t.as_str()) == Some("bulletListItem"));
        let li = li.expect("list item");
        let children = li.get("children").and_then(|c| c.as_array()).expect("children");
        assert!(children.iter().any(|b| b.get("type").and_then(|t| t.as_str()) == Some("image")));
    }

    #[test]
    fn media_single_falls_back_to_alt_filename_when_media_id_is_uuid() {
        let ctx = test_ctx("10736", "rizm-4", "slide1.png", "image/png");
        let adf = json!({
            "type": "doc",
            "version": 1,
            "content": [{
                "type": "mediaSingle",
                "content": [{
                    "type": "media",
                    "attrs": {
                        "type": "file",
                        "id": "cfe6dc40-6f1a-4cf3-bbe7-119c40c0a35f",
                        "alt": "slide1.png",
                        "collection": ""
                    }
                }]
            }]
        });
        let s = adf_to_blocknote_doc_with_context(&adf, Some(&ctx)).expect("doc");
        let blocks: Vec<Value> = serde_json::from_str(&s).unwrap();
        assert!(blocks.iter().any(|b| b.get("type").and_then(|t| t.as_str()) == Some("image")));
    }
}
