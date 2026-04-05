//! Jira ADF / wiki → BlockNote JSON for import.

mod blocks;
mod context;
mod convert;
mod wiki;

pub use blocks::code_block_note;
pub use context::AdfImportContext;
pub use convert::adf_to_blocknote_doc_with_context;
pub use wiki::{
    classify_jira_description_value, is_blocknote_doc_json_string, jira_comment_body_to_blocknote_doc,
    jira_import_string_to_blocknote_doc, jira_wiki_text_to_blocknote_doc,
    maybe_reparse_blocknote_from_flat_markdown, maybe_reparse_blocknote_jira_list_misparsed,
    maybe_expand_jira_emoticons_in_blocknote, maybe_reparse_blocknote_wrapped_markdown,
    maybe_sanitize_jira_wiki_mangled_links, JiraDescriptionKind,
};
