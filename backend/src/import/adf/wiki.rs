//! Jira wiki text and description classification for import.

use serde_json::{json, Value};

use super::blocks;
use super::context::AdfImportContext;
use super::convert::adf_to_blocknote_doc_with_context;
use crate::api::attachments_api::AttachmentMeta;
use crate::mcp::markdown::{
    blocknote_heading_value, blocknote_inline_from_jira_plain_text, extract_first_http_url,
    jira_wiki_plain_line_to_inline_content, jira_wiki_preprocessed_paragraph_to_inline_content,
    markdown_to_blocknote_doc, normalize_jira_wiki_color_delimiters, parse_atx_heading_line,
    parse_jira_wiki_heading_line,
    preprocess_jira_wiki_plain_text,
};

fn is_adf_doc_root(v: &Value) -> bool {
    v.as_object()
        .and_then(|o| o.get("type"))
        .and_then(|t| t.as_str())
        == Some("doc")
}

/// ADF JSON object, legacy wiki / plain (needs conversion), or pass-through for BlockNote JSON strings.
#[derive(Debug, Clone)]
pub enum JiraDescriptionKind {
    Adf(Value),
    LegacyWiki(String),
}

/// Classify Jira description field. Returns `None` when the value should be mapped as-is (e.g. BlockNote JSON string).
pub fn classify_jira_description_value(raw: Option<&Value>) -> Option<JiraDescriptionKind> {
    let raw = raw?;
    if is_adf_doc_root(raw) {
        return Some(JiraDescriptionKind::Adf(raw.clone()));
    }
    if let Some(s) = raw.as_str() {
        if is_blocknote_doc_json_string(s) {
            return None;
        }
        if let Ok(v) = serde_json::from_str::<Value>(s) {
            if is_adf_doc_root(&v) {
                return Some(JiraDescriptionKind::Adf(v));
            }
        }
        return Some(JiraDescriptionKind::LegacyWiki(s.to_string()));
    }
    None
}

/// True if `s` is a JSON array of BlockNote blocks (each object has non-empty string `type`).
pub fn is_blocknote_doc_json_string(s: &str) -> bool {
    let t = s.trim();
    if !t.starts_with('[') {
        return false;
    }
    let Ok(arr) = serde_json::from_str::<Vec<Value>>(t) else {
        return false;
    };
    if arr.is_empty() {
        return true;
    }
    arr.iter().all(|b| {
        b.as_object()
            .and_then(|o| o.get("type"))
            .and_then(|ty| ty.as_str())
            .map(|x| !x.is_empty())
            .unwrap_or(false)
    })
}

fn strip_blocknote_ids(v: &mut Value) {
    match v {
        Value::Array(items) => {
            for x in items {
                strip_blocknote_ids(x);
            }
        }
        Value::Object(map) => {
            map.remove("id");
            for (_, x) in map.iter_mut() {
                strip_blocknote_ids(x);
            }
        }
        _ => {}
    }
}

/// Sort object keys so two logically equal BlockNote JSON trees compare equal after id stripping.
fn canonicalize_json_value(v: &Value) -> Value {
    match v {
        Value::Array(items) => Value::Array(items.iter().map(canonicalize_json_value).collect()),
        Value::Object(map) => {
            let mut keys: Vec<String> = map.keys().cloned().collect();
            keys.sort();
            let mut out = serde_json::Map::new();
            for k in keys {
                if let Some(x) = map.get(&k) {
                    out.insert(k, canonicalize_json_value(x));
                }
            }
            Value::Object(out)
        }
        x => x.clone(),
    }
}

fn blocknote_json_semantic_equal(a: &str, b: &str) -> bool {
    let Ok(mut va) = serde_json::from_str::<Value>(a) else {
        return false;
    };
    let Ok(mut vb) = serde_json::from_str::<Value>(b) else {
        return false;
    };
    strip_blocknote_ids(&mut va);
    strip_blocknote_ids(&mut vb);
    canonicalize_json_value(&va) == canonicalize_json_value(&vb)
}

/// True if `s` contains a Jira wiki-style attachment segment `!name!` (single line, non-empty inner).
fn has_jira_wiki_attachment_syntax(s: &str) -> bool {
    let mut rest = s;
    while let Some(i) = rest.find('!') {
        let after = &rest[i + 1..];
        if let Some(j) = after.find('!') {
            let inner = after[..j].trim();
            if !inner.is_empty() && !inner.contains('\n') {
                return true;
            }
            rest = &after[j + 1..];
        } else {
            break;
        }
    }
    false
}

