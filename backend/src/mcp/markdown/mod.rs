//! Jira wiki / Markdown → BlockNote JSON for the MCP / import pipelines.

use anyhow::Context;
use serde_json::Value;

use crate::import::code_block_note;

mod blocks;
mod inline;
mod lists;
mod parse;
mod preprocess;
mod segments;

#[cfg(test)]
mod tests;

pub use blocks::blocknote_heading_value;
pub use inline::{
    blocknote_inline_from_jira_plain_text, jira_wiki_plain_line_to_inline_content,
    jira_wiki_preprocessed_paragraph_to_inline_content,
};
pub use lists::{parse_atx_heading_line, parse_jira_wiki_heading_line};
pub use preprocess::{
    extract_first_http_url, normalize_jira_wiki_color_delimiters, preprocess_jira_wiki_plain_text,
};

use blocks::make_paragraph_block;
use parse::markdown_fragment_outside_noformat;
use segments::{split_jira_noformat_segments, JiraNoformatSegment};

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
        blocks = parse::markdown_lines_with_jira_code(&pre)?;
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
