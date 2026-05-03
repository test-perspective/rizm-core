//! Inline Markdown / Jira wiki parsing into BlockNote content segments.

use serde_json::{json, Value};

use super::preprocess::{preprocess_jira_wiki_plain_text, JIRA_COLOR_CLOSE, JIRA_COLOR_OPEN};

/// True if `line` starts with a single `*` (not `**`) and has no later lone `*` that could close `*italic*`.
/// Jira text uses `*word` without a closing asterisk; Markdown uses `*phrase*`.
fn should_emit_literal_leading_asterisk(line: &str) -> bool {
    let b = line.as_bytes();
    if b.first() != Some(&b'*') {
        return false;
    }
    if b.get(1) == Some(&b'*') {
        return false;
    }
    let Some(c1) = line.chars().nth(1) else {
        return false;
    };
    if c1.is_whitespace() {
        return false;
    }
    !has_lone_asterisk_after(line, 1)
}

/// Normalized CSS color string for BlockNote `styles.textColor` (hex always `#`-prefixed when digits-only).
fn jira_color_spec_normalized(spec: &str) -> Option<String> {
    let t = spec.trim();
    if t.is_empty() {
        return None;
    }
    if t.starts_with('#') {
        let hex = &t[1..];
        if (hex.len() == 3 || hex.len() == 6 || hex.len() == 8)
            && hex.chars().all(|c| c.is_ascii_hexdigit())
        {
            return Some(t.to_string());
        }
        return None;
    }
    // Jira sometimes exports `FF5630` without `#`.
    if (t.len() == 3 || t.len() == 6 || t.len() == 8) && t.chars().all(|c| c.is_ascii_hexdigit()) {
        return Some(format!("#{t}"));
    }
    if t.chars().all(|c| c.is_ascii_alphabetic()) && t.len() <= 40 {
        return Some(t.to_string());
    }
    let tl = t.to_ascii_lowercase();
    if tl.starts_with("rgb(") && tl.ends_with(')') {
        let inner = tl.strip_prefix("rgb(").and_then(|s| s.strip_suffix(')'))?;
        let parts: Vec<&str> = inner.split(',').map(str::trim).collect();
        if parts.len() == 3
            && parts.iter().all(|p| {
                p.parse::<u8>().is_ok()
                    || (p.ends_with('%') && p[..p.len() - 1].trim().parse::<f64>().is_ok())
            })
        {
            return Some(t.to_string());
        }
    }
    None
}

/// If `s` starts with `{color:spec}`, returns `(spec, inner, total_byte_len_consumed)` including close `{color}`.
fn consume_jira_color_span(s: &str) -> Option<(String, String, usize)> {
    if !s.starts_with(JIRA_COLOR_OPEN) {
        return None;
    }
    let after_prefix = &s[JIRA_COLOR_OPEN.len()..];
    let close_spec = after_prefix.find('}')?;
    let spec = after_prefix[..close_spec].trim().to_string();
    if spec.is_empty() {
        return None;
    }
    let body_start = JIRA_COLOR_OPEN.len() + close_spec + 1;
    let mut depth = 1usize;
    let mut i = body_start;
    while i < s.len() && depth > 0 {
        if s[i..].starts_with(JIRA_COLOR_OPEN) {
            let after = &s[i + JIRA_COLOR_OPEN.len()..];
            let end_spec = after.find('}')?;
            i += JIRA_COLOR_OPEN.len() + end_spec + 1;
            depth += 1;
            continue;
        }
        if s[i..].starts_with(JIRA_COLOR_CLOSE) && !s[i..].starts_with(JIRA_COLOR_OPEN) {
            depth -= 1;
            if depth == 0 {
                let inner = s[body_start..i].to_string();
                let consumed = i + JIRA_COLOR_CLOSE.len();
                return Some((spec, inner, consumed));
            }
            i += JIRA_COLOR_CLOSE.len();
            continue;
        }
        i += s[i..].chars().next().map(|c| c.len_utf8()).unwrap_or(1);
    }
    if depth == 1 {
        let inner = s[body_start..].to_string();
        return Some((spec, inner, s.len()));
    }
    None
}

/// Sets `textColor` only where not already set (nested `{color:…}` inner wins).
fn merge_jira_text_color_if_missing(mut segments: Vec<Value>, color: &str) -> Vec<Value> {
    for seg in &mut segments {
        let Some(obj) = seg.as_object_mut() else {
            continue;
        };
        match obj.get("type").and_then(|t| t.as_str()) {
            Some("text") => {
                let styles = obj.entry("styles").or_insert_with(|| json!({}));
                if let Some(m) = styles.as_object_mut() {
                    if !m.contains_key("textColor") {
                        m.insert("textColor".to_string(), Value::String(color.to_string()));
                    }
                }
            }
            Some("link") => {
                if let Some(Value::Array(items)) = obj.get_mut("content") {
                    let taken = std::mem::take(items);
                    *items = merge_jira_text_color_if_missing(taken, color);
                }
            }
            _ => {}
        }
    }
    segments
}

fn has_lone_asterisk_after(line: &str, mut i: usize) -> bool {
    let b = line.as_bytes();
    while i < b.len() {
        if b[i] == b'*' {
            if i + 1 < b.len() && b[i + 1] == b'*' {
                i += 2;
                continue;
            }
            return true;
        }
        let step = line[i..]
            .chars()
            .next()
            .map(|c| c.len_utf8())
            .unwrap_or(1);
        i += step;
    }
    false
}