/// Heuristic: treat as Markdown when common Markdown markers appear (headings, lists, code fences, links, emphasis).
fn looks_like_markdown(s: &str) -> bool {
    if s.contains("```") {
        return true;
    }
    let normalized = s.replace('\r', "");
    for line in normalized.lines() {
        let t = line.trim_start();
        if parse_atx_heading_line(t).is_some()
            || t.starts_with("- ")
            || t.starts_with("* ")
            || t.starts_with("> ")
            || parse_jira_wiki_heading_line(t).is_some()
        {
            return true;
        }
        // Jira-style bullets often use `*word` without a space after `*`.
        if let Some(rest) = t.strip_prefix('*') {
            if !rest.starts_with('*') && !rest.is_empty() {
                return true;
            }
        }
        if t.contains('[') && t.contains("](") {
            return true;
        }
        // Bare URLs (Jira / pasted text) — re-parse and autolink in Markdown path.
        if t.contains("https://") || t.contains("http://") {
            return true;
        }
        // Jira nested bullets mis-imported as a paragraph line (`** subitem`).
        let u = t.trim_start();
        if u.starts_with("** ") || u.starts_with("*** ") {
            return true;
        }
    }
    if s.contains("(/)")
        || s.contains("(x)")
        || s.contains("(y)")
        || s.contains("(n)")
        || s.contains("(i)")
        || s.contains("(!)")
        || s.contains("(?)")
    {
        return true;
    }
    if s.contains("(on)") || s.contains("(off)") {
        return true;
    }
    if s.contains("(+)") || s.contains("(-)") || s.contains("(*)") {
        return true;
    }
    if s.contains("{quote}")
        || s.contains("{noformat}")
        || s.contains("{code}")
        || s.contains("{code:")
        || s.contains("{color:")
        || s.contains("{{")
        || s.contains("<[")
    {
        return true;
    }
    let star_pairs = s.match_indices("**").count();
    if star_pairs >= 2 {
        return true;
    }
    s.matches('`').count() >= 2
}

