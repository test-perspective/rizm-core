use anyhow::Context;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::import::code_block_note;

use super::jira_emoticons::replace_jira_emoticons;

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

/// `{{pageVar}}` / `{{read:attachment:confluence…}}` (incl. CJK) → `` `...` `` (Confluence smart fields / export placeholders).
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

/// Jira wiki `{color:#hex|name|rgb(...)}body{color}` (ASCII-delimiter markers; body parsed elsewhere).
const JIRA_COLOR_OPEN: &str = "{color:";
const JIRA_COLOR_CLOSE: &str = "{color}";

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

#[derive(Debug, Clone, Copy)]
enum JiraQuoteSegment<'a> {
    Outside(&'a str),
    Quoted(&'a str),
}

#[derive(Debug, Clone, Copy)]
enum JiraNoformatSegment<'a> {
    Outside(&'a str),
    Noformatted(&'a str),
}

#[derive(Debug, Clone, Copy)]
enum JiraCodeSegment<'a> {
    Outside(&'a str),
    Coded {
        body: &'a str,
        language: Option<&'a str>,
    },
}

/// `{code}` or `{code:lang}` open tag: `(total_open_len, language_if_any)`.
fn parse_jira_code_open(s: &str) -> Option<(usize, Option<&str>)> {
    const PREFIX: &str = "{code";
    if !s.starts_with(PREFIX) {
        return None;
    }
    let after = s.get(PREFIX.len()..)?;
    if after.starts_with('}') {
        return Some((PREFIX.len() + 1, None));
    }
    if after.starts_with(':') {
        let rest = after.get(1..)?;
        let end_rel = rest.find('}')?;
        let lang_raw = rest.get(..end_rel)?;
        let lang_trim = lang_raw.trim();
        let language = if lang_trim.is_empty() {
            None
        } else {
            Some(lang_trim)
        };
        let open_len = PREFIX.len() + 1 + end_rel + 1;
        return Some((open_len, language));
    }
    None
}

/// First `{code}` close tag in `s` (exact `{code}`, not `{code:…}` open tags).
fn find_jira_code_close_tag(s: &str) -> Option<usize> {
    let mut start = 0usize;
    while start < s.len() {
        let rel = s.get(start..)?.find("{code}")?;
        let i = start + rel;
        if s.get(i..).is_some_and(|t| t.starts_with("{code}") && !t.starts_with("{code:")) {
            return Some(i);
        }
        start = i + 1;
    }
    None
}

/// Split on Jira `{code}` / `{code:…}` … `{code}`; unclosed opening runs to end as `Coded`.
fn split_jira_code_segments(input: &str) -> Vec<JiraCodeSegment<'_>> {
    let mut out = Vec::new();
    let mut rest = input;
    while !rest.is_empty() {
        let Some(pos) = rest.find("{code") else {
            out.push(JiraCodeSegment::Outside(rest));
            break;
        };
        let from_open = &rest[pos..];
        let Some((open_len, language)) = parse_jira_code_open(from_open) else {
            if pos > 0 {
                out.push(JiraCodeSegment::Outside(&rest[..pos]));
            }
            rest = &rest[(pos + 1).min(rest.len())..];
            continue;
        };
        if pos > 0 {
            out.push(JiraCodeSegment::Outside(&rest[..pos]));
        }
        let after_open = &from_open[open_len..];
        match find_jira_code_close_tag(after_open) {
            Some(close_rel) => {
                out.push(JiraCodeSegment::Coded {
                    body: &after_open[..close_rel],
                    language,
                });
                rest = &after_open[close_rel + "{code}".len()..];
            }
            None => {
                out.push(JiraCodeSegment::Coded {
                    body: after_open,
                    language,
                });
                break;
            }
        }
    }
    out
}

fn markdown_lines_with_jira_code(preprocessed: &str) -> anyhow::Result<Vec<Value>> {
    let mut blocks: Vec<Value> = Vec::new();
    for seg in split_jira_code_segments(preprocessed) {
        match seg {
            JiraCodeSegment::Outside(x) => {
                if x.trim().is_empty() {
                    continue;
                }
                blocks.extend(markdown_lines_to_blocks(x)?);
            }
            JiraCodeSegment::Coded { body, language } => {
                let lang = language.unwrap_or("text");
                blocks.push(code_block_note(body, lang));
            }
        }
    }
    Ok(blocks)
}

/// Split on `{noformat}` markers; unclosed opening runs to end of string as `Noformatted`.
/// Inner text is kept verbatim (no wiki / Markdown preprocessing).
fn split_jira_noformat_segments(input: &str) -> Vec<JiraNoformatSegment<'_>> {
    const M: &str = "{noformat}";
    let mut out = Vec::new();
    let mut rest = input;
    while !rest.is_empty() {
        match rest.find(M) {
            None => {
                out.push(JiraNoformatSegment::Outside(rest));
                break;
            }
            Some(pos) => {
                if pos > 0 {
                    out.push(JiraNoformatSegment::Outside(&rest[..pos]));
                }
                rest = &rest[pos + M.len()..];
                match rest.find(M) {
                    Some(end) => {
                        out.push(JiraNoformatSegment::Noformatted(&rest[..end]));
                        rest = &rest[end + M.len()..];
                    }
                    None => {
                        if !rest.is_empty() {
                            out.push(JiraNoformatSegment::Noformatted(rest));
                        }
                        break;
                    }
                }
            }
        }
    }
    out
}

