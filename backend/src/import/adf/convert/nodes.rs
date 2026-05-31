//! ADF block-level node handlers (paragraph, heading, list, blockquote, code, ...).

use serde_json::{json, Value};

use super::super::blocks;
use super::super::context::AdfImportContext;
use super::inline::adf_inline_to_blocknote_content;
use super::media::adf_media_single_blocks;

pub(in crate::import::adf) fn adf_blocks_from_node(
    node: &Value,
    ctx: Option<&AdfImportContext>,
) -> Vec<Value> {
    let obj = match node.as_object() {
        Some(o) => o,
        None => return vec![],
    };
    let t = match obj.get("type").and_then(|v| v.as_str()) {
        Some(x) => x,
        None => return vec![],
    };
    let content: &[Value] = obj
        .get("content")
        .and_then(|c| c.as_array())
        .map(|v| v.as_slice())
        .unwrap_or(&[]);

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

pub(in crate::import::adf) fn adf_block_to_blocknote(
    node: &Value,
    ctx: Option<&AdfImportContext>,
) -> Option<Value> {
    let obj = node.as_object()?;
    let t = obj.get("type")?.as_str()?;
    let content: &[Value] = obj
        .get("content")
        .and_then(|c| c.as_array())
        .map(|v| v.as_slice())
        .unwrap_or(&[]);

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
            let mut props = blocks::block_props()
                .as_object()
                .cloned()
                .unwrap_or_default();
            props.insert(
                "level".to_string(),
                Value::Number(serde_json::Number::from(level)),
            );
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
            let language = obj
                .get("attrs")
                .and_then(|a| a.get("language"))
                .and_then(|l| l.as_str())
                .unwrap_or("text");
            Some(blocks::code_block_note(&text, language))
        }
        "blockquote" => {
            let mut children = Vec::new();
            for c in content {
                children.extend(adf_blocks_from_node(c, ctx));
            }
            if children.is_empty() {
                None
            } else {
                // BlockNote quote uses inline `content`; empty array breaks the editor when `children` hold blocks.
                Some(json!({
                    "id": id,
                    "type": "quote",
                    "props": blocks::block_props(),
                    "content": [{
                        "type": "text",
                        "text": "",
                        "styles": {}
                    }],
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

pub(in crate::import::adf) fn adf_list_item_to_blocknote(
    node: &Value,
    item_type: &str,
    ctx: Option<&AdfImportContext>,
) -> Option<Value> {
    let obj = node.as_object()?;
    let content: &[Value] = obj
        .get("content")
        .and_then(|c| c.as_array())
        .map(|v| v.as_slice())
        .unwrap_or(&[]);

    let id = uuid::Uuid::new_v4().to_string();

    let mut inline_segs = Vec::new();
    let mut child_blocks: Vec<Value> = Vec::new();

    for c in content {
        if let Some(o) = c.as_object() {
            let t = o.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if t == "paragraph" {
                let p_content: &[Value] = o
                    .get("content")
                    .and_then(|x| x.as_array())
                    .map(|v| v.as_slice())
                    .unwrap_or(&[]);
                inline_segs.extend(adf_inline_to_blocknote_content(p_content));
            } else if t == "mediaSingle" {
                child_blocks.extend(adf_media_single_blocks(c, ctx));
            } else if t == "bulletList" || t == "orderedList" {
                for item in o
                    .get("content")
                    .and_then(|x| x.as_array())
                    .map(|v| v.as_slice())
                    .unwrap_or(&[])
                {
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
