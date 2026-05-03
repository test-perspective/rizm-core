//! Jira wiki text and description classification for import.

use serde_json::Value;

use super::context::AdfImportContext;
use super::convert::adf_to_blocknote_doc_with_context;
use crate::mcp::markdown::{markdown_to_blocknote_doc, normalize_jira_wiki_color_delimiters};

mod detect;
mod emoticons;
mod inline_text;
mod json_norm;
mod reparse;
mod sanitize_links;
mod wiki_blocks;

#[cfg(test)]
mod tests;

pub use emoticons::maybe_expand_jira_emoticons_in_blocknote;
pub use json_norm::is_blocknote_doc_json_string;
pub use reparse::{
    maybe_reparse_blocknote_from_flat_markdown, maybe_reparse_blocknote_jira_list_misparsed,
    maybe_reparse_blocknote_wrapped_markdown,
};
pub use sanitize_links::maybe_sanitize_jira_wiki_mangled_links;

pub(super) fn is_adf_doc_root(v: &Value) -> bool {
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

/// Convert Jira description / comment plain string to BlockNote JSON using Markdown and/or wiki rules.
/// When `ctx` is `None`, wiki attachment syntax cannot be resolved and is skipped (`None`) unless Markdown applies.
pub fn jira_import_string_to_blocknote_doc(
    s_in: &str,
    ctx: Option<&AdfImportContext>,
) -> Option<String> {
    let s = normalize_jira_wiki_color_delimiters(s_in);
    if s.trim().is_empty() {
        return Some("[]".to_string());
    }
    let wiki_attach = detect::has_jira_wiki_attachment_syntax(&s);

    match ctx {
        Some(c) => {
            if wiki_attach {
                return wiki_blocks::wiki_string_to_blocknote_json(&s, c);
            }
            if detect::looks_like_markdown(&s) {
                if let Ok(doc) = markdown_to_blocknote_doc(&s) {
                    return Some(doc);
                }
            }
            wiki_blocks::wiki_string_to_blocknote_json(&s, c)
        }
        None => {
            if wiki_attach && !detect::looks_like_markdown(&s) {
                return None;
            }
            if detect::looks_like_markdown(&s) {
                return markdown_to_blocknote_doc(&s).ok();
            }
            wiki_blocks::wiki_string_to_blocknote_json(&s, &AdfImportContext::empty())
        }
    }
}

/// Jira wiki or plain multiline text → BlockNote JSON string (Markdown detected when no wiki attachments).
pub fn jira_wiki_text_to_blocknote_doc(s: &str, ctx: &AdfImportContext) -> Option<String> {
    jira_import_string_to_blocknote_doc(s, Some(ctx))
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