/// Split on `{quote}` markers; unclosed opening panel runs to end of string as `Quoted`.
fn split_jira_quote_segments(input: &str) -> Vec<JiraQuoteSegment<'_>> {
    const M: &str = "{quote}";
    let mut out = Vec::new();
    let mut rest = input;
    while !rest.is_empty() {
        match rest.find(M) {
            None => {
                out.push(JiraQuoteSegment::Outside(rest));
                break;
            }
            Some(pos) => {
                if pos > 0 {
                    out.push(JiraQuoteSegment::Outside(&rest[..pos]));
                }
                rest = &rest[pos + M.len()..];
                match rest.find(M) {
                    Some(end) => {
                        out.push(JiraQuoteSegment::Quoted(&rest[..end]));
                        rest = &rest[end + M.len()..];
                    }
                    None => {
                        if !rest.is_empty() {
                            out.push(JiraQuoteSegment::Quoted(rest));
                        }
                        break;
                    }
                }
            }
        }
    }
    out
}

fn markdown_lines_to_blocks(preprocessed: &str) -> anyhow::Result<Vec<Value>> {
    let mut bullets_buf: Vec<(usize, String)> = Vec::new();
    let mut blocks: Vec<Value> = Vec::new();

    for line in preprocessed.lines() {
        if line.trim().is_empty() {
            continue;
        }
        match parse_markdown_line(line) {
            ParsedLine::Heading(level, t) => {
                flush_bullet_buffer(&mut bullets_buf, &mut blocks);
                blocks.push(make_heading_block(i64::from(level), &t));
            }
            ParsedLine::Paragraph(t) => {
                flush_bullet_buffer(&mut bullets_buf, &mut blocks);
                blocks.push(make_paragraph_block(&t));
            }
            ParsedLine::Bullet { depth, text } => {
                bullets_buf.push((depth, text));
            }
        }
    }
    flush_bullet_buffer(&mut bullets_buf, &mut blocks);
    Ok(blocks)
}

