//! Replace Jira emoticons inside already-imported BlockNote docs.

use serde_json::Value;

use super::json_norm::is_blocknote_doc_json_string;
use crate::mcp::markdown::{blocknote_inline_from_jira_plain_text, preprocess_jira_wiki_plain_text};

fn content_array_is_plain_text_only(items: &[Value]) -> bool {
    !items.is_empty()
        && items.iter().all(|v| {
            v.as_object()
                .and_then(|o| o.get("type"))
                .and_then(|t| t.as_str())
                == Some("text")
        })
}

/// Join text-only inline nodes, preprocess Jira wiki, re-parse as Markdown inline (real `link` nodes, code styles).
fn try_rehydrate_plain_text_content_array(content: &mut Vec<Value>) -> bool {
    if !content_array_is_plain_text_only(content) {
        return false;
    }
    let joined: String = content
        .iter()
        .filter_map(|v| {
            v.as_object()
                .and_then(|o| o.get("text"))
                .and_then(|t| t.as_str())
        })
        .collect::<Vec<_>>()
        .concat();
    let new_segments = blocknote_inline_from_jira_plain_text(&joined);
    if new_segments == *content {
        return false;
    }
    *content = new_segments;
    true
}

fn expand_jira_emoticons_in_inline(v: &mut Value) -> bool {
    match v {
        Value::Object(map) => {
            let mut changed = false;
            if map.get("type").and_then(|t| t.as_str()) == Some("text") {
                if let Some(Value::String(tx)) = map.get_mut("text") {
                    let expanded = preprocess_jira_wiki_plain_text(tx);
                    if expanded != *tx {
                        *tx = expanded;
                        changed = true;
                    }
                }
            }
            if let Some(Value::Array(inner)) = map.get_mut("content") {
                for x in inner.iter_mut() {
                    changed |= expand_jira_emoticons_in_inline(x);
                }
            }
            changed
        }
        Value::Array(arr) => arr
            .iter_mut()
            .fold(false, |acc, x| acc | expand_jira_emoticons_in_inline(x)),
        _ => false,
    }
}

fn expand_jira_emoticons_in_block(v: &mut Value) -> bool {
    let mut changed = false;
    if let Some(obj) = v.as_object_mut() {
        let typ = obj.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if matches!(
            typ,
            "paragraph" | "heading" | "bulletListItem" | "numberedListItem" | "toggleListItem" | "checkListItem"
        ) {
            if let Some(Value::Array(content)) = obj.get_mut("content") {
                if try_rehydrate_plain_text_content_array(content) {
                    changed = true;
                } else {
                    for item in content.iter_mut() {
                        changed |= expand_jira_emoticons_in_inline(item);
                    }
                }
            }
        } else if let Some(Value::Array(content)) = obj.get_mut("content") {
            for item in content.iter_mut() {
                changed |= expand_jira_emoticons_in_inline(item);
            }
        }
        if let Some(Value::Array(children)) = obj.get_mut("children") {
            for ch in children.iter_mut() {
                changed |= expand_jira_emoticons_in_block(ch);
            }
        }
    }
    changed
}

/// Replace Jira `(/)`, `(x)`, etc. inside BlockNote `text` nodes (existing imports).
pub fn maybe_expand_jira_emoticons_in_blocknote(s: &str) -> Option<String> {
    let t = s.trim();
    if !is_blocknote_doc_json_string(t) {
        return None;
    }
    let mut arr: Vec<Value> = serde_json::from_str(t).ok()?;
    let mut any = false;
    for b in &mut arr {
        any |= expand_jira_emoticons_in_block(b);
    }
    if !any {
        return None;
    }
    serde_json::to_string(&arr).ok()
}
