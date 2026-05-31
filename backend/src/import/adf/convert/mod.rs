//! ADF → BlockNote JSON. Optional [AdfImportContext] resolves Jira `media` attachments.

use serde_json::Value;

use super::context::AdfImportContext;

mod inline;
mod marks;
mod media;
mod nodes;

#[cfg(test)]
mod tests_basic;
#[cfg(test)]
mod tests_regression;

use nodes::adf_blocks_from_node;

/// Convert ADF with optional Jira attachment resolution for embedded media.
pub fn adf_to_blocknote_doc_with_context(
    adf: &Value,
    ctx: Option<&AdfImportContext>,
) -> Option<String> {
    let content = adf.get("content").and_then(|c| c.as_array())?;
    let mut blocks: Vec<Value> = Vec::new();

    for node in content {
        blocks.extend(adf_blocks_from_node(node, ctx));
    }

    if blocks.is_empty() {
        return None;
    }

    serde_json::to_string(&blocks).ok()
}
