//! Re-parse BlockNote docs that were imported from Markdown/wiki-like text but lost their structure.

use serde_json::Value;

use super::super::context::AdfImportContext;
use super::detect::looks_like_markdown;
use super::inline_text::{
    flatten_inline_only, flatten_paragraph_block_text, inline_text_eq,
};
use super::json_norm::{blocknote_json_semantic_equal, is_blocknote_doc_json_string};
use super::jira_import_string_to_blocknote_doc;

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
pub fn maybe_reparse_blocknote_wrapped_markdown(
    s: &str,
    ctx: Option<&AdfImportContext>,
) -> Option<String> {
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
pub fn maybe_reparse_blocknote_jira_list_misparsed(
    s: &str,
    ctx: Option<&AdfImportContext>,
) -> Option<String> {
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
pub fn maybe_reparse_blocknote_from_flat_markdown(
    s: &str,
    ctx: Option<&AdfImportContext>,
) -> Option<String> {
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
