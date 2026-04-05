//! ADF → BlockNote JSON. Optional [AdfImportContext] resolves Jira `media` attachments.

use serde_json::{json, Map, Value};

use super::blocks;
use super::context::AdfImportContext;
use crate::mcp::markdown::{jira_wiki_preprocessed_paragraph_to_inline_content, preprocess_jira_wiki_plain_text};

fn adf_marks_to_styles(marks: Option<&Value>) -> Value {
    let mut styles = serde_json::Map::new();
    if let Some(arr) = marks.and_then(|m| m.as_array()) {
        for m in arr {
            if let Some(t) = m.get("type").and_then(|v| v.as_str()) {
                match t {
                    "strong" => styles.insert("bold".to_string(), Value::Bool(true)),
                    "em" => styles.insert("italic".to_string(), Value::Bool(true)),
                    "code" => styles.insert("code".to_string(), Value::Bool(true)),
                    // BlockNote defaultStyleSpecs use `strike`, not `strikethrough`.
                    "strike" => styles.insert("strike".to_string(), Value::Bool(true)),
                    "underline" => styles.insert("underline".to_string(), Value::Bool(true)),
                    _ => None,
                };
            }
        }
    }
    Value::Object(styles)
}

fn adf_link_href_from_marks(marks: Option<&Value>) -> Option<String> {
    let arr = marks?.as_array()?;
    for m in arr {
        if m.get("type").and_then(|t| t.as_str()) != Some("link") {
            continue;
        }
        let href = m
            .get("attrs")
            .and_then(|a| a.get("href"))
            .and_then(|h| h.as_str())
            .filter(|s| !s.is_empty())?;
        return Some(href.to_string());
    }
    None
}

fn merge_adf_base_styles_into_segment(seg: &mut Value, base: &Map<String, Value>) {
    if base.is_empty() {
        return;
    }
    let Some(obj) = seg.as_object_mut() else {
        return;
    };
    match obj.get("type").and_then(|t| t.as_str()) {
        Some("text") => {
            let st = obj.entry("styles").or_insert_with(|| json!({}));
            if let Some(m) = st.as_object_mut() {
                for (k, v) in base {
                    m.entry(k.clone()).or_insert_with(|| v.clone());
                }
            }
        }
        Some("link") => {
            if let Some(Value::Array(items)) = obj.get_mut("content") {
                for it in items.iter_mut() {
                    merge_adf_base_styles_into_segment(it, base);
                }
            }
        }
        _ => {}
    }
}

fn merge_adf_base_styles_into_segments(mut segments: Vec<Value>, base_styles: &Value) -> Vec<Value> {
    let Some(base_obj) = base_styles.as_object() else {
        return segments;
    };
    if base_obj.is_empty() {
        return segments;
    }
    for seg in &mut segments {
        merge_adf_base_styles_into_segment(seg, base_obj);
    }
    segments
}