/// Build `link` content for `[label](url)` without nesting a second `link` when `label` is the same URL
/// (parse_inline_markdown would autolabel `https://...` into a link, breaking BlockNote clients).
fn link_content_for_markdown_link(url: &str, label: &str) -> Vec<Value> {
    let parsed = parse_inline_markdown(label.trim());
    if parsed.len() == 1 {
        if let Some(obj) = parsed[0].as_object() {
            if obj.get("type").and_then(|t| t.as_str()) == Some("link")
                && obj.get("href").and_then(|h| h.as_str()) == Some(url)
            {
                return obj
                    .get("content")
                    .and_then(|c| c.as_array())
                    .cloned()
                    .unwrap_or_else(|| {
                        vec![json!({
                            "type": "text",
                            "text": label.trim(),
                            "styles": {}
                        })]
                    });
            }
        }
    }
    parsed
}

/// `[label](url)` inline link. Returns `(json, bytes_consumed_from_rest)`.
fn try_parse_markdown_inline_link(rest: &str) -> Option<(Value, usize)> {
    if !rest.starts_with('[') {
        return None;
    }
    let close_lb = rest.find("](")?;
    let label = &rest[1..close_lb];
    let after = &rest[close_lb + 2..];
    let close_paren = after.find(')')?;
    let url = after[..close_paren].trim();
    if url.is_empty() {
        return None;
    }
    let label_content = link_content_for_markdown_link(url, label);
    let consumed = close_lb + 2 + close_paren + 1;
    Some((
        json!({
            "type": "link",
            "href": url,
            "content": label_content
        }),
        consumed,
    ))
}

/// Length of a bare `http://` / `https://` URL starting at `rest`.
fn autolink_http_url_consumed(rest: &str) -> Option<usize> {
    let min_len = if rest.starts_with("https://") {
        8
    } else if rest.starts_with("http://") {
        7
    } else {
        return None;
    };
    let end_ws = rest
        .char_indices()
        .find(|(_, c)| c.is_whitespace())
        .map(|(i, _)| i)
        .unwrap_or(rest.len());
    if end_ws < min_len + 1 {
        return None;
    }
    let mut end = end_ws;
    while end > min_len {
        let last = rest[..end].chars().next_back()?;
        if matches!(last, ',' | '.' | ';' | '!' | '?') {
            end -= last.len_utf8();
        } else if last == ')' {
            end -= last.len_utf8();
        } else {
            break;
        }
    }
    if end < min_len + 1 {
        return None;
    }
    Some(end)
}

pub(super) fn text_to_block_content(text: &str) -> Value {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        Value::Array(vec![])
    } else {
        let segments = parse_inline_markdown(trimmed);
        Value::Array(segments)
    }
}

/// One wiki source line after [`preprocess_jira_wiki_plain_text`] → BlockNote paragraph `content` segments.
pub fn jira_wiki_plain_line_to_inline_content(line: &str) -> Vec<Value> {
    parse_inline_markdown(line.trim_end())
}

/// Full paragraph (may include newlines) after [`preprocess_jira_wiki_plain_text`], e.g. multiline Jira `{color:…}`.
pub fn jira_wiki_preprocessed_paragraph_to_inline_content(s: &str) -> Vec<Value> {
    parse_inline_markdown(s.trim_end())
}

/// Preprocess Jira wiki / export artifacts on plain text, then split into BlockNote inline segments (links, code, bold).
pub fn blocknote_inline_from_jira_plain_text(joined: &str) -> Vec<Value> {
    let p = preprocess_jira_wiki_plain_text(joined);
    let t = p.trim();
    if t.is_empty() {
        return vec![];
    }
    parse_inline_markdown(t)
}

/// Parse inline Markdown (**bold**, *italic*, `code`) into BlockNote content segments.
fn parse_inline_markdown(line: &str) -> Vec<Value> {
    let mut segments: Vec<Value> = Vec::new();
    let mut i = 0;
    let n = line.len();

    while i < n {
        let rest = &line[i..];

        // Jira-style `*word` without closing `*` — not Markdown `*italic*`.
        if i == 0 && should_emit_literal_leading_asterisk(rest) {
            segments.push(json!({
                "type": "text",
                "text": "*",
                "styles": {}
            }));
            i += 1;
            continue;
        }

        if let Some((spec, inner, consumed)) = consume_jira_color_span(rest) {
            let inner_parsed = parse_inline_markdown(&inner);
            let styled = if let Some(c) = jira_color_spec_normalized(&spec) {
                merge_jira_text_color_if_missing(inner_parsed, &c)
            } else {
                inner_parsed
            };
            segments.extend(styled);
            i += consumed;
            continue;
        }

        if rest.starts_with('[') {
            if let Some((link_val, consumed)) = try_parse_markdown_inline_link(rest) {
                segments.push(link_val);
                i += consumed;
                continue;
            }
            segments.push(json!({
                "type": "text",
                "text": "[",
                "styles": {}
            }));
            i += 1;
            continue;
        }

        if let Some(url_end) = autolink_http_url_consumed(rest) {
            let url = &rest[..url_end];
            segments.push(json!({
                "type": "link",
                "href": url,
                "content": [{
                    "type": "text",
                    "text": url,
                    "styles": {}
                }]
            }));
            i += url_end;
            continue;
        }

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
                // Unclosed delimiter - treat as literal and advance (avoid spinning on a lone `*`).
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
                if r.starts_with('[')
                    || r.starts_with("https://")
                    || r.starts_with("http://")
                    || r.starts_with(JIRA_COLOR_OPEN)
                    || r.starts_with("***")
                    || r.starts_with("___")
                    || r.starts_with("**")
                    || r.starts_with("__")
                    || (r.starts_with('*')
                        && !r.get(1..2).map(|s| s.starts_with('*')).unwrap_or(false))
                    || (r.starts_with('_')
                        && !r.get(1..2).map(|s| s.starts_with('_')).unwrap_or(false))
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
