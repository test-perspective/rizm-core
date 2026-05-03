//! Convert Jira wiki-style text (with `!file!` attachments) into BlockNote blocks.

use serde_json::{json, Value};

use super::super::blocks;
use super::super::context::AdfImportContext;
use crate::api::attachments_api::AttachmentMeta;
use crate::mcp::markdown::{
    blocknote_heading_value, jira_wiki_plain_line_to_inline_content,
    jira_wiki_preprocessed_paragraph_to_inline_content, markdown_to_blocknote_doc,
    parse_atx_heading_line, parse_jira_wiki_heading_line, preprocess_jira_wiki_plain_text,
};

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

pub(super) fn wiki_string_to_blocknote_json(s: &str, ctx: &AdfImportContext) -> Option<String> {
    let blocks = jira_wiki_to_blocks(s, ctx);
    if blocks.is_empty() {
        return Some("[]".to_string());
    }
    serde_json::to_string(&blocks).ok()
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
