//! ADF mark helpers: convert Jira marks to BlockNote inline styles.

use serde_json::{json, Map, Value};

pub(super) fn adf_marks_to_styles(marks: Option<&Value>) -> Value {
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

pub(super) fn adf_link_href_from_marks(marks: Option<&Value>) -> Option<String> {
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

pub(super) fn merge_adf_base_styles_into_segments(
    mut segments: Vec<Value>,
    base_styles: &Value,
) -> Vec<Value> {
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
