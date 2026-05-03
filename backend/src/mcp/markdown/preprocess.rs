//! Jira wiki / Confluence export cleanup before Markdown parsing.

use super::super::jira_emoticons::replace_jira_emoticons;

/// Jira wiki `{color:#hex|name|rgb(...)}body{color}` (ASCII-delimiter markers; body parsed elsewhere).
pub(super) const JIRA_COLOR_OPEN: &str = "{color:";
pub(super) const JIRA_COLOR_CLOSE: &str = "{color}";

/// First `http://` or `https://` URL in `s`, stopping before `|`, `]`, whitespace, or common trailing CJK punctuation.
pub fn extract_first_http_url(s: &str) -> Option<String> {
    let b = s.as_bytes();
    let mut i = 0usize;
    while i < b.len() {
        let rest = &s[i..];
        let is_start = rest.starts_with("https://") || rest.starts_with("http://");
        if !is_start {
            i += s[i..].chars().next().map(|c| c.len_utf8()).unwrap_or(1);
            continue;
        }
        let mut end = i;
        for ch in rest.chars() {
            if ch.is_whitespace()
                || ch == '|'
                || ch == ']'
                || matches!(ch, ')' | '」' | '。' | '、' | '，' | '．')
            {
                break;
            }
            end += ch.len_utf8();
        }
        if end > i && end - i > "https://x".len() {
            return Some(s[i..end].to_string());
        }
        i += 1;
    }
    None
}

/// If `input[start]` is `[` and the span is a Jira-style link, returns `(byte_len, markdown_replacement)`.
fn try_jira_bracket_link_at(input: &str, start: usize) -> Option<(usize, String)> {
    let b = input.as_bytes();
    if b.get(start) != Some(&b'[') {
        return None;
    }
    let mut i = start + 1;
    let mut depth = 1usize;
    let inner_start = i;
    let inner_end = loop {
        if i >= b.len() {
            return None;
        }
        match b[i] {
            b'[' => depth += 1,
            b']' => {
                depth -= 1;
                if depth == 0 {
                    break i;
                }
            }
            _ => {}
        }
        i += 1;
    };
    let inner = input.get(inner_start..inner_end)?;
    let consumed = inner_end - start + 1;
    if let Some(pipe) = inner.find('|') {
        let label = inner[..pipe].trim();
        let right = inner[pipe + 1..].trim();
        if right.starts_with("mailto:") && right.len() > "mailto:".len() {
            let label_out = if label.is_empty() {
                right.trim_start_matches("mailto:").to_string()
            } else {
                label.to_string()
            };
            return Some((consumed, format!("[{label_out}]({right})")));
        }
        if let Some(url) = extract_first_http_url(right) {
            let label_out = if label.is_empty() {
                url.clone()
            } else {
                label.to_string()
            };
            return Some((consumed, format!("[{label_out}]({url})")));
        }
    }
    let trim = inner.trim();
    if trim.starts_with("http://") || trim.starts_with("https://") {
        let url = extract_first_http_url(trim)?;
        return Some((consumed, url));
    }
    None
}