fn adf_inline_to_blocknote_content(nodes: &[Value]) -> Vec<Value> {
    let mut out = Vec::new();
    for node in nodes {
        if let Some(obj) = node.as_object() {
            let t = obj.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if t == "text" {
                let text = obj.get("text").and_then(|v| v.as_str()).unwrap_or("");
                let text = preprocess_jira_wiki_plain_text(text);
                let styles = adf_marks_to_styles(obj.get("marks"));
                let link_href = adf_link_href_from_marks(obj.get("marks"));
                if text.contains("{color:") {
                    let segs = merge_adf_base_styles_into_segments(
                        jira_wiki_preprocessed_paragraph_to_inline_content(&text),
                        &styles,
                    );
                    if let Some(href) = link_href {
                        if !segs.is_empty() {
                            out.push(json!({
                                "type": "link",
                                "href": href,
                                "content": segs
                            }));
                        }
                    } else {
                        for seg in segs {
                            out.push(seg);
                        }
                    }
                } else if !text.is_empty() {
                    let inner = json!({
                        "type": "text",
                        "text": text,
                        "styles": styles
                    });
                    if let Some(href) = link_href {
                        out.push(json!({
                            "type": "link",
                            "href": href,
                            "content": vec![inner]
                        }));
                    } else {
                        out.push(inner);
                    }
                }
            } else if t == "hardBreak" {
                out.push(json!({
                    "type": "text",
                    "text": "\n",
                    "styles": {}
                }));
            } else if t == "status" {
                // Jira ADF inline status pill → plain text (BlockNote `status` is editor-only).
                let label = obj
                    .get("attrs")
                    .and_then(|a| a.get("text"))
                    .and_then(|x| x.as_str())
                    .unwrap_or("");
                if !label.is_empty() {
                    out.push(json!({
                        "type": "text",
                        "text": label,
                        "styles": {}
                    }));
                }
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
        let content = quote.get("content").and_then(|c| c.as_array()).expect("content");
        assert!(!content.is_empty(), "quote must have inline content for BlockNote");
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

    #[test]
    fn adf_text_node_with_jira_color_wiki_converts_to_textcolor() {
        let adf = json!({
            "type": "doc",
            "version": 1,
            "content": [{
                "type": "paragraph",
                "content": [{
                    "type": "text",
                    "text": "{color:#FF5630}[ 確認 ]{color}"
                }]
            }]
        });
        let s = adf_to_blocknote_doc_with_context(&adf, None).expect("doc");
        assert!(!s.contains("{color"), "{}", s);
        assert!(s.contains("確認"), "{}", s);
        assert!(s.contains("textColor"), "{}", s);
        assert!(s.contains("#FF5630"), "{}", s);
    }

    #[test]
    fn adf_jira_color_case_insensitive_delimiters_in_text_node() {
        let adf = json!({
            "type": "doc",
            "version": 1,
            "content": [{
                "type": "paragraph",
                "content": [{
                    "type": "text",
                    "text": "{Color:#FF5630}OK{Color}"
                }]
            }]
        });
        let s = adf_to_blocknote_doc_with_context(&adf, None).expect("doc");
        assert!(!s.to_ascii_lowercase().contains("{color"), "{}", s);
        assert!(s.contains("OK"), "{}", s);
        assert!(s.contains("#FF5630"), "{}", s);
    }

    /// Regression (TPD-4): Description is `paragraph` + `orderedList` only (no ADF headings). Import must
    /// not rely on a preceding h2 for list preservation (see `sanitizeBlockNoteForEditor` for bad DB rows).
    #[test]
    fn tpd4_paragraph_then_ordered_list_stays_numbered_after_import_reparse_chain() {
        use crate::import::adf::{
            maybe_reparse_blocknote_from_flat_markdown, maybe_reparse_blocknote_wrapped_markdown,
        };

        let adf = json!({
            "type": "doc",
            "version": 1,
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "再現方法"}]},
                {"type": "orderedList", "attrs": {"order": 1}, "content": [
                    {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "テーブルを空にする"}]}]},
                    {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "ステップ2"}]}]}
                ]},
                {"type": "paragraph", "content": [{"type": "text", "text": "別セクション"}]},
                {"type": "orderedList", "attrs": {"order": 1}, "content": [
                    {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "A"}]}]},
                    {"type": "listItem", "content": [{"type": "paragraph"}]}
                ]}
            ]
        });
        let ctx = super::super::context::AdfImportContext::empty();
        let doc = super::adf_to_blocknote_doc_with_context(&adf, Some(&ctx)).expect("adf doc");
        let after = maybe_reparse_blocknote_wrapped_markdown(&doc, Some(&ctx))
            .or_else(|| maybe_reparse_blocknote_from_flat_markdown(&doc, Some(&ctx)))
            .unwrap_or_else(|| doc.clone());

        let blocks: Vec<Value> = serde_json::from_str(&after).unwrap();
        let top_numbered = blocks
            .iter()
            .filter(|b| b.get("type").and_then(|t| t.as_str()) == Some("numberedListItem"))
            .count();
        assert!(top_numbered >= 2, "expected top-level numbered list items: {}", after);
        assert!(
            !blocks
                .iter()
                .any(|b| b.get("type").and_then(|t| t.as_str()) == Some("heading")),
            "ADF without headings must not produce heading blocks: {}",
            after
        );
    }

    /// Regression (TPD-196): Jira `orderedList` must stay `numberedListItem` after the same re-parse
    /// chain as `import_run` (flat Markdown re-parse used to collapse lists into `#` pseudo-headings).
    #[test]
    fn tpd196_ordered_list_keeps_numbered_items_after_import_reparse_chain() {
        use crate::import::adf::{
            maybe_reparse_blocknote_from_flat_markdown, maybe_reparse_blocknote_wrapped_markdown,
        };

        let adf = json!({
            "type": "doc",
            "version": 1,
            "content": [
                {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "再現手順"}]},
                {"type": "orderedList", "attrs": {"order": 1}, "content": [
                    {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "ステップ1"}]}]},
                    {"type": "listItem", "content": [
                        {"type": "paragraph", "content": [{"type": "text", "text": "ステップ2"}]},
                        {"type": "bulletList", "content": [
                            {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "ネストA"}]}]},
                            {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "ネストB"}]}]}
                        ]}
                    ]},
                    {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "ステップ3"}]}]}
                ]}
            ]
        });
        let ctx = super::super::context::AdfImportContext::empty();
        let doc = super::adf_to_blocknote_doc_with_context(&adf, Some(&ctx)).expect("adf doc");
        let after = maybe_reparse_blocknote_wrapped_markdown(&doc, Some(&ctx))
            .or_else(|| maybe_reparse_blocknote_from_flat_markdown(&doc, Some(&ctx)))
            .unwrap_or_else(|| doc.clone());

        let blocks: Vec<Value> = serde_json::from_str(&after).unwrap();
        let numbered_count = blocks
            .iter()
            .filter(|b| b.get("type").and_then(|t| t.as_str()) == Some("numberedListItem"))
            .count();
        assert!(numbered_count >= 1, "need top-level numbered items: {}", after);

        fn count_numbered_deep(blocks: &[Value]) -> usize {
            let mut n = 0usize;
            for b in blocks {
                if b.get("type").and_then(|t| t.as_str()) == Some("numberedListItem") {
                    n += 1;
                }
                if let Some(ch) = b.get("children").and_then(|c| c.as_array()) {
                    n += count_numbered_deep(ch.as_slice());
                }
            }
            n
        }
        assert!(count_numbered_deep(&blocks) >= 3, "nested doc should keep ≥3 numbered items: {}", after);

        for b in &blocks {
            if b.get("type").and_then(|t| t.as_str()) != Some("heading") {
                continue;
            }
            let level = b
                .get("props")
                .and_then(|p| p.get("level"))
                .and_then(|l| l.as_i64())
                .unwrap_or(0);
            let flat = b
                .get("content")
                .and_then(|c| c.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x.get("text").and_then(|t| t.as_str()))
                        .collect::<String>()
                })
                .unwrap_or_default();
            if flat.starts_with("ステップ") {
                assert_ne!(
                    level, 1,
                    "ordered-list steps must not become ATX-style (level 1) headings: {}",
                    after
                );
            }
        }
    }

    /// Regression (TPD-155): Leading ADF `codeBlock` plus trailing URL must stay a real code block after import re-parse.
    #[test]
    fn tpd155_code_block_survives_import_reparse_chain() {
        use crate::import::adf::{
            maybe_reparse_blocknote_from_flat_markdown, maybe_reparse_blocknote_wrapped_markdown,
        };

        let adf = json!({
            "type": "doc",
            "version": 1,
            "content": [
                {
                    "type": "codeBlock",
                    "content": [{ "type": "text", "text": "91:4    warning  lint\n\n97:16   warning  more" }]
                },
                {
                    "type": "paragraph",
                    "content": [{ "type": "text", "text": "forge lintで引っかかる。" }]
                },
                {
                    "type": "paragraph",
                    "content": [{ "type": "text", "text": "See https://developer.atlassian.com/x" }]
                }
            ]
        });
        let ctx = super::super::context::AdfImportContext::empty();
        let doc = super::adf_to_blocknote_doc_with_context(&adf, Some(&ctx)).expect("adf doc");
        let after = maybe_reparse_blocknote_wrapped_markdown(&doc, Some(&ctx))
            .or_else(|| maybe_reparse_blocknote_from_flat_markdown(&doc, Some(&ctx)))
            .unwrap_or_else(|| doc.clone());

        let blocks: Vec<Value> = serde_json::from_str(&after).unwrap();
        assert_eq!(
            blocks.first().and_then(|b| b.get("type")).and_then(|t| t.as_str()),
            Some("codeBlock"),
            "first block must stay codeBlock: {}",
            after
        );
        let code_text = blocks
            .first()
            .and_then(|b| b.get("content"))
            .and_then(|c| c.as_array())
            .and_then(|a| a.first())
            .and_then(|x| x.get("text"))
            .and_then(|t| t.as_str())
            .unwrap_or("");
        assert!(
            code_text.contains("91:4") && code_text.contains("97:16"),
            "code body must be preserved: {}",
            after
        );
    }

    #[test]
    fn adf_status_inline_becomes_plain_text() {
        let adf = json!({
            "type": "doc",
            "version": 1,
            "content": [{
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "a "},
                    {"type": "status", "attrs": {"text": "再現せず", "color": "blue"}},
                    {"type": "text", "text": " b"}
                ]
            }]
        });
        let s = super::adf_to_blocknote_doc_with_context(&adf, None).expect("doc");
        assert!(s.contains("再現せず"), "{}", s);
    }

    #[test]
    fn adf_link_mark_becomes_blocknote_link_inline() {
        let adf = json!({
            "type": "doc",
            "version": 1,
            "content": [{
                "type": "paragraph",
                "content": [{
                    "type": "text",
                    "text": "x",
                    "marks": [{ "type": "link", "attrs": { "href": "http://example.test/y" } }]
                }]
            }]
        });
        let s = super::adf_to_blocknote_doc_with_context(&adf, None).expect("doc");
        assert!(s.contains("\"link\""), "{}", s);
        assert!(s.contains("http://example.test/y"), "{}", s);
        assert!(s.contains("x"), "{}", s);
    }

    #[test]
    fn adf_strike_mark_uses_blocknote_strike_style_key() {
        let adf = json!({
            "type": "doc",
            "version": 1,
            "content": [{
                "type": "paragraph",
                "content": [{
                    "type": "text",
                    "text": "gone",
                    "marks": [{ "type": "strike" }]
                }]
            }]
        });
        let s = super::adf_to_blocknote_doc_with_context(&adf, None).expect("doc");
        assert!(s.contains("\"strike\":true"), "expected BlockNote strike style, got {}", s);
        assert!(!s.contains("strikethrough"), "{}", s);
    }
}
