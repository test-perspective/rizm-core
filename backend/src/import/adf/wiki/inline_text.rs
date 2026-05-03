//! Helpers for flattening BlockNote / ADF inline content back into plain text.

use serde_json::Value;

pub(super) fn append_inline_text(v: &Value, out: &mut String) {
    let Some(o) = v.as_object() else {
        return;
    };
    match o.get("type").and_then(|t| t.as_str()) {
        Some("text") => {
            if let Some(tx) = o.get("text").and_then(|x| x.as_str()) {
                out.push_str(tx);
            }
        }
        _ => {
            if let Some(c) = o.get("content").and_then(|x| x.as_array()) {
                for x in c {
                    append_inline_text(x, out);
                }
            }
        }
    }
}

pub(super) fn flatten_paragraph_block_text(block: &Value) -> String {
    let mut out = String::new();
    let Some(o) = block.as_object() else {
        return out;
    };
    if let Some(content) = o.get("content").and_then(|c| c.as_array()) {
        for item in content {
            append_inline_text(item, &mut out);
        }
    }
    if let Some(children) = o.get("children").and_then(|c| c.as_array()) {
        for ch in children {
            let inner = flatten_paragraph_block_text(ch);
            if !inner.is_empty() {
                if !out.is_empty() {
                    out.push('\n');
                }
                out.push_str(&inner);
            }
        }
    }
    out
}

/// Join text from each top-level block (any type with BlockNote shape). Skips empty segments.
pub(super) fn flatten_inline_only(block: &Value) -> String {
    let mut out = String::new();
    if let Some(content) = block.get("content").and_then(|c| c.as_array()) {
        for item in content {
            append_inline_text(item, &mut out);
        }
    }
    out
}

pub(super) fn inline_text_eq(v: &Value, s: &str) -> bool {
    let Some(o) = v.as_object() else {
        return false;
    };
    o.get("type").and_then(|t| t.as_str()) == Some("text")
        && o.get("text").and_then(|x| x.as_str()) == Some(s)
}