/// Convert Jira wiki `[alias|url]` and `[url]` to CommonMark before parsing.
pub fn normalize_jira_wiki_bracket_links(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let b = input.as_bytes();
    let mut i = 0usize;
    while i < b.len() {
        if b.get(i) == Some(&b'[') {
            if let Some((consumed, replacement)) = try_jira_bracket_link_at(input, i) {
                out.push_str(&replacement);
                i += consumed;
                continue;
            }
        }
        let ch = input[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

/// `<[user@x|mailto:user@x]>` (Jira / Confluence) → Markdown link.
pub fn normalize_jira_angle_mailto_links(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut i = 0usize;
    while i < input.len() {
        if input[i..].starts_with("<[") {
            if let Some(rel) = input.get(i + 2..).and_then(|s| s.find("]>")) {
                let inner = &input[i + 2..i + 2 + rel];
                if let Some(pipe) = inner.find('|') {
                    let left = inner[..pipe].trim();
                    let right = inner[pipe + 1..].trim();
                    if right.starts_with("mailto:") && right.len() > "mailto:".len() {
                        out.push('[');
                        out.push_str(if left.is_empty() {
                            right.trim_start_matches("mailto:")
                        } else {
                            left
                        });
                        out.push_str("](");
                        out.push_str(right);
                        out.push(')');
                        i += 2 + rel + 2;
                        continue;
                    }
                }
            }
        }
        let ch = input[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

/// Remove stray `{quote}` tokens (e.g. inside a segment after structural panels are extracted).
pub fn strip_jira_quote_markers(input: &str) -> String {
    input.replace("{quote}", "")
}

fn double_brace_template_inner_is_valid(inner: &str) -> bool {
    let t = inner.trim();
    if t.is_empty() {
        return false;
    }
    // Avoid nested `{{` / `}}` inside the token; disallow control chars and newlines.
    if t.contains('{') || t.contains('}') {
        return false;
    }
    !t.chars().any(|c| c.is_control())
}

/// `{{pageVar}}` / `{{avi:confluence:...}}` → `` `...` `` (Jira/Confluence smart fields in exports).
pub fn normalize_jira_double_brace_templates(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(pos) = rest.find("{{") {
        out.push_str(&rest[..pos]);
        let after_open = &rest[pos + 2..];
        if let Some(end_rel) = after_open.find("}}") {
            let inner = &after_open[..end_rel];
            if double_brace_template_inner_is_valid(inner) {
                out.push('`');
                out.push_str(inner.trim());
                out.push('`');
                rest = &after_open[end_rel + 2..];
            } else {
                out.push_str("{{");
                rest = after_open;
            }
        } else {
            out.push_str(&rest[pos..]);
            return out;
        }
    }
    out.push_str(rest);
    out
}

/// Byte length of `s` prefix if `s` starts with ASCII `prefix`, compared case-insensitively.
fn ascii_prefix_match_len_ci(s: &str, prefix: &str) -> Option<usize> {
    let mut off = 0usize;
    for pc in prefix.chars() {
        let rest = s.get(off..)?;
        let sc = rest.chars().next()?;
        if !sc.is_ascii() || !sc.eq_ignore_ascii_case(&pc) {
            return None;
        }
        off += sc.len_utf8();
    }
    Some(off)
}

/// Normalize `{Color:…}` / `{COLOR}` to `{color:…}` / `{color}` so parsers and `contains("{color:")` match Jira exports.
/// Uses char-safe matching so UTF-8 text after `{` (e.g. `1x}}（…`) never panics on byte slices.
pub fn normalize_jira_wiki_color_delimiters(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut i = 0usize;
    while i < input.len() {
        let tail = &input[i..];
        if let Some(after_brace) = tail.strip_prefix('{') {
            if let Some(n_color) = ascii_prefix_match_len_ci(after_brace, "color") {
                let after_color = &after_brace[n_color..];
                if let Some(after_colon) = after_color.strip_prefix(':') {
                    if let Some(rel_end) = after_colon.find('}') {
                        out.push_str(JIRA_COLOR_OPEN);
                        out.push_str(&after_colon[..rel_end]);
                        out.push('}');
                        i += 1 + n_color + ':'.len_utf8() + rel_end + '}'.len_utf8();
                        continue;
                    }
                } else if after_color.starts_with('}') {
                    out.push_str(JIRA_COLOR_CLOSE);
                    i += 1 + n_color + '}'.len_utf8();
                    continue;
                }
            }
        }
        let ch = tail.chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

/// Full Jira wiki / export cleanup before Markdown line parsing.
pub fn preprocess_jira_wiki_plain_text(input: &str) -> String {
    let s = normalize_jira_wiki_color_delimiters(input);
    let s = normalize_jira_angle_mailto_links(&s);
    let s = normalize_jira_wiki_bracket_links(&s);
    let s = normalize_jira_double_brace_templates(&s);
    let s = strip_jira_quote_markers(&s);
    replace_jira_emoticons(&s)
}
