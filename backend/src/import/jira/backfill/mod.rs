//! Backfill BlockNote JSON for Jira-imported tasks whose Description/comments were stored as raw Markdown strings.

use serde_json::{Map, Value};

use crate::import::adf::{
    is_blocknote_doc_json_string, jira_import_string_to_blocknote_doc, maybe_expand_jira_emoticons_in_blocknote,
    maybe_reparse_blocknote_from_flat_markdown, maybe_reparse_blocknote_jira_list_misparsed,
    maybe_reparse_blocknote_wrapped_markdown, maybe_sanitize_jira_wiki_mangled_links,
};

/// After optional link/quote sanitization, run Markdown/wiki re-parse passes on the same string.
/// Avoids `else if` chains where sanitization alone blocks `maybe_reparse_blocknote_wrapped_markdown` (TPD-146 class bugs).
fn try_upgrade_blocknote_jira_string(desc: &str) -> Option<String> {
    let sanitized = maybe_sanitize_jira_wiki_mangled_links(desc);
    let basis: &str = sanitized.as_deref().unwrap_or(desc);
    let from_reparse = maybe_reparse_blocknote_wrapped_markdown(basis, None)
        .or_else(|| maybe_reparse_blocknote_jira_list_misparsed(basis, None))
        .or_else(|| maybe_expand_jira_emoticons_in_blocknote(basis))
        .or_else(|| maybe_reparse_blocknote_from_flat_markdown(basis, None));
    let best = from_reparse.or(sanitized)?;
    (best != desc).then_some(best)
}

/// Build a property patch for one entity: convert non-BlockNote `Description` and comment `doc` strings when possible.
/// Returns `None` when nothing needs updating.
pub fn compute_jira_markdown_backfill_patch(props: &Map<String, Value>) -> Option<Map<String, Value>> {
    let mut patch = Map::new();

    if let Some(Value::String(desc)) = props.get("Description") {
        if desc.trim().is_empty() {
            // skip
        } else if !is_blocknote_doc_json_string(desc) {
            if let Some(doc) = jira_import_string_to_blocknote_doc(desc, None) {
                if doc != *desc {
                    patch.insert("Description".to_string(), Value::String(doc));
                }
            }
        } else if let Some(doc) = try_upgrade_blocknote_jira_string(desc) {
            patch.insert("Description".to_string(), Value::String(doc));
        }
    }

    if let Some(Value::Array(comments)) = props.get("comments") {
        let mut new_comments: Vec<Value> = Vec::new();
        let mut any_changed = false;
        for c in comments {
            let Some(obj) = c.as_object() else {
                new_comments.push(c.clone());
                continue;
            };
            let doc = match obj.get("doc").and_then(|v| v.as_str()) {
                Some(d) => d,
                None => {
                    new_comments.push(c.clone());
                    continue;
                }
            };
            if doc.trim().is_empty() {
                new_comments.push(c.clone());
                continue;
            }
            let converted_opt = if !is_blocknote_doc_json_string(doc) {
                jira_import_string_to_blocknote_doc(doc, None).filter(|x| x != doc)
            } else {
                try_upgrade_blocknote_jira_string(doc)
            };
            match converted_opt {
                Some(converted) => {
                    any_changed = true;
                    let mut nc = obj.clone();
                    nc.insert("doc".to_string(), Value::String(converted));
                    new_comments.push(Value::Object(nc));
                }
                _ => new_comments.push(c.clone()),
            }
        }
        if any_changed {
            patch.insert("comments".to_string(), Value::Array(new_comments));
        }
    }

    if patch.is_empty() {
        None
    } else {
        Some(patch)
    }
}

#[cfg(test)]
mod tests_basic;
#[cfg(test)]
mod tests_blocknote_repair;
#[cfg(test)]
mod tests_links_and_comments;
