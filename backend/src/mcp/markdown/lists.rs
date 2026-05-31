//! Line classification and nested bullet-list assembly for Markdown / Jira wiki input.

use serde_json::{json, Value};
use uuid::Uuid;

use super::blocks::{
    default_block_props, make_heading_block, make_paragraph_block, make_table_block,
};
use super::inline::text_to_block_content;

#[derive(Debug)]
pub(super) enum ParsedLine {
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

pub(super) fn parse_markdown_line(line: &str) -> ParsedLine {
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

pub(super) fn flush_bullet_buffer(buf: &mut Vec<(usize, String)>, blocks: &mut Vec<Value>) {
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

fn consume_list_siblings(
    items: &[(usize, String)],
    idx: &mut usize,
    min_depth: usize,
) -> Vec<ListItem> {
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

pub(super) fn markdown_lines_to_blocks(preprocessed: &str) -> anyhow::Result<Vec<Value>> {
    let mut bullets_buf: Vec<(usize, String)> = Vec::new();
    let mut blocks: Vec<Value> = Vec::new();
    let lines: Vec<&str> = preprocessed.lines().collect();
    let mut i = 0usize;

    while i < lines.len() {
        let line = lines[i];
        if line.trim().is_empty() {
            i += 1;
            continue;
        }
        if let Some((headers, rows, next_i)) = parse_markdown_table(&lines, i) {
            flush_bullet_buffer(&mut bullets_buf, &mut blocks);
            blocks.push(make_table_block(&headers, &rows));
            i = next_i;
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
        i += 1;
    }
    flush_bullet_buffer(&mut bullets_buf, &mut blocks);
    Ok(blocks)
}

fn parse_markdown_table(
    lines: &[&str],
    start: usize,
) -> Option<(Vec<String>, Vec<Vec<String>>, usize)> {
    let header = split_table_row(lines.get(start)?.trim())?;
    if header.is_empty() {
        return None;
    }
    let divider = lines.get(start + 1)?.trim();
    if !is_table_divider(divider, header.len()) {
        return None;
    }

    let mut rows = Vec::new();
    let mut i = start + 2;
    while i < lines.len() {
        let line = lines[i].trim();
        if line.is_empty() {
            break;
        }
        let Some(row) = split_table_row(line) else {
            break;
        };
        rows.push(row);
        i += 1;
    }

    Some((header, rows, i))
}

fn split_table_row(line: &str) -> Option<Vec<String>> {
    if !line.contains('|') {
        return None;
    }
    let trimmed = line.trim().trim_matches('|');
    let cells: Vec<String> = trimmed.split('|').map(|s| s.trim().to_string()).collect();
    if cells.len() < 2 {
        return None;
    }
    Some(cells)
}

fn is_table_divider(line: &str, expected_columns: usize) -> bool {
    let Some(cells) = split_table_row(line) else {
        return false;
    };
    if cells.len() != expected_columns {
        return false;
    }
    cells.iter().all(|cell| {
        let t = cell.trim();
        let core = t.trim_matches(':');
        core.len() >= 3 && core.chars().all(|c| c == '-')
    })
}
