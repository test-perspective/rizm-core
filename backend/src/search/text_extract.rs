use serde_json::Value;

use crate::models::Entity;

#[derive(Debug, Clone)]
pub struct EntityText {
    pub title: String,
    pub content: String,
}

pub fn extract_entity_text(entity: &Entity) -> EntityText {
    match entity.entity_id.as_str() {
        "task" | "item" => {
            let title = entity
                .properties
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Untitled Task")
                .to_string();
            let desc_value = entity
                .properties
                .get("Description")
                .or_else(|| entity.properties.get("description"));
            let content = desc_value.map(extract_text_from_value).unwrap_or_default();
            EntityText { title, content }
        }
        "wikiPage" => {
            let title = entity
                .properties
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Untitled")
                .to_string();
            let doc_value = entity.properties.get("doc");
            let content = doc_value.map(extract_text_from_value).unwrap_or_default();
            EntityText { title, content }
        }
        _ => EntityText {
            title: "Untitled".to_string(),
            content: String::new(),
        },
    }
}

pub fn extract_text_from_value(value: &Value) -> String {
    if let Some(s) = value.as_str() {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            return String::new();
        }
        if let Ok(parsed) = serde_json::from_str::<Value>(trimmed) {
            return normalize_text(collect_text(&parsed));
        }
        return normalize_text(trimmed.to_string());
    }

    normalize_text(collect_text(value))
}

fn collect_text(value: &Value) -> String {
    let mut out = String::new();
    collect_text_inner(value, &mut out, false);
    out
}

fn collect_text_inner(value: &Value, out: &mut String, allow_string: bool) {
    match value {
        Value::String(s) => {
            if allow_string && !s.trim().is_empty() {
                out.push_str(s);
                out.push(' ');
            }
        }
        Value::Array(items) => {
            for v in items {
                collect_text_inner(v, out, false);
            }
        }
        Value::Object(map) => {
            for (k, v) in map {
                if k == "text" {
                    if let Some(s) = v.as_str() {
                        if !s.trim().is_empty() {
                            out.push_str(s);
                            out.push(' ');
                            continue;
                        }
                    }
                }
                if k == "type" {
                    continue;
                }
                if v.is_string() {
                    continue;
                }
                collect_text_inner(v, out, false);
            }
        }
        _ => {}
    }
}

fn normalize_text(s: String) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn chunk_text(text: &str, max_chars: usize, overlap: usize) -> Vec<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return vec![];
    }
    let chars: Vec<char> = trimmed.chars().collect();
    if chars.len() <= max_chars {
        return vec![trimmed.to_string()];
    }
    let mut chunks = Vec::new();
    let mut start = 0usize;
    while start < chars.len() {
        let end = usize::min(start + max_chars, chars.len());
        let chunk: String = chars[start..end].iter().collect();
        chunks.push(chunk);
        if end == chars.len() {
            break;
        }
        let next_start = if end > overlap { end - overlap } else { 0 };
        start = usize::min(next_start, chars.len());
    }
    chunks
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn extract_text_from_json_doc() {
        let doc = json!([
            { "type": "paragraph", "content": [{ "type": "text", "text": "Hello" }] },
            { "type": "paragraph", "content": [{ "type": "text", "text": "World" }] }
        ]);
        let raw = serde_json::to_string(&doc).expect("serialize");
        let value = Value::String(raw);
        let text = extract_text_from_value(&value);
        assert_eq!(text, "Hello World");
    }

    #[test]
    fn extract_text_from_stringified_block_array_supports_japanese() {
        let doc = json!([
            { "id": "a", "text": "エクスポート" },
            { "id": "b", "text": "手順" }
        ]);
        let raw = serde_json::to_string(&doc).expect("serialize");
        let value = Value::String(raw);
        let text = extract_text_from_value(&value);
        assert_eq!(text, "エクスポート 手順");
    }

    #[test]
    fn extract_text_from_nested_content_supports_japanese() {
        let doc = json!([
            {
                "type": "paragraph",
                "content": [{ "type": "text", "text": "エクスポート方法" }]
            },
            {
                "type": "bulletList",
                "content": [
                    {
                        "type": "listItem",
                        "content": [{ "type": "text", "text": "CSV" }]
                    }
                ]
            }
        ]);
        let raw = serde_json::to_string(&doc).expect("serialize");
        let value = Value::String(raw);
        let text = extract_text_from_value(&value);
        assert_eq!(text, "エクスポート方法 CSV");
    }

    #[test]
    fn chunk_text_respects_overlap() {
        let text = "abcdefghijklmnopqrstuvwxyz";
        let chunks = chunk_text(text, 10, 2);
        assert!(!chunks.is_empty());
        assert!(chunks[0].len() <= 10);
        if chunks.len() > 1 {
            let tail = &chunks[0][chunks[0].len().saturating_sub(2)..];
            assert!(chunks[1].starts_with(tail));
        }
    }
}
