//! ADF inline content → BlockNote inline content segments.

use serde_json::{json, Value};

use super::marks::{
    adf_link_href_from_marks, adf_marks_to_styles, merge_adf_base_styles_into_segments,
};
use crate::mcp::markdown::{
    jira_wiki_preprocessed_paragraph_to_inline_content, preprocess_jira_wiki_plain_text,
};

pub(in crate::import::adf) fn adf_inline_to_blocknote_content(nodes: &[Value]) -> Vec<Value> {
    let mut out = Vec::new();
    for node in nodes {
        if let Some(obj) = node.as_object() {
            let t = obj.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if t == "text" {
                let text = obj.get("text").and_then(|v| v.as_str()).unwrap_or("");
                let text = preprocess_jira_wiki_plain_text(text);
                let styles = adf_marks_to_styles(obj.get("marks"));
                let link_href = adf_link_href_from_marks(obj.get("marks"));
                if text.contains("{color:") {
                    let segs = merge_adf_base_styles_into_segments(
                        jira_wiki_preprocessed_paragraph_to_inline_content(&text),
                        &styles,
                    );
                    if let Some(href) = link_href {
                        if !segs.is_empty() {
                            out.push(json!({
                                "type": "link",
                                "href": href,
                                "content": segs
                            }));
                        }
                    } else {
                        for seg in segs {
                            out.push(seg);
                        }
                    }
                } else if !text.is_empty() {
                    let inner = json!({
                        "type": "text",
                        "text": text,
                        "styles": styles
                    });
                    if let Some(href) = link_href {
                        out.push(json!({
                            "type": "link",
                            "href": href,
                            "content": vec![inner]
                        }));
                    } else {
                        out.push(inner);
                    }
                }
            } else if t == "hardBreak" {
                out.push(json!({
                    "type": "text",
                    "text": "\n",
                    "styles": {}
                }));
            } else if t == "status" {
                // Jira ADF inline status pill → plain text (BlockNote `status` is editor-only).
                let label = obj
                    .get("attrs")
                    .and_then(|a| a.get("text"))
                    .and_then(|x| x.as_str())
                    .unwrap_or("");
                if !label.is_empty() {
                    out.push(json!({
                        "type": "text",
                        "text": label,
                        "styles": {}
                    }));
                }
            }
        }
    }
    out
}
