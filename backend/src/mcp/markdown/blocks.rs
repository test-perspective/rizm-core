//! BlockNote block builders for headings, paragraphs, and quote panels.

use serde_json::{json, Value};
use uuid::Uuid;

use super::inline::text_to_block_content;

pub(super) fn default_block_props() -> Value {
    json!({
        "backgroundColor": "default",
        "textColor": "default",
        "textAlignment": "left"
    })
}

pub(super) fn make_paragraph_block(text: &str) -> Value {
    json!({
        "id": Uuid::new_v4().to_string(),
        "type": "paragraph",
        "props": default_block_props(),
        "content": text_to_block_content(text),
        "children": []
    })
}

pub(super) fn make_heading_block(level: i64, text: &str) -> Value {
    let mut props = default_block_props()
        .as_object()
        .cloned()
        .unwrap_or_default();
    props.insert(
        "level".to_string(),
        Value::Number(serde_json::Number::from(level)),
    );
    json!({
        "id": Uuid::new_v4().to_string(),
        "type": "heading",
        "props": props,
        "content": text_to_block_content(text),
        "children": []
    })
}

pub(super) fn make_quote_block(children: Vec<Value>) -> Value {
    json!({
        "id": Uuid::new_v4().to_string(),
        "type": "quote",
        "props": default_block_props(),
        "content": [{
            "type": "text",
            "text": "",
            "styles": {}
        }],
        "children": children
    })
}

/// BlockNote `heading` block (level 1–3) with inline `text` parsed from `title`.
pub fn blocknote_heading_value(level: u8, title: &str) -> Value {
    let level_i = (level as i64).clamp(1, 3);
    make_heading_block(level_i, title.trim())
}
