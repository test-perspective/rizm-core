//! Orchestrate Jira panel segmentation and Markdown block assembly.

use serde_json::Value;

use super::blocks::make_quote_block;
use super::lists::markdown_lines_to_blocks;
use super::preprocess::preprocess_jira_wiki_plain_text;
use super::segments::{
    split_jira_code_segments, split_jira_quote_segments, JiraCodeSegment, JiraQuoteSegment,
};
use crate::import::code_block_note;

pub(super) fn markdown_lines_with_jira_code(preprocessed: &str) -> anyhow::Result<Vec<Value>> {
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

pub(super) fn markdown_fragment_outside_noformat(s: &str) -> anyhow::Result<Vec<Value>> {
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