fn make_quote_block(children: Vec<Value>) -> Value {
    serde_json::json!({
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

fn markdown_fragment_outside_noformat(s: &str) -> anyhow::Result<Vec<Value>> {
    let mut blocks: Vec<Value> = Vec::new();
    if s.contains("{quote}") {
        for seg in split_jira_quote_segments(s) {
            match seg {
                JiraQuoteSegment::Outside(x) => {
                    let pre = preprocess_jira_wiki_plain_text(x);
                    if pre.trim().is_empty() {
                        continue;
                    }
                    blocks.extend(markdown_lines_with_jira_code(&pre)?);
                }
                JiraQuoteSegment::Quoted(x) => {
                    let pre = preprocess_jira_wiki_plain_text(x);
                    if pre.trim().is_empty() {
                        continue;
                    }
                    let inner = markdown_lines_with_jira_code(&pre)?;
                    if inner.is_empty() {
                        continue;
                    }
                    blocks.push(make_quote_block(inner));
                }
            }
        }
    } else {
        let pre = preprocess_jira_wiki_plain_text(s);
        if pre.trim().is_empty() {
            return Ok(blocks);
        }
        blocks.extend(markdown_lines_with_jira_code(&pre)?);
    }
    Ok(blocks)
}

pub fn markdown_to_blocknote_doc(text: &str) -> anyhow::Result<String> {
    let normalized = text.replace("\r\n", "\n");
    let mut blocks: Vec<Value> = Vec::new();

    let has_panel_markers = normalized.contains("{quote}")
        || normalized.contains("{noformat}")
        || normalized.contains("{code}")
        || normalized.contains("{code:");

    if !has_panel_markers {
        let pre = preprocess_jira_wiki_plain_text(&normalized);
        if pre.trim().is_empty() {
            anyhow::bail!("empty text");
        }
        blocks = markdown_lines_with_jira_code(&pre)?;
    } else {
        for seg in split_jira_noformat_segments(&normalized) {
            match seg {
                JiraNoformatSegment::Outside(s) => {
                    blocks.extend(markdown_fragment_outside_noformat(s)?);
                }
                JiraNoformatSegment::Noformatted(s) => {
                    blocks.push(code_block_note(s, "text"));
                }
            }
        }
    }

    if blocks.is_empty() {
        blocks.push(make_paragraph_block(""));
    }
    serde_json::to_string(&blocks).context("serialize comment doc")
}

#[derive(Debug)]
enum ParsedLine {
    Heading(u8, String),
    Paragraph(String),
    Bullet { depth: usize, text: String },
}

fn leading_space_count(line: &str) -> (usize, &str) {
    let mut n = 0usize;
    for (i, c) in line.char_indices() {
        match c {
            ' ' => n += 1,
            '\t' => n += 2,
            _ => return (n, &line[i..]),
        }
    }
    (n, "")
}

/// Jira wiki nested bullets: `* `, `** `, `*** `, … (asterisk run + whitespace + body).
/// Does not match `**bold**` at line start (no whitespace after marker run).
fn jira_star_depth_and_body(s: &str) -> Option<(usize, &str)> {
    let b = s.as_bytes();
    let mut i = 0usize;
    while i < b.len() && b[i] == b'*' {
        i += 1;
    }
    if i == 0 {
        return None;
    }
    let rest = s.get(i..)?;
    let mut ch = rest.chars();
    let first = ch.next()?;
    if !first.is_whitespace() {
        return None;
    }
    let body = rest.trim_start();
    Some((i, body))
}

/// Jira/Confluence wiki `h1.` … `h6.` at line start (after optional spaces). Level clamped to 1–3 for BlockNote.
pub fn parse_jira_wiki_heading_line(rest: &str) -> Option<(u8, String)> {
    let t = rest.trim_start();
    let b = t.as_bytes();
    if b.len() < 3 {
        return None;
    }
    if !matches!(b[0], b'h' | b'H') {
        return None;
    }
    let level = char::from(b[1]).to_digit(10)? as u8;
    if !(1..=6).contains(&level) {
        return None;
    }
    if b.get(2) != Some(&b'.') {
        return None;
    }
    let title = t.get(3..)?.trim_start();
    if title.is_empty() {
        return None;
    }
    Some((level.clamp(1, 3), title.to_string()))
}

pub fn parse_atx_heading_line(rest: &str) -> Option<(u8, String)> {
    let bytes = rest.as_bytes();
    let mut n = 0usize;
    while n < bytes.len() && n < 6 && bytes[n] == b'#' {
        n += 1;
    }
    if n == 0 {
        return None;
    }
    let after_hashes = rest.get(n..)?;
    let title = after_hashes.trim_start();
    if title.is_empty() {
        return None;
    }
    let level = (n as u8).clamp(1, 3);
    Some((level, title.to_string()))
}

fn parse_markdown_line(line: &str) -> ParsedLine {
    let (spaces, rest) = leading_space_count(line);
    let md_indent = spaces / 2;

    if let Some((lvl, title)) = parse_jira_wiki_heading_line(rest) {
        return ParsedLine::Heading(lvl, title);
    }

    if let Some((lvl, title)) = parse_atx_heading_line(rest) {
        return ParsedLine::Heading(lvl, title);
    }

    if let Some((stars, body)) = jira_star_depth_and_body(rest) {
        return ParsedLine::Bullet {
            depth: md_indent + stars,
            text: body.to_string(),
        };
    }

    if let Some(t) = rest.strip_prefix("- ") {
        return ParsedLine::Bullet {
            depth: md_indent + 1,
            text: t.to_string(),
        };
    }

    ParsedLine::Paragraph(rest.to_string())
}

/// Jira `*` bullets allow `* a` then `**** b` (depth jumps by more than 1). [`consume_list_siblings`]
/// assumes each nesting step increases depth by exactly 1; gaps left `idx` stuck and the outer
/// `while` spun forever. Clamp skipped levels to `prev + 1`.
fn normalize_jira_bullet_depth_gap(items: Vec<(usize, String)>) -> Vec<(usize, String)> {
    if items.is_empty() {
        return items;
    }
    let mut out = Vec::with_capacity(items.len());
    let (d0, t0) = items[0].clone();
    out.push((d0, t0));
    let mut prev = d0;
    for (d, t) in items.into_iter().skip(1) {
        let d_norm = if d > prev + 1 { prev + 1 } else { d };
        prev = d_norm;
        out.push((d_norm, t));
    }
    out
}

fn flush_bullet_buffer(buf: &mut Vec<(usize, String)>, blocks: &mut Vec<Value>) {
    if buf.is_empty() {
        return;
    }
    let items = normalize_jira_bullet_depth_gap(std::mem::take(buf));
    let min_d = items[0].0;
    let mut idx = 0usize;
    let roots = consume_list_siblings(&items, &mut idx, min_d);
    for item in roots {
        blocks.push(list_item_to_value(&item));
    }
}

#[derive(Debug, Clone)]
struct ListItem {
    text: String,
    children: Vec<ListItem>,
}

fn consume_list_siblings(items: &[(usize, String)], idx: &mut usize, min_depth: usize) -> Vec<ListItem> {
    let mut out = Vec::new();
    while *idx < items.len() {
        let (d, text) = &items[*idx];
        if *d < min_depth {
            break;
        }
        if *d > min_depth {
            break;
        }
        *idx += 1;
        let mut node = ListItem {
            text: text.clone(),
            children: Vec::new(),
        };
        while *idx < items.len() && items[*idx].0 > *d {
            let before = *idx;
            node.children
                .extend(consume_list_siblings(items, idx, *d + 1));
            if *idx == before {
                break;
            }
        }
        out.push(node);
    }
    out
}

fn list_item_to_value(item: &ListItem) -> Value {
    let children: Vec<Value> = item.children.iter().map(list_item_to_value).collect();
    json!({
        "id": Uuid::new_v4().to_string(),
        "type": "bulletListItem",
        "props": default_block_props(),
        "content": text_to_block_content(&item.text),
        "children": children,
    })
}

/// BlockNote `heading` block (level 1–3) with inline `text` parsed from `title`.
pub fn blocknote_heading_value(level: u8, title: &str) -> Value {
    let level_i = (level as i64).clamp(1, 3);
    make_heading_block(level_i, title.trim())
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

fn make_paragraph_block(text: &str) -> Value {
    serde_json::json!({
        "id": Uuid::new_v4().to_string(),
        "type": "paragraph",
        "props": default_block_props(),
        "content": text_to_block_content(text),
        "children": []
    })
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
        if matches!(last, ',' | '.' | ';' | '!' | '?' ) {
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

fn text_to_block_content(text: &str) -> Value {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        Value::Array(vec![])
    } else {
        let segments = parse_inline_markdown(trimmed);
        Value::Array(segments)
    }
}

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
        if (hex.len() == 3 || hex.len() == 6 || hex.len() == 8) && hex.chars().all(|c| c.is_ascii_hexdigit()) {
            return Some(t.to_string());
        }
        return None;
    }
    // Jira sometimes exports `FF5630` without `#`
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
                p.parse::<u8>().is_ok() || (p.ends_with('%') && p[..p.len() - 1].trim().parse::<f64>().is_ok())
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

/// Scan for a single `*` that is not part of `**`.
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
        let step = line[i..].chars().next().map(|c| c.len_utf8()).unwrap_or(1);
        i += step;
    }
    false
}

/// One wiki source line after [`preprocess_jira_wiki_plain_text`] → BlockNote paragraph `content` segments.
pub fn jira_wiki_plain_line_to_inline_content(line: &str) -> Vec<Value> {
    parse_inline_markdown(line.trim_end())
}

/// Full paragraph (may include newlines) after [`preprocess_jira_wiki_plain_text`], e.g. multiline Jira `{color:…}`.
pub fn jira_wiki_preprocessed_paragraph_to_inline_content(s: &str) -> Vec<Value> {
    parse_inline_markdown(s.trim_end())
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

/// Preprocess Jira wiki / export artifacts on plain text, then split into BlockNote inline segments (links, code, bold).
pub fn blocknote_inline_from_jira_plain_text(joined: &str) -> Vec<Value> {
    let p = preprocess_jira_wiki_plain_text(joined);
    let t = p.trim();
    if t.is_empty() {
        return vec![];
    }
    parse_inline_markdown(t)
}

#[cfg(test)]
mod tests {
    use super::{markdown_to_blocknote_doc, normalize_jira_wiki_color_delimiters};
    use serde_json::Value;

    #[test]
    fn normalize_jira_color_delimiters_utf8_after_open_brace_does_not_panic() {
        let s = "1x}}（デフォルト）：標準的なサイズ。";
        assert_eq!(normalize_jira_wiki_color_delimiters(s), s);
    }

    #[test]
    fn normalize_jira_color_delimiters_case_insensitive_tags() {
        let s = "{Color:#abc}hi{Color}";
        assert_eq!(
            normalize_jira_wiki_color_delimiters(s),
            "{color:#abc}hi{color}"
        );
    }

    #[test]
    fn jira_nested_star_bullets_become_children() {
        let doc = markdown_to_blocknote_doc("* top\n** nested\n** nested2\n* top2").expect("convert");
        let arr: Vec<Value> = serde_json::from_str(&doc).expect("parse");
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0].get("type").and_then(Value::as_str), Some("bulletListItem"));
        let ch = arr[0].get("children").and_then(Value::as_array).expect("children");
        assert_eq!(ch.len(), 2, "expected two nested items under first top bullet");
        assert_eq!(
            ch[0].get("type").and_then(Value::as_str),
            Some("bulletListItem")
        );
    }

    /// Regression: `* a` then `**** b` used to infinite-loop in `consume_list_siblings` (child depth
    /// skipped `min_depth + 1`), stalling Jira comment/description import.
    #[test]
    fn jira_bullet_depth_gap_normalizes_and_finishes() {
        let doc = markdown_to_blocknote_doc("* top\n**** deep_jump").expect("convert");
        let arr: Vec<Value> = serde_json::from_str(&doc).expect("parse");
        assert_eq!(arr.len(), 1);
        let ch = arr[0].get("children").and_then(Value::as_array).expect("nested");
        assert_eq!(ch.len(), 1);
        assert_eq!(ch[0].get("type").and_then(Value::as_str), Some("bulletListItem"));
    }

    #[test]
    fn markdown_indented_dash_nests_under_parent() {
        let doc = markdown_to_blocknote_doc("- outer\n  - inner").expect("convert");
        let arr: Vec<Value> = serde_json::from_str(&doc).expect("parse");
        assert_eq!(arr.len(), 1);
        let ch = arr[0].get("children").and_then(Value::as_array).expect("children");
        assert_eq!(ch.len(), 1);
    }

    #[test]
    fn inline_autolink_https() {
        let doc = markdown_to_blocknote_doc("see https://example.com/path ok").expect("convert");
        let arr: Vec<Value> = serde_json::from_str(&doc).expect("parse");
        let c = arr[0].get("content").and_then(Value::as_array).expect("content");
        let link = c
            .iter()
            .find(|x| x.get("type").and_then(Value::as_str) == Some("link"))
            .expect("link segment");
        assert_eq!(
            link.get("href").and_then(Value::as_str),
            Some("https://example.com/path")
        );
    }

    #[test]
    fn inline_markdown_bracket_link() {
        let doc = markdown_to_blocknote_doc("[open](https://a.com/b)").expect("convert");
        let arr: Vec<Value> = serde_json::from_str(&doc).expect("parse");
        let c = arr[0].get("content").and_then(Value::as_array).expect("content");
        assert_eq!(c.len(), 1);
        assert_eq!(c[0].get("type").and_then(Value::as_str), Some("link"));
        assert_eq!(c[0].get("href").and_then(Value::as_str), Some("https://a.com/b"));
    }

    #[test]
    fn markdown_bracket_link_same_url_not_double_nested() {
        let doc = markdown_to_blocknote_doc("[https://ex.com/x](https://ex.com/x) tail").expect("convert");
        let arr: Vec<Value> = serde_json::from_str(&doc).expect("parse");
        let c = arr[0].get("content").and_then(Value::as_array).expect("content");
        let link = c
            .iter()
            .find(|x| x.get("type").and_then(Value::as_str) == Some("link"))
            .expect("link");
        let inner = link.get("content").and_then(Value::as_array).expect("inner");
        assert!(
            !inner.iter().any(|x| x.get("type").and_then(Value::as_str) == Some("link")),
            "must not nest link inside link: {:?}",
            inner
        );
    }

    #[test]
    fn jira_bracket_alias_pipe_url_becomes_markdown_link() {
        let doc = markdown_to_blocknote_doc(
            "[https://ex.com/x|https://ex.com/x] after",
        )
        .expect("convert");
        let arr: Vec<Value> = serde_json::from_str(&doc).expect("parse");
        let c = arr[0].get("content").and_then(Value::as_array).expect("content");
        let link = c
            .iter()
            .find(|x| x.get("type").and_then(Value::as_str) == Some("link"))
            .expect("link");
        assert_eq!(link.get("href").and_then(Value::as_str), Some("https://ex.com/x"));
    }

    #[test]
    fn jira_bracket_link_keeps_hash_fragment_in_https_url() {
        let url = "https://mail.example/mail/u/0/#inbox/FMfcgzQVxlQDDZjBsRbZdsspxksbZVrL";
        let line = format!("[{url}|{url}]");
        let doc = markdown_to_blocknote_doc(&line).expect("convert");
        let arr: Vec<Value> = serde_json::from_str(&doc).expect("parse");
        let c = arr[0].get("content").and_then(Value::as_array).expect("content");
        let link = c
            .iter()
            .find(|x| x.get("type").and_then(Value::as_str) == Some("link"))
            .expect("link");
        assert_eq!(link.get("href").and_then(Value::as_str), Some(url));
    }

    #[test]
    fn extract_first_http_url_stops_at_pipe() {
        assert_eq!(
            super::extract_first_http_url("https://a.com/b|https://a.com/b").as_deref(),
            Some("https://a.com/b")
        );
    }

    #[test]
    fn preprocess_angle_mailto_link() {
        let doc = markdown_to_blocknote_doc(
            "Contact <[a@b.com|mailto:a@b.com]> please",
        )
        .expect("convert");
        assert!(doc.contains("mailto:"), "{}", doc);
        assert!(doc.contains("link") || doc.contains("a@b.com"), "{}", doc);
    }

    #[test]
    fn preprocess_strips_quote_and_templates() {
        let doc = markdown_to_blocknote_doc("{quote}Hello{quote} and {{fetchPageName}}")
            .expect("convert");
        assert!(!doc.contains("{quote}"), "{}", doc);
        assert!(doc.contains("\"quote\""), "expected quote block: {}", doc);
        assert!(doc.contains("Hello"), "{}", doc);
        assert!(doc.contains("fetchPageName"), "{}", doc);
        assert!(
            doc.contains("\"code\":true"),
            "expected inline code style: {}",
            doc
        );
    }

    #[test]
    fn jira_quote_panel_wraps_multiline_content() {
        let doc = markdown_to_blocknote_doc("{quote}Line one\n\nLine two{quote}\n\nAfter").expect("convert");
        let arr: Vec<Value> = serde_json::from_str(&doc).expect("parse");
        let q = arr.iter().find(|b| b.get("type").and_then(Value::as_str) == Some("quote"));
        assert!(q.is_some(), "{}", doc);
        let ch = q.unwrap().get("children").and_then(Value::as_array).expect("children");
        assert!(ch.len() >= 2, "expected multiple blocks inside quote: {}", doc);
        assert!(doc.contains("After"), "{}", doc);
    }

    #[test]
    fn preprocess_confluence_colon_brace_template() {
        let doc = markdown_to_blocknote_doc("x {{avi:confluence:trashed:page}} y").expect("convert");
        assert!(!doc.contains("{{"), "{}", doc);
        assert!(doc.contains("avi:confluence:trashed:page"), "{}", doc);
        assert!(doc.contains("\"code\":true"), "{}", doc);
    }

    #[test]
    fn preprocess_confluence_double_brace_with_cjk_suffix() {
        let doc = markdown_to_blocknote_doc("x {{read:attachment:confluenceが必要だったの}} y").expect("convert");
        assert!(!doc.contains("{{"), "{}", doc);
        assert!(doc.contains("read:attachment:confluence"), "{}", doc);
        assert!(doc.contains("が必要だったの"), "{}", doc);
        assert!(doc.contains("\"code\":true"), "{}", doc);
    }

    #[test]
    fn jira_noformat_becomes_code_block_and_strips_markers() {
        let doc = markdown_to_blocknote_doc("Intro {noformat}line1\nline2{noformat} outro").expect("convert");
        assert!(!doc.contains("{noformat}"), "{}", doc);
        assert!(doc.contains("line1"), "{}", doc);
        assert!(doc.contains("line2"), "{}", doc);
        assert!(doc.contains("Intro"), "{}", doc);
        assert!(doc.contains("outro"), "{}", doc);
        assert!(doc.contains("\"codeBlock\""), "{}", doc);
        assert!(doc.contains("\"language\":\"text\""), "{}", doc);
    }

    #[test]
    fn jira_noformat_does_not_parse_markdown_inside() {
        let doc = markdown_to_blocknote_doc("{noformat}**not bold**{noformat}").expect("convert");
        assert!(!doc.contains("{noformat}"), "{}", doc);
        assert!(doc.contains("**not bold**"), "{}", doc);
    }

    #[test]
    fn jira_wiki_color_hex_strips_markers_and_sets_text_color() {
        let doc = markdown_to_blocknote_doc("{color:#FF5630}[ 確認 ]{color}").expect("convert");
        assert!(!doc.contains("{color"), "{}", doc);
        assert!(doc.contains("確認"), "{}", doc);
        assert!(doc.contains("#FF5630"), "{}", doc);
        assert!(doc.contains("textColor"), "{}", doc);
    }

    #[test]
    fn jira_wiki_color_bare_hex_gets_hash_prefix() {
        let doc = markdown_to_blocknote_doc("{color:FF5630}X{color}").expect("convert");
        assert!(doc.contains("\"textColor\":\"#FF5630\""), "{}", doc);
        assert!(doc.contains("\"text\":\"X\""), "{}", doc);
    }

    #[test]
    fn jira_wiki_nested_color_closes_inner_first() {
        let doc = markdown_to_blocknote_doc("{color:red}a{color:blue}b{color}c{color}").expect("convert");
        assert!(!doc.contains("{color"), "{}", doc);
        assert!(doc.contains("a"), "{}", doc);
        assert!(doc.contains("b"), "{}", doc);
        assert!(doc.contains("c"), "{}", doc);
        assert!(doc.contains("\"textColor\":\"red\""), "{}", doc);
        assert!(doc.contains("\"textColor\":\"blue\""), "{}", doc);
    }

    #[test]
    fn jira_wiki_h2_line_becomes_heading_block() {
        let doc = markdown_to_blocknote_doc("h2. Section title\n\nParagraph body.").expect("convert");
        assert!(doc.contains("\"heading\""), "{}", doc);
        assert!(doc.contains("\"level\":2"), "{}", doc);
        assert!(doc.contains("Section title"), "{}", doc);
        assert!(doc.contains("Paragraph body"), "{}", doc);
    }

    #[test]
    fn jira_wiki_h6_clamps_to_heading_level_3() {
        let doc = markdown_to_blocknote_doc("h6. Deep").expect("convert");
        assert!(doc.contains("\"heading\""), "{}", doc);
        assert!(doc.contains("\"level\":3"), "{}", doc);
    }

    #[test]
    fn jira_wiki_heading_line_is_case_insensitive() {
        let doc = markdown_to_blocknote_doc("H3. Caps title\n\nBody.").expect("convert");
        assert!(doc.contains("\"heading\""), "{}", doc);
        assert!(doc.contains("\"level\":3"), "{}", doc);
        assert!(doc.contains("Caps title"), "{}", doc);
    }

    #[test]
    fn atx_heading_without_space_after_hashes() {
        let doc = markdown_to_blocknote_doc("###NoSpaceTitle\n\np").expect("convert");
        assert!(doc.contains("\"heading\""), "{}", doc);
        assert!(doc.contains("\"level\":3"), "{}", doc);
        assert!(doc.contains("NoSpaceTitle"), "{}", doc);
    }

    #[test]
    fn jira_code_block_strips_markers_and_preserves_newlines() {
        let doc = markdown_to_blocknote_doc("{code}line1\nline2{code} after").expect("convert");
        assert!(!doc.contains("{code}"), "{}", doc);
        assert!(doc.contains("line1"), "{}", doc);
        assert!(doc.contains("line2"), "{}", doc);
        assert!(doc.contains("after"), "{}", doc);
        assert!(doc.contains("\"codeBlock\""), "{}", doc);
    }

    #[test]
    fn jira_code_block_with_lang_strips_open_attributes() {
        let doc = markdown_to_blocknote_doc("{code:java}x{code}").expect("convert");
        assert!(!doc.contains("{code"), "{}", doc);
        assert!(doc.contains("\"text\":\"x\""), "{}", doc);
        assert!(doc.contains("\"codeBlock\""), "{}", doc);
        assert!(doc.contains("\"language\":\"java\""), "{}", doc);
    }

    #[test]
    fn bracket_mailto_without_angle() {
        let doc = markdown_to_blocknote_doc("[a@b.com|mailto:a@b.com]").expect("convert");
        assert!(doc.contains("mailto:"), "{}", doc);
    }

    #[test]
    fn jira_emoticons_in_markdown_line() {
        let doc = markdown_to_blocknote_doc("(/) pass (x) fail").expect("convert");
        let arr: Vec<Value> = serde_json::from_str(&doc).expect("parse");
        let t = arr[0].get("content").and_then(Value::as_array).expect("c")[0]
            .get("text")
            .and_then(Value::as_str)
            .expect("text");
        assert!(t.contains('✅'), "{t}");
        assert!(t.contains('❌'), "{t}");
    }
}
