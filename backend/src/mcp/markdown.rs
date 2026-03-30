use anyhow::Context;
use serde_json::{json, Value};
use uuid::Uuid;

pub fn markdown_to_blocknote_doc(text: &str) -> anyhow::Result<String> {
    let normalized = text.replace("\r\n", "\n");
    if normalized.trim().is_empty() {
        anyhow::bail!("empty text");
    }

    let mut blocks: Vec<Value> = Vec::new();
    for line in normalized.lines() {
        let block = if let Some(rest) = line.strip_prefix("### ") {
            make_heading_block(3, rest)
        } else if let Some(rest) = line.strip_prefix("## ") {
            make_heading_block(2, rest)
        } else if let Some(rest) = line.strip_prefix("# ") {
            make_heading_block(1, rest)
        } else if let Some(rest) = line.strip_prefix("- ") {
            make_bullet_block(rest)
        } else if let Some(rest) = line.strip_prefix("* ") {
            make_bullet_block(rest)
        } else {
            make_paragraph_block(line)
        };
        blocks.push(block);
    }
    if blocks.is_empty() {
        blocks.push(make_paragraph_block(""));
    }
    serde_json::to_string(&blocks).context("serialize comment doc")
}

fn make_heading_block(level: i64, text: &str) -> Value {
    let mut props = default_block_props().as_object().cloned().unwrap_or_default();
    props.insert("level".to_string(), Value::Number(serde_json::Number::from(level)));
    serde_json::json!({
        "id": Uuid::new_v4().to_string(),
        "type": "heading",
        "props": props,
        "content": text_to_block_content(text),
        "children": []
    })
}

fn default_block_props() -> Value {
    json!({
        "backgroundColor": "default",
        "textColor": "default",
        "textAlignment": "left"
    })
}

fn make_bullet_block(text: &str) -> Value {
    serde_json::json!({
        "id": Uuid::new_v4().to_string(),
        "type": "bulletListItem",
        "props": default_block_props(),
        "content": text_to_block_content(text),
        "children": []
    })
}

fn make_paragraph_block(text: &str) -> Value {
    serde_json::json!({
        "id": Uuid::new_v4().to_string(),
        "type": "paragraph",
        "props": default_block_props(),
        "content": text_to_block_content(text),
        "children": []
    })
}

fn text_to_block_content(text: &str) -> Value {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        Value::Array(vec![])
    } else {
        let segments = parse_inline_markdown(trimmed);
        Value::Array(segments)
    }
}

/// Parse inline Markdown (**bold**, *italic*, `code`) into BlockNote content segments.
fn parse_inline_markdown(line: &str) -> Vec<Value> {
    let mut segments: Vec<Value> = Vec::new();
    let mut i = 0;
    let n = line.len();

    while i < n {
        let rest = &line[i..];

        // Match delimiters (longest first): ***, **, *, ___, __, _, `code`
        let (delim, style, len) = if rest.starts_with("***") {
            (Some("***"), json!({"bold": true, "italic": true}), 3)
        } else if rest.starts_with("___") {
            (Some("___"), json!({"bold": true, "italic": true}), 3)
        } else if rest.starts_with("**") {
            (Some("**"), json!({"bold": true}), 2)
        } else if rest.starts_with("__") {
            (Some("__"), json!({"bold": true}), 2)
        } else if rest.starts_with("*")
            && !rest.get(1..2).map(|s| s.starts_with('*')).unwrap_or(false)
        {
            (Some("*"), json!({"italic": true}), 1)
        } else if rest.starts_with("_")
            && !rest.get(1..2).map(|s| s.starts_with('_')).unwrap_or(false)
        {
            (Some("_"), json!({"italic": true}), 1)
        } else if rest.starts_with('`') {
            (Some("`"), json!({"code": true}), 1)
        } else {
            (None, json!({}), 0)
        };

        if let Some(d) = delim {
            i += len;
            if let Some(close) = rest[len..].find(d) {
                let end = i + close;
                let inner = &line[i..end];
                if !inner.is_empty() {
                    segments.push(json!({
                        "type": "text",
                        "text": inner,
                        "styles": style
                    }));
                }
                i = end + len;
            } else {
                // Unclosed delimiter - treat as literal
                segments.push(json!({
                    "type": "text",
                    "text": &line[i - len..i],
                    "styles": {}
                }));
            }
        } else {
            // No delimiter - collect plain text until next delimiter
            let mut j = i;
            while j < n {
                let r = &line[j..];
                if r.starts_with("***")
                    || r.starts_with("___")
                    || r.starts_with("**")
                    || r.starts_with("__")
                    || (r.starts_with('*') && !r.get(1..2).map(|s| s.starts_with('*')).unwrap_or(false))
                    || (r.starts_with('_') && !r.get(1..2).map(|s| s.starts_with('_')).unwrap_or(false))
                    || r.starts_with('`')
                {
                    break;
                }
                j += r.chars().next().map(|c| c.len_utf8()).unwrap_or(1);
            }
            let plain = &line[i..j];
            if !plain.is_empty() {
                segments.push(json!({
                    "type": "text",
                    "text": plain,
                    "styles": {}
                }));
            }
            i = j;
        }
    }

    if segments.is_empty() {
        segments.push(json!({
            "type": "text",
            "text": line,
            "styles": {}
        }));
    }
    segments
}