fn append_inline_text(v: &Value, out: &mut String) {
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

fn flatten_paragraph_block_text(block: &Value) -> String {
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

fn inline_text_eq(v: &Value, s: &str) -> bool {
    let Some(o) = v.as_object() else {
        return false;
    };
    o.get("type").and_then(|t| t.as_str()) == Some("text")
        && o.get("text").and_then(|x| x.as_str()) == Some(s)
}

/// Fix `link` nodes whose `href` contains Jira `|` duplication or trailing `]` garbage (import bug).
/// Recursively fix `link` → `link` (same href) nesting, then peel redundant wrappers.
fn sanitize_nested_same_href_links_in_value(v: &Value) -> (Value, bool) {
    if v.get("type").and_then(|t| t.as_str()) != Some("link") {
        return (v.clone(), false);
    }
    let mut v = v.clone();
    let mut changed = false;
    if let Some(obj) = v.as_object_mut() {
        if let Some(Value::Array(items)) = obj.get_mut("content") {
            let mut new_items = Vec::with_capacity(items.len());
            for it in items.iter() {
                let (ni, c) = sanitize_nested_same_href_links_in_value(it);
                new_items.push(ni);
                changed |= c;
            }
            *items = new_items;
        }
    }
    let before = v.clone();
    let v = peel_redundant_same_href_link_wrapper(v);
    if v != before {
        changed = true;
    }
    (v, changed)
}

/// `link { href, content: [ link { same href, ... } ] }` → inner link (repeat until stable).
fn peel_redundant_same_href_link_wrapper(mut v: Value) -> Value {
    loop {
        let next = {
            let Some(obj) = v.as_object() else {
                break;
            };
            if obj.get("type").and_then(|t| t.as_str()) != Some("link") {
                break;
            }
            let outer_h = obj.get("href").and_then(|h| h.as_str());
            let inner = match obj.get("content").and_then(|c| c.as_array()) {
                Some(a) if a.len() == 1 => a.first(),
                _ => break,
            };
            let Some(inner) = inner else {
                break;
            };
            let inner_o = match inner.as_object() {
                Some(o) => o,
                None => break,
            };
            if inner_o.get("type").and_then(|t| t.as_str()) != Some("link") {
                break;
            }
            let inner_h = inner_o.get("href").and_then(|h| h.as_str());
            if outer_h != inner_h {
                break;
            }
            inner.clone()
        };
        v = next;
    }
    v
}

fn sanitize_nested_same_href_links_in_array(items: &[Value]) -> (Vec<Value>, bool) {
    let mut out = Vec::with_capacity(items.len());
    let mut changed = false;
    for it in items {
        let (nv, c) = sanitize_nested_same_href_links_in_value(it);
        out.push(nv);
        changed |= c;
    }
    (out, changed)
}

fn try_fix_mangled_link(v: &Value) -> Option<Value> {
    let o = v.as_object()?;
    if o.get("type").and_then(|t| t.as_str()) != Some("link") {
        return None;
    }
    let href = o.get("href").and_then(|x| x.as_str())?;
    let clean = extract_first_http_url(href)?;
    if clean == href && !href.contains('|') && !href.contains(']') {
        return None;
    }
    Some(json!({
        "type": "link",
        "href": clean,
        "content": [{
            "type": "text",
            "text": clean,
            "styles": {}
        }]
    }))
}

fn sanitize_inline_content_array(items: &[Value]) -> (Vec<Value>, bool) {
    let mut out: Vec<Value> = Vec::new();
    let mut i = 0;
    let mut changed = false;
    while i < items.len() {
        if i + 1 < items.len() && inline_text_eq(&items[i], "[") {
            if let Some(fixed) = try_fix_mangled_link(&items[i + 1]) {
                out.push(fixed);
                i += 2;
                changed = true;
                continue;
            }
        }
        if let Some(fixed) = try_fix_mangled_link(&items[i]) {
            let was_same = fixed == items[i];
            out.push(fixed);
            if !was_same {
                changed = true;
            }
            i += 1;
            continue;
        }
        out.push(items[i].clone());
        i += 1;
    }
    let (out, c2) = sanitize_nested_same_href_links_in_array(&out);
    (out, changed || c2)
}

fn sanitize_blocknote_recursive(block: &Value) -> (Value, bool) {
    let mut b = block.clone();
    let mut any = false;
    if let Some(obj) = b.as_object_mut() {
        // ADF blockquote used `content: []` with block `children`; BlockNote quote needs inline content.
        if obj.get("type").and_then(|t| t.as_str()) == Some("quote") {
            let needs_placeholder = obj
                .get("content")
                .and_then(|c| c.as_array())
                .map(|a| a.is_empty())
                .unwrap_or(true)
                && obj
                    .get("children")
                    .and_then(|c| c.as_array())
                    .map(|a| !a.is_empty())
                    .unwrap_or(false);
            if needs_placeholder {
                obj.insert(
                    "content".to_string(),
                    json!([{
                        "type": "text",
                        "text": "",
                        "styles": {}
                    }]),
                );
                any = true;
            }
        }
        let typ = obj.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if matches!(
            typ,
            "paragraph" | "heading" | "bulletListItem" | "numberedListItem" | "toggleListItem" | "checkListItem"
                | "quote"
        ) {
            if let Some(Value::Array(items)) = obj.get("content") {
                let (new_items, c) = sanitize_inline_content_array(items);
                if c {
                    obj.insert("content".to_string(), Value::Array(new_items));
                    any = true;
                }
            }
        }
        if let Some(Value::Array(children)) = obj.get("children") {
            let mut new_ch = Vec::new();
            let mut c2 = false;
            for ch in children {
                let (nb, c) = sanitize_blocknote_recursive(ch);
                c2 |= c;
                new_ch.push(nb);
            }
            if c2 {
                obj.insert("children".to_string(), Value::Array(new_ch));
                any = true;
            }
        }
    }
    (b, any)
}

/// Repair BlockNote docs where Jira `[alias|url]` was split into `[` text + malformed `link` href.
pub fn maybe_sanitize_jira_wiki_mangled_links(s: &str) -> Option<String> {
    let t = s.trim();
    if !is_blocknote_doc_json_string(t) {
        return None;
    }
    let arr: Vec<Value> = serde_json::from_str(t).ok()?;
    let mut out = Vec::new();
    let mut any = false;
    for b in arr {
        let (nb, c) = sanitize_blocknote_recursive(&b);
        any |= c;
        out.push(nb);
    }
    if !any {
        return None;
    }
    serde_json::to_string(&out).ok()
}

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

/// Concatenate text from top-level paragraph blocks (legacy wiki import stored Markdown inside paragraphs).
fn flatten_paragraph_only_blocknote(s: &str) -> Option<String> {
    let t = s.trim();
    let arr: Vec<Value> = serde_json::from_str(t).ok()?;
    if arr.is_empty() {
        return None;
    }
    let mut parts = Vec::new();
    for b in &arr {
        let ty = b.get("type").and_then(|v| v.as_str())?;
        if ty != "paragraph" {
            return None;
        }
        parts.push(flatten_paragraph_block_text(b));
    }
    Some(parts.join("\n\n"))
}

/// When old import stored Markdown as paragraph-only BlockNote JSON, re-parse into real headings/lists.
pub fn maybe_reparse_blocknote_wrapped_markdown(s: &str, ctx: Option<&AdfImportContext>) -> Option<String> {
    let t = s.trim();
    if !is_blocknote_doc_json_string(t) {
        return None;
    }
    let flat = flatten_paragraph_only_blocknote(t)?;
    if flat.trim().is_empty() || !looks_like_markdown(&flat) {
        return None;
    }
    let new_doc = jira_import_string_to_blocknote_doc(&flat, ctx)?;
    if new_doc == t || blocknote_json_semantic_equal(&new_doc, t) {
        return None;
    }
    Some(new_doc)
}

/// Join text from each top-level block (any type with BlockNote shape). Skips empty segments.
fn flatten_inline_only(block: &Value) -> String {
    let mut out = String::new();
    if let Some(content) = block.get("content").and_then(|c| c.as_array()) {
        for item in content {
            append_inline_text(item, &mut out);
        }
    }
    out
}

fn paragraph_looks_like_jira_subbullet_line(flat: &str) -> bool {
    let t = flat.trim_start();
    if let Some(rest) = t.strip_prefix("**") {
        return rest.chars().next().is_some_and(|c| c.is_whitespace());
    }
    if let Some(rest) = t.strip_prefix('*') {
        if rest.starts_with('*') {
            return false;
        }
        return rest.chars().next().is_some_and(|c| c.is_whitespace());
    }
    false
}

/// `**` in its own text node, then body (common Jira import split).
fn paragraph_content_is_split_double_star_subbullet(content: &[Value]) -> bool {
    if content.len() < 2 {
        return false;
    }
    if !inline_text_eq(&content[0], "**") {
        return false;
    }
    matches!(
        content[1].get("type").and_then(|t| t.as_str()),
        Some("text")
    ) && content[1]
        .get("text")
        .and_then(|x| x.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
}

/// Single `*` sub-bullet split; require leading whitespace on the body to avoid italic false positives.
fn paragraph_content_is_split_single_star_subbullet(content: &[Value]) -> bool {
    if content.len() < 2 {
        return false;
    }
    if !inline_text_eq(&content[0], "*") {
        return false;
    }
    content[1]
        .get("text")
        .and_then(|x| x.as_str())
        .map(|s| {
            s.chars()
                .next()
                .is_some_and(|c| c.is_whitespace() || c == '\u{3000}')
        })
        .unwrap_or(false)
}

/// Top-level `bulletListItem` followed by `paragraph` whose text looks like a Jira sub-bullet (`** body`).
fn doc_has_jira_list_mispattern(arr: &[Value]) -> bool {
    for w in arr.windows(2) {
        if w[0].get("type").and_then(|t| t.as_str()) == Some("bulletListItem")
            && w[1].get("type").and_then(|t| t.as_str()) == Some("paragraph")
        {
            let ptext = flatten_paragraph_block_text(&w[1]);
            let content = w[1]
                .get("content")
                .and_then(|c| c.as_array())
                .map(|a| a.as_slice())
                .unwrap_or(&[]);
            if paragraph_looks_like_jira_subbullet_line(&ptext)
                || paragraph_content_is_split_double_star_subbullet(content)
                || paragraph_content_is_split_single_star_subbullet(content)
            {
                return true;
            }
        }
    }
    false
}

fn emit_bullet_lines_for_reparse(item: &Value, depth: usize, lines: &mut Vec<String>) {
    let body = flatten_inline_only(item).trim().to_string();
    let prefix = "*".repeat(depth);
    if body.is_empty() {
        lines.push(prefix);
    } else {
        lines.push(format!("{prefix} {body}"));
    }
    if let Some(children) = item.get("children").and_then(|c| c.as_array()) {
        for ch in children {
            emit_bullet_lines_for_reparse(ch, depth + 1, lines);
        }
    }
}

/// Rebuild Jira-style `* ` / `** ` lines from BlockNote, then re-parse as Markdown (fixes mis-nested list imports).
pub fn maybe_reparse_blocknote_jira_list_misparsed(s: &str, ctx: Option<&AdfImportContext>) -> Option<String> {
    let t = s.trim();
    if !is_blocknote_doc_json_string(t) {
        return None;
    }
    let arr: Vec<Value> = serde_json::from_str(t).ok()?;
    if arr.is_empty() || !doc_has_jira_list_mispattern(&arr) {
        return None;
    }
    for b in &arr {
        let ty = b.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if matches!(ty, "table" | "image" | "video" | "audio" | "file") {
            return None;
        }
    }
    let mut lines: Vec<String> = Vec::new();
    for b in &arr {
        match b.get("type").and_then(|ty| ty.as_str()) {
            Some("heading") => {
                let level = b
                    .get("props")
                    .and_then(|p| p.get("level"))
                    .and_then(|l| l.as_u64())
                    .unwrap_or(1)
                    .clamp(1, 3);
                let hashes = "#".repeat(level as usize);
                let text = flatten_inline_only(b).trim().to_string();
                lines.push(format!("{hashes} {text}"));
            }
            Some("paragraph") => {
                let t = flatten_paragraph_block_text(b);
                if !t.trim().is_empty() {
                    for ln in t.lines() {
                        lines.push(ln.to_string());
                    }
                }
            }
            Some("bulletListItem") => {
                emit_bullet_lines_for_reparse(b, 1, &mut lines);
            }
            _ => {
                let t = flatten_paragraph_block_text(b);
                if !t.trim().is_empty() {
                    for ln in t.lines() {
                        lines.push(ln.to_string());
                    }
                }
            }
        }
    }
    let rebuilt = lines.join("\n");
    if rebuilt.trim().is_empty() {
        return None;
    }
    jira_import_string_to_blocknote_doc(&rebuilt, ctx)
}

fn flatten_top_level_blocks_joined(arr: &[Value]) -> String {
    let mut parts: Vec<String> = Vec::new();
    for b in arr {
        let seg = flatten_paragraph_block_text(b);
        let t = seg.trim();
        if !t.is_empty() {
            parts.push(t.to_string());
        }
    }
    parts.join("\n\n")
}

/// When the doc is valid BlockNote but not paragraph-only (e.g. empty paragraph + body, or heading + paragraphs),
/// flatten top-level text and re-parse as Markdown if it looks like Markdown. Skips docs that already use lists/tables/media.
pub fn maybe_reparse_blocknote_from_flat_markdown(s: &str, ctx: Option<&AdfImportContext>) -> Option<String> {
    let t = s.trim();
    if !is_blocknote_doc_json_string(t) {
        return None;
    }
    let arr: Vec<Value> = serde_json::from_str(t).ok()?;
    if arr.is_empty() {
        return None;
    }
    // Skip rich embeds. Skip real list blocks: flattening loses nesting and URLs trigger
    // `looks_like_markdown`, so Markdown re-parse collapses ADF-imported bullets (e.g. TPD-203).
    for b in &arr {
        let ty = b.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if matches!(ty, "table" | "image" | "video" | "audio" | "file") {
            return None;
        }
        // ADF `codeBlock` must not be flattened: joining text drops fences and Markdown re-parse
        // mis-handles the body (e.g. TPD-155: code + trailing bare URL).
        if ty == "codeBlock" {
            return None;
        }
        if matches!(
            ty,
            "bulletListItem" | "numberedListItem" | "toggleListItem" | "checkListItem"
        ) {
            return None;
        }
    }
    let flat = flatten_top_level_blocks_joined(&arr);
    if flat.trim().is_empty() || !looks_like_markdown(&flat) {
        return None;
    }
    let new_doc = jira_import_string_to_blocknote_doc(&flat, ctx)?;
    if new_doc == t || blocknote_json_semantic_equal(&new_doc, t) {
        return None;
    }
    Some(new_doc)
}

/// Convert Jira description / comment plain string to BlockNote JSON using Markdown and/or wiki rules.
/// When `ctx` is `None`, wiki attachment syntax cannot be resolved and is skipped (`None`) unless Markdown applies.
pub fn jira_import_string_to_blocknote_doc(s_in: &str, ctx: Option<&AdfImportContext>) -> Option<String> {
    let s = normalize_jira_wiki_color_delimiters(s_in);
    if s.trim().is_empty() {
        return Some("[]".to_string());
    }
    let wiki_attach = has_jira_wiki_attachment_syntax(&s);

    match ctx {
        Some(c) => {
            if wiki_attach {
                return wiki_string_to_blocknote_json(&s, c);
            }
            if looks_like_markdown(&s) {
                if let Ok(doc) = markdown_to_blocknote_doc(&s) {
                    return Some(doc);
                }
            }
            wiki_string_to_blocknote_json(&s, c)
        }
        None => {
            if wiki_attach && !looks_like_markdown(&s) {
                return None;
            }
            if looks_like_markdown(&s) {
                return markdown_to_blocknote_doc(&s).ok();
            }
            wiki_string_to_blocknote_json(&s, &AdfImportContext::empty())
        }
    }
}

fn wiki_block_for_meta(meta: &AttachmentMeta, url: &str) -> Value {
    let lower = meta.file_name.to_lowercase();
    let is_image = meta
        .mime_type
        .as_deref()
        .map(|m| m.starts_with("image/"))
        .unwrap_or(false)
        || lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".gif")
        || lower.ends_with(".webp")
        || lower.ends_with(".svg");
    if is_image {
        blocks::image_block(url)
    } else {
        blocks::paragraph_file_attachment(url, &meta.file_name)
    }
}

/// Wiki attachment import path: only `##`+ ATX headings so a single `# …` line stays plain (not Markdown).
fn parse_atx_heading_line_wiki_attach_path(rest: &str) -> Option<(u8, String)> {
    let (level, title) = parse_atx_heading_line(rest)?;
    (level >= 2).then_some((level, title))
}

fn wiki_push_paragraph_block(blocks: &mut Vec<Value>, p: &str) {
    let p = p.trim();
    if p.is_empty() {
        return;
    }
    let id = uuid::Uuid::new_v4().to_string();
    let content: Vec<Value> = if p.contains("{color:") {
        let expanded = preprocess_jira_wiki_plain_text(p);
        jira_wiki_preprocessed_paragraph_to_inline_content(&expanded)
    } else {
        let lines: Vec<&str> = p.split('\n').collect();
        let mut c: Vec<Value> = Vec::new();
        for (idx, line) in lines.iter().enumerate() {
            if idx > 0 {
                c.push(json!({"type": "text", "text": "\n", "styles": {}}));
            }
            let line_expanded = preprocess_jira_wiki_plain_text(line);
            for seg in jira_wiki_plain_line_to_inline_content(&line_expanded) {
                c.push(seg);
            }
        }
        c
    };
    blocks.push(json!({
        "id": id,
        "type": "paragraph",
        "props": {
            "backgroundColor": "default",
            "textColor": "default",
            "textAlignment": "left"
        },
        "content": content,
        "children": []
    }));
}

fn wiki_push_text_segments(blocks: &mut Vec<Value>, text: &str) {
    let t = text.trim_end_matches('\n');
    if t.trim().is_empty() {
        return;
    }
    for para in t.split("\n\n") {
        let p = para.trim();
        if p.is_empty() {
            continue;
        }
        if p.contains("{quote}")
            || p.contains("{noformat}")
            || p.contains("{code}")
            || p.contains("{code:")
        {
            if let Ok(doc) = markdown_to_blocknote_doc(p) {
                if let Ok(arr) = serde_json::from_str::<Vec<Value>>(&doc) {
                    for b in arr {
                        blocks.push(b);
                    }
                    continue;
                }
            }
        }
        let lines: Vec<&str> = p.lines().map(str::trim_end).collect();
        if lines.len() == 1 {
            let single = lines[0].trim();
            if let Some((level, title)) = parse_jira_wiki_heading_line(single) {
                let pt = preprocess_jira_wiki_plain_text(&title);
                blocks.push(blocknote_heading_value(level, &pt));
                continue;
            }
            if let Some((level, title)) = parse_atx_heading_line_wiki_attach_path(single) {
                let pt = preprocess_jira_wiki_plain_text(&title);
                blocks.push(blocknote_heading_value(level, &pt));
                continue;
            }
        } else if let Some((level, title)) = parse_jira_wiki_heading_line(lines[0].trim()) {
            let pt = preprocess_jira_wiki_plain_text(&title);
            blocks.push(blocknote_heading_value(level, &pt));
            let rest: String = lines[1..].join("\n");
            if !rest.trim().is_empty() {
                wiki_push_paragraph_block(blocks, &rest);
            }
            continue;
        } else if let Some((level, title)) = parse_atx_heading_line_wiki_attach_path(lines[0].trim()) {
            let pt = preprocess_jira_wiki_plain_text(&title);
            blocks.push(blocknote_heading_value(level, &pt));
            let rest: String = lines[1..].join("\n");
            if !rest.trim().is_empty() {
                wiki_push_paragraph_block(blocks, &rest);
            }
            continue;
        }
        wiki_push_paragraph_block(blocks, p);
    }
}

fn wiki_string_to_blocknote_json(s: &str, ctx: &AdfImportContext) -> Option<String> {
    let blocks = jira_wiki_to_blocks(s, ctx);
    if blocks.is_empty() {
        return Some("[]".to_string());
    }
    serde_json::to_string(&blocks).ok()
}

/// Jira wiki or plain multiline text → BlockNote JSON string (Markdown detected when no wiki attachments).
pub fn jira_wiki_text_to_blocknote_doc(s: &str, ctx: &AdfImportContext) -> Option<String> {
    jira_import_string_to_blocknote_doc(s, Some(ctx))
}

fn jira_wiki_to_blocks(s: &str, ctx: &AdfImportContext) -> Vec<Value> {
    let mut out: Vec<Value> = Vec::new();
    let mut rest = s;
    while let Some(start) = rest.find('!') {
        wiki_push_text_segments(&mut out, &rest[..start]);
        let after = &rest[start + 1..];
        if let Some(end_rel) = after.find('!') {
            let inner = &after[..end_rel];
            let fname = inner.split('|').next().unwrap_or("").trim();
            if let Some(meta) = ctx.find_meta_by_wiki_filename(fname) {
                let url = ctx.attachment_url(&meta.id);
                out.push(wiki_block_for_meta(meta, &url));
            }
            rest = &after[end_rel + 1..];
        } else {
            wiki_push_text_segments(&mut out, rest);
            return out;
        }
    }
    wiki_push_text_segments(&mut out, rest);
    out
}

/// Jira comment `body`: ADF object, stringified ADF, BlockNote JSON, or wiki/plain text (with `ctx` for `!file!` and images).
pub fn jira_comment_body_to_blocknote_doc(
    body: &Value,
    ctx: Option<&AdfImportContext>,
) -> Option<String> {
    if is_adf_doc_root(body) {
        return adf_to_blocknote_doc_with_context(body, ctx);
    }
    if let Some(s) = body.as_str() {
        if is_blocknote_doc_json_string(s) {
            return Some(s.to_string());
        }
        if let Ok(v) = serde_json::from_str::<Value>(s) {
            if is_adf_doc_root(&v) {
                return adf_to_blocknote_doc_with_context(&v, ctx);
            }
        }
        return jira_import_string_to_blocknote_doc(s, ctx);
    }
    None
}

#[cfg(test)]
mod comment_body_tests {
    use super::super::context::AdfImportContext;
    use super::jira_comment_body_to_blocknote_doc;
    use serde_json::json;
    use std::collections::HashMap;

    #[test]
    fn comment_plain_text_with_ctx_becomes_paragraph_doc() {
        let ctx = AdfImportContext {
            project_id: "p".to_string(),
            entity_pk: "e".to_string(),
            jira_to_rizm: HashMap::new(),
            rizm_meta_by_id: HashMap::new(),
        };
        let body = json!("Hello comment");
        let s = jira_comment_body_to_blocknote_doc(&body, Some(&ctx)).expect("doc");
        assert!(s.contains("Hello comment"));
        assert!(s.contains("paragraph"));
    }

    #[test]
    fn comment_adf_doc_resolves_without_ctx_when_no_media() {
        let adf = json!({
            "type": "doc",
            "version": 1,
            "content": [{
                "type": "paragraph",
                "content": [{ "type": "text", "text": "x", "styles": {} }]
            }]
        });
        let s = jira_comment_body_to_blocknote_doc(&adf, None).expect("doc");
        assert!(s.contains("x"));
    }

    #[test]
    fn comment_adf_text_with_jira_color_wiki_strips_markers() {
        let adf = json!({
            "type": "doc",
            "version": 1,
            "content": [{
                "type": "paragraph",
                "content": [{
                    "type": "text",
                    "text": "{color:#FF5630}[ 確認 ]{color}"
                }]
            }]
        });
        let s = jira_comment_body_to_blocknote_doc(&adf, None).expect("doc");
        assert!(!s.contains("{color"), "{}", s);
        assert!(s.contains("確認"), "{}", s);
        assert!(s.contains("textColor"), "{}", s);
    }

    #[test]
    fn comment_markdown_string_without_ctx_converts() {
        let body = json!("## Hello\n\n- **x**");
        let s = jira_comment_body_to_blocknote_doc(&body, None).expect("doc");
        assert!(s.contains("heading"), "{}", s);
        assert!(s.contains("bulletListItem"), "{}", s);
    }

    #[test]
    fn comment_jira_wiki_h2_string_converts_to_heading() {
        let body = json!("h2. Section title\n\nBody text");
        let s = jira_comment_body_to_blocknote_doc(&body, None).expect("doc");
        assert!(s.contains("heading"), "{}", s);
        assert!(s.contains("\"level\":2"), "{}", s);
        assert!(s.contains("Section title"), "{}", s);
        assert!(s.contains("Body text"), "{}", s);
    }

    #[test]
    fn comment_jira_wiki_noformat_becomes_code_block() {
        let body = json!("See {noformat}curl https://x\n-H y{noformat} done.");
        let s = jira_comment_body_to_blocknote_doc(&body, None).expect("doc");
        assert!(!s.contains("{noformat}"), "{}", s);
        assert!(s.contains("curl"), "{}", s);
        assert!(s.contains("\"codeBlock\""), "{}", s);
        assert!(s.contains("done"), "{}", s);
    }

    #[test]
    fn comment_jira_wiki_color_wiki_paragraph_strips_markers() {
        let body = json!("{color:#FF5630}[ 確認 ]{color}");
        let s = jira_comment_body_to_blocknote_doc(&body, None).expect("doc");
        assert!(!s.contains("{color"), "{}", s);
        assert!(s.contains("確認"), "{}", s);
        assert!(s.contains("textColor"), "{}", s);
        assert!(s.contains("#FF5630"), "{}", s);
    }

    #[test]
    fn description_legacy_markdown_with_ctx_converts() {
        use super::super::context::AdfImportContext;
        let ctx = AdfImportContext {
            project_id: "p".to_string(),
            entity_pk: "e".to_string(),
            jira_to_rizm: HashMap::new(),
            rizm_meta_by_id: HashMap::new(),
        };
        let md = "# Title\n\n**bold** line";
        let s = super::jira_import_string_to_blocknote_doc(md, Some(&ctx)).expect("doc");
        assert!(s.contains("heading"), "{}", s);
        assert!(s.contains("paragraph"), "{}", s);
    }

    #[test]
    fn wiki_attachment_syntax_bypasses_markdown_when_ctx_present() {
        use super::super::context::AdfImportContext;
        let ctx = AdfImportContext {
            project_id: "p".to_string(),
            entity_pk: "e".to_string(),
            jira_to_rizm: HashMap::new(),
            rizm_meta_by_id: HashMap::new(),
        };
        let s = "# not a heading via md\n!missing.png!";
        let out = super::jira_import_string_to_blocknote_doc(s, Some(&ctx)).expect("doc");
        assert!(
            out.contains("# not a heading via md"),
            "wiki path should keep markdown-looking text as plain: {}",
            out
        );
    }

    #[test]
    fn wiki_attach_path_converts_jira_code_macro_via_markdown() {
        use super::super::context::AdfImportContext;
        let ctx = AdfImportContext {
            project_id: "p".to_string(),
            entity_pk: "e".to_string(),
            jira_to_rizm: HashMap::new(),
            rizm_meta_by_id: HashMap::new(),
        };
        let s = "!f.png!\n{code:yaml}a\nb{code}";
        let out = super::jira_import_string_to_blocknote_doc(s, Some(&ctx)).expect("doc");
        assert!(!out.contains("{code"), "{}", out);
        assert!(out.contains("\"codeBlock\""), "{}", out);
        assert!(out.contains('a'), "{}", out);
    }

    #[test]
    fn wiki_attach_path_triple_hash_without_space_is_heading() {
        use super::super::context::AdfImportContext;
        let ctx = AdfImportContext {
            project_id: "p".to_string(),
            entity_pk: "e".to_string(),
            jira_to_rizm: HashMap::new(),
            rizm_meta_by_id: HashMap::new(),
        };
        let s = "!f.png!\n###CompactTitle";
        let out = super::jira_import_string_to_blocknote_doc(s, Some(&ctx)).expect("doc");
        assert!(out.contains("\"heading\""), "{}", out);
        assert!(out.contains("CompactTitle"), "{}", out);
    }

    /// Regression: ADF → BlockNote nested lists must not be flattened/re-parsed just because a line contains `https://`.
    #[test]
    fn flat_markdown_reparse_skips_blocknote_with_top_level_list_items() {
        let doc = r#"[{"id":"a","type":"bulletListItem","props":{},"content":[{"type":"text","text":"Top ","styles":{}},{"type":"text","text":"https://kenputer.example/x","styles":{}}],"children":[{"id":"b","type":"bulletListItem","props":{},"content":[{"type":"text","text":"Nested","styles":{}}],"children":[]}]}]"#;
        assert!(
            super::maybe_reparse_blocknote_from_flat_markdown(doc, None).is_none(),
            "must preserve list structure"
        );
    }

    /// Regression: ADF `codeBlock` + later bare URL must not trigger flat Markdown re-parse (TPD-155).
    #[test]
    fn flat_markdown_reparse_skips_blocknote_with_code_block() {
        let doc = r##"[{"id":"c1","type":"codeBlock","props":{"backgroundColor":"default","textColor":"default","textAlignment":"left","language":"text"},"content":[{"type":"text","text":"91:4  warning  x","styles":{}}],"children":[]},{"id":"p1","type":"paragraph","props":{},"content":[{"type":"text","text":"See https://developer.atlassian.com/x","styles":{}}],"children":[]}]"##;
        assert!(
            super::maybe_reparse_blocknote_from_flat_markdown(doc, None).is_none(),
            "must preserve codeBlock"
        );
    }

    /// Paragraph-only BlockNote whose joined text is ATX Markdown (legacy import shape).
    #[test]
    fn flat_markdown_reparse_still_runs_for_paragraph_with_atx_heading_text() {
        use super::super::context::AdfImportContext;
        let ctx = AdfImportContext {
            project_id: "p".to_string(),
            entity_pk: "e".to_string(),
            jira_to_rizm: HashMap::new(),
            rizm_meta_by_id: HashMap::new(),
        };
        let doc = r##"[{"id":"p1","type":"paragraph","props":{},"content":[{"type":"text","text":"# Hello","styles":{}}],"children":[]},{"id":"p2","type":"paragraph","props":{},"content":[{"type":"text","text":"Line","styles":{}}],"children":[]}]"##;
        let out = super::maybe_reparse_blocknote_from_flat_markdown(doc, Some(&ctx));
        assert!(out.is_some(), "expected reparse: {:?}", out);
        let s = out.expect("reparse");
        assert!(s.contains("heading"), "{}", s);
        assert!(s.contains("Hello"), "{}", s);
    }
}
