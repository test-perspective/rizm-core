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

fn table_cell(content: &str) -> Value {
    json!({
        "type": "tableCell",
        "content": text_to_block_content(content.trim()),
        "props": {
            "colspan": 1,
            "rowspan": 1,
            "backgroundColor": "default",
            "textColor": "default",
            "textAlignment": "left"
        }
    })
}

pub(super) fn make_table_block(headers: &[String], rows: &[Vec<String>]) -> Value {
    let column_count = headers.len();
    let mut table_rows = Vec::with_capacity(rows.len() + 1);

    table_rows.push(json!({
        "cells": headers.iter().map(|cell| table_cell(cell)).collect::<Vec<_>>()
    }));

    for row in rows {
        let mut cells = Vec::with_capacity(column_count);
        for i in 0..column_count {
            cells.push(table_cell(row.get(i).map(String::as_str).unwrap_or("")));
        }
        table_rows.push(json!({ "cells": cells }));
    }

    json!({
        "id": Uuid::new_v4().to_string(),
        "type": "table",
        "props": {
            "textColor": "default"
        },
        "content": {
            "type": "tableContent",
            "columnWidths": vec![Value::Null; column_count],
            "headerRows": 1,
            "rows": table_rows
        },
        "children": []
    })
}

/// BlockNote `heading` block (level 1–3) with inline `text` parsed from `title`.
pub fn blocknote_heading_value(level: u8, title: &str) -> Value {
    let level_i = (level as i64).clamp(1, 3);
    make_heading_block(level_i, title.trim())
}
