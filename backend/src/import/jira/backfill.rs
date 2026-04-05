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
mod tests {
    use super::compute_jira_markdown_backfill_patch;
    use serde_json::{json, Value};

    #[test]
    fn backfill_converts_markdown_description() {
        let mut props = serde_json::Map::new();
        props.insert(
            "Description".to_string(),
            json!("# Title\n\n- **bold** item"),
        );
        let patch = compute_jira_markdown_backfill_patch(&props).expect("patch");
        let desc = patch.get("Description").and_then(|v| v.as_str()).expect("desc");
        assert!(desc.starts_with('['), "expected BlockNote JSON array");
        assert!(desc.contains("heading"), "{}", desc);
        assert!(desc.contains("bulletListItem"), "{}", desc);
    }

    #[test]
    fn backfill_converts_description_with_jira_noformat() {
        let mut props = serde_json::Map::new();
        props.insert(
            "Description".to_string(),
            json!("a {noformat}b **c** d{noformat} e"),
        );
        let patch = compute_jira_markdown_backfill_patch(&props).expect("patch");
        let desc = patch.get("Description").and_then(|v| v.as_str()).expect("desc");
        assert!(!desc.contains("{noformat}"), "{}", desc);
        assert!(desc.contains("**c**"), "{}", desc);
        assert!(desc.contains("\"codeBlock\""), "{}", desc);
        assert!(desc.contains("\"text\":\"a\""), "{}", desc);
        assert!(desc.contains("\"text\":\"e\""), "{}", desc);
    }

    #[test]
    fn backfill_converts_description_with_jira_color_markup() {
        let mut props = serde_json::Map::new();
        props.insert(
            "Description".to_string(),
            json!("{color:#FF5630}[ 確認 ]{color}"),
        );
        let patch = compute_jira_markdown_backfill_patch(&props).expect("patch");
        let desc = patch.get("Description").and_then(|v| v.as_str()).expect("desc");
        assert!(!desc.contains("{color"), "{}", desc);
        assert!(desc.contains("確認"), "{}", desc);
        assert!(desc.contains("textColor"), "{}", desc);
    }

    #[test]
    fn backfill_skips_valid_blocknote_description() {
        let doc = r#"[{"id":"a","type":"paragraph","props":{"backgroundColor":"default","textColor":"default","textAlignment":"left"},"content":[{"type":"text","text":"ok","styles":{}}],"children":[]}]"#;
        let mut props = serde_json::Map::new();
        props.insert("Description".to_string(), json!(doc));
        assert!(compute_jira_markdown_backfill_patch(&props).is_none());
    }

    /// TPD-146 shape: Jira wiki stored as paragraph-only BlockNote (`{code:…}{code}`, `h3.`, bullets).
    #[test]
    fn backfill_repairs_paragraph_only_with_jira_code_and_h3_wiki_lines() {
        let wrapped = serde_json::to_string(&json!([
            {
                "id": "p0",
                "type": "paragraph",
                "props": { "backgroundColor": "default", "textColor": "default", "textAlignment": "left" },
                "content": [{ "type": "text", "text": "Intro line", "styles": {} }],
                "children": []
            },
            {
                "id": "p1",
                "type": "paragraph",
                "props": { "backgroundColor": "default", "textColor": "default", "textAlignment": "left" },
                "content": [{ "type": "text", "text": "{code:yaml}pipelines:\n  default:\n    - step:{code}", "styles": {} }],
                "children": []
            },
            {
                "id": "p2",
                "type": "paragraph",
                "props": { "backgroundColor": "default", "textColor": "default", "textAlignment": "left" },
                "content": [{ "type": "text", "text": "h3. Build sizes", "styles": {} }],
                "children": []
            },
            {
                "id": "p3",
                "type": "paragraph",
                "props": { "backgroundColor": "default", "textColor": "default", "textAlignment": "left" },
                "content": [{ "type": "text", "text": "* {{1x}} default\n* {{2x}} double", "styles": {} }],
                "children": []
            },
        ]))
        .unwrap();
        let mut props = serde_json::Map::new();
        props.insert("Description".to_string(), Value::String(wrapped));
        let patch = compute_jira_markdown_backfill_patch(&props).expect("patch");
        let desc = patch.get("Description").and_then(|v| v.as_str()).expect("desc");
        assert!(!desc.contains("{code"), "should strip code macro: {}", desc);
        assert!(desc.contains("pipelines"), "{}", desc);
        assert!(desc.contains("\"codeBlock\""), "{}", desc);
        assert!(desc.contains("\"language\":\"yaml\""), "{}", desc);
        assert!(desc.contains("\"heading\""), "h3. should become heading: {}", desc);
        assert!(desc.contains("Build sizes"), "{}", desc);
        assert!(desc.contains("bulletListItem"), "{}", desc);
    }

    /// Sanitize must not block later wrapped-markdown reparse (same entity may need both).
    #[test]
    fn backfill_runs_reparse_after_sanitize_when_both_apply() {
        let wrapped = serde_json::to_string(&json!([
            {
                "id": "p0",
                "type": "paragraph",
                "props": { "backgroundColor": "default", "textColor": "default", "textAlignment": "left" },
                "content": [
                    { "type": "text", "text": "[", "styles": {} },
                    {
                        "type": "link",
                        "href": "https://a.com/b|junk]",
                        "content": [{ "type": "text", "text": "link", "styles": {} }]
                    }
                ],
                "children": []
            },
            {
                "id": "p1",
                "type": "paragraph",
                "props": { "backgroundColor": "default", "textColor": "default", "textAlignment": "left" },
                "content": [{ "type": "text", "text": "h3. After sanitize", "styles": {} }],
                "children": []
            },
        ]))
        .unwrap();
        let mut props = serde_json::Map::new();
        props.insert("Description".to_string(), Value::String(wrapped));
        let patch = compute_jira_markdown_backfill_patch(&props).expect("patch");
        let desc = patch.get("Description").and_then(|v| v.as_str()).expect("desc");
        assert!(desc.contains("https://a.com/b"), "sanitized href: {}", desc);
        assert!(desc.contains("\"heading\""), "h3. should upgrade after sanitize: {}", desc);
        assert!(desc.contains("After sanitize"), "{}", desc);
    }

    #[test]
    fn backfill_upgrades_mixed_top_level_blocks_when_flattened_is_markdown() {
        let wrapped = serde_json::to_string(&json!([
            {
                "id": "h1",
                "type": "heading",
                "props": { "level": 1, "backgroundColor": "default", "textColor": "default", "textAlignment": "left" },
                "content": [{ "type": "text", "text": "Legacy heading", "styles": {} }],
                "children": []
            },
            {
                "id": "p1",
                "type": "paragraph",
                "props": { "backgroundColor": "default", "textColor": "default", "textAlignment": "left" },
                "content": [{ "type": "text", "text": "# Real title\n\n- **x**", "styles": {} }],
                "children": []
            }
        ]))
        .unwrap();
        let mut props = serde_json::Map::new();
        props.insert("Description".to_string(), Value::String(wrapped));
        let patch = compute_jira_markdown_backfill_patch(&props).expect("patch");
        let desc = patch.get("Description").and_then(|v| v.as_str()).expect("desc");
        assert!(desc.contains("heading") || desc.contains("bulletListItem"), "{}", desc);
    }

    #[test]
    fn backfill_upgrades_paragraph_only_blocknote_holding_markdown() {
        let wrapped = serde_json::to_string(&json!([{
            "id": "a",
            "type": "paragraph",
            "props": {
                "backgroundColor": "default",
                "textColor": "default",
                "textAlignment": "left"
            },
            "content": [{ "type": "text", "text": "# Title\n\n- **x**", "styles": {} }],
            "children": []
        }]))
        .unwrap();
        let mut props = serde_json::Map::new();
        props.insert("Description".to_string(), Value::String(wrapped));
        let patch = compute_jira_markdown_backfill_patch(&props).expect("patch");
        let desc = patch.get("Description").and_then(|v| v.as_str()).expect("desc");
        assert!(desc.contains("heading"), "{}", desc);
        assert!(desc.contains("bulletListItem"), "{}", desc);
    }

    #[test]
    fn backfill_expands_jira_emoticons_in_blocknote_text() {
        let doc = serde_json::to_string(&json!([{
            "id": "p1",
            "type": "paragraph",
            "props": { "backgroundColor": "default", "textColor": "default", "textAlignment": "left" },
            "content": [{ "type": "text", "text": "(/) ok (x) bad", "styles": {} }],
            "children": []
        }]))
        .unwrap();
        let mut props = serde_json::Map::new();
        props.insert("Description".to_string(), Value::String(doc));
        let patch = compute_jira_markdown_backfill_patch(&props).expect("patch");
        let desc = patch.get("Description").and_then(|v| v.as_str()).expect("desc");
        assert!(desc.contains('✅'), "{}", desc);
        assert!(desc.contains('❌'), "{}", desc);
    }

    #[test]
    fn backfill_rehydrates_jira_bracket_https_pipe_into_link_node() {
        let url = "https://mail.example/m/u/0/#inbox/abc";
        let raw = format!("[{url}|{url}]");
        let doc = serde_json::to_string(&json!([{
            "id": "p1",
            "type": "paragraph",
            "props": { "backgroundColor": "default", "textColor": "default", "textAlignment": "left" },
            "content": [{ "type": "text", "text": raw, "styles": {} }],
            "children": []
        }]))
        .unwrap();
        let mut props = serde_json::Map::new();
        props.insert("Description".to_string(), Value::String(doc));
        let patch = compute_jira_markdown_backfill_patch(&props).expect("patch");
        let desc = patch.get("Description").and_then(|v| v.as_str()).expect("desc");
        assert!(
            desc.contains("\"type\":\"link\""),
            "expected BlockNote link node: {}",
            desc
        );
        assert!(desc.contains("#inbox/abc"), "{}", desc);
    }

    #[test]
    fn backfill_rehydrates_angle_mailto_into_link_node() {
        let doc = serde_json::to_string(&json!([{
            "id": "p1",
            "type": "paragraph",
            "props": { "backgroundColor": "default", "textColor": "default", "textAlignment": "left" },
            "content": [{ "type": "text", "text": "Name <[a@b.com|mailto:a@b.com]> end", "styles": {} }],
            "children": []
        }]))
        .unwrap();
        let mut props = serde_json::Map::new();
        props.insert("Description".to_string(), Value::String(doc));
        let patch = compute_jira_markdown_backfill_patch(&props).expect("patch");
        let desc = patch.get("Description").and_then(|v| v.as_str()).expect("desc");
        assert!(desc.contains("\"type\":\"link\""), "{}", desc);
        assert!(desc.contains("mailto:"), "{}", desc);
    }

    #[test]
    fn backfill_fixes_quote_block_with_empty_inline_but_children() {
        let doc = serde_json::to_string(&json!([{
            "id": "q1",
            "type": "quote",
            "props": { "backgroundColor": "default", "textColor": "default" },
            "content": [],
            "children": [{
                "id": "p1",
                "type": "paragraph",
                "props": { "backgroundColor": "default", "textColor": "default", "textAlignment": "left" },
                "content": [{ "type": "text", "text": "Hi", "styles": {} }],
                "children": []
            }]
        }]))
        .unwrap();
        let mut props = serde_json::Map::new();
        props.insert("Description".to_string(), Value::String(doc));
        let patch = compute_jira_markdown_backfill_patch(&props).expect("patch");
        let desc = patch.get("Description").and_then(|v| v.as_str()).expect("desc");
        let v: Value = serde_json::from_str(desc).expect("parse");
        let content = v[0].get("content").and_then(Value::as_array).expect("content");
        assert!(!content.is_empty(), "{}", desc);
    }

    #[test]
    fn backfill_flattens_double_nested_same_href_link() {
        let url = "https://marketplace-vendors.slack.com/archives/C2JSSEW7M/p1731598388742829";
        let nested = serde_json::json!({
            "type": "link",
            "href": url,
            "content": [{
                "type": "link",
                "href": url,
                "content": [{ "type": "text", "text": url, "styles": {} }]
            }]
        });
        let doc = serde_json::to_string(&json!([{
            "id": "b1",
            "type": "bulletListItem",
            "props": { "backgroundColor": "default", "textColor": "default", "textAlignment": "left" },
            "content": [
                { "type": "text", "text": "see (", "styles": {} },
                nested,
                { "type": "text", "text": ")", "styles": {} }
            ],
            "children": []
        }]))
        .unwrap();
        let mut props = serde_json::Map::new();
        props.insert("Description".to_string(), Value::String(doc));
        let patch = compute_jira_markdown_backfill_patch(&props).expect("patch");
        let desc = patch.get("Description").and_then(|v| v.as_str()).expect("desc");
        let v: Value = serde_json::from_str(desc).expect("parse");
        let content = v[0].get("content").and_then(Value::as_array).expect("c");
        let link = content.iter().find(|x| x.get("type").and_then(Value::as_str) == Some("link")).expect("link");
        let inner = link.get("content").and_then(Value::as_array).expect("inner");
        assert!(
            !inner.iter().any(|x| x.get("type").and_then(Value::as_str) == Some("link")),
            "nested link must be flattened: {}",
            desc
        );
    }

    #[test]
    fn backfill_sanitizes_jira_pipe_mangled_link_href() {
        let bad = serde_json::to_string(&json!([{
            "id": "p1",
            "type": "paragraph",
            "props": { "backgroundColor": "default", "textColor": "default", "textAlignment": "left" },
            "content": [
                { "type": "text", "text": "[", "styles": {} },
                {
                    "type": "link",
                    "href": "https://example.com/a|https://example.com/a]note",
                    "content": [{ "type": "text", "text": "garbage", "styles": {} }]
                }
            ],
            "children": []
        }]))
        .unwrap();
        let mut props = serde_json::Map::new();
        props.insert("Description".to_string(), Value::String(bad));
        let patch = compute_jira_markdown_backfill_patch(&props).expect("patch");
        let desc = patch.get("Description").and_then(|v| v.as_str()).expect("desc");
        assert!(desc.contains("https://example.com/a"), "{}", desc);
        assert!(!desc.contains('|'), "pipe should be stripped from href: {}", desc);
    }

    #[test]
    fn backfill_repairs_split_double_star_subbullet_after_bullet() {
        let bad = serde_json::to_string(&json!([
            {
                "id": "b1",
                "type": "bulletListItem",
                "props": { "backgroundColor": "default", "textColor": "default", "textAlignment": "left" },
                "content": [{ "type": "text", "text": "top", "styles": {} }],
                "children": []
            },
            {
                "id": "p1",
                "type": "paragraph",
                "props": { "backgroundColor": "default", "textColor": "default", "textAlignment": "left" },
                "content": [
                    { "type": "text", "text": "**", "styles": {} },
                    { "type": "text", "text": " nested line", "styles": {} }
                ],
                "children": []
            }
        ]))
        .unwrap();
        let mut props = serde_json::Map::new();
        props.insert("Description".to_string(), Value::String(bad));
        let patch = compute_jira_markdown_backfill_patch(&props).expect("patch");
        let desc = patch.get("Description").and_then(|v| v.as_str()).expect("desc");
        let v: Value = serde_json::from_str(desc).expect("parse");
        let arr = v.as_array().expect("array");
        assert_eq!(arr[0].get("type").and_then(Value::as_str), Some("bulletListItem"));
        let ch = arr[0].get("children").and_then(Value::as_array).expect("nested");
        assert!(!ch.is_empty(), "expected nested bullet: {}", desc);
    }

    #[test]
    fn backfill_repairs_split_star_subbullet_and_normalizes_jira_template_token() {
        let bad = serde_json::to_string(&json!([
            {
                "id": "b1",
                "type": "bulletListItem",
                "props": { "backgroundColor": "default", "textColor": "default", "textAlignment": "left" },
                "content": [{ "type": "text", "text": "top", "styles": {} }],
                "children": []
            },
            {
                "id": "p1",
                "type": "paragraph",
                "props": { "backgroundColor": "default", "textColor": "default", "textAlignment": "left" },
                "content": [
                    { "type": "text", "text": "**", "styles": {} },
                    { "type": "text", "text": " {{fetchPageName}} tail", "styles": {} }
                ],
                "children": []
            }
        ]))
        .unwrap();
        let mut props = serde_json::Map::new();
        props.insert("Description".to_string(), Value::String(bad));
        let patch = compute_jira_markdown_backfill_patch(&props).expect("patch");
        let desc = patch.get("Description").and_then(|v| v.as_str()).expect("desc");
        assert!(
            !desc.contains("{{fetchPageName}}"),
            "template should be normalized: {}",
            desc
        );
        assert!(
            desc.contains("fetchPageName"),
            "expected token text preserved: {}",
            desc
        );
    }

    #[test]
    fn backfill_repairs_jira_subbullet_stored_as_following_paragraph() {
        let bad = serde_json::to_string(&json!([
            {
                "id": "b1",
                "type": "bulletListItem",
                "props": { "backgroundColor": "default", "textColor": "default", "textAlignment": "left" },
                "content": [{ "type": "text", "text": "Top item", "styles": {} }],
                "children": []
            },
            {
                "id": "p1",
                "type": "paragraph",
                "props": { "backgroundColor": "default", "textColor": "default", "textAlignment": "left" },
                "content": [{ "type": "text", "text": "** nested line", "styles": {} }],
                "children": []
            }
        ]))
        .unwrap();
        let mut props = serde_json::Map::new();
        props.insert("Description".to_string(), Value::String(bad));
        let patch = compute_jira_markdown_backfill_patch(&props).expect("patch");
        let desc = patch.get("Description").and_then(|v| v.as_str()).expect("desc");
        let v: Value = serde_json::from_str(desc).expect("parse patched");
        let arr = v.as_array().expect("array");
        assert_eq!(arr[0].get("type").and_then(Value::as_str), Some("bulletListItem"));
        let ch = arr[0].get("children").and_then(Value::as_array).expect("children");
        assert!(
            !ch.is_empty(),
            "expected nested bullet under first item: {}",
            desc
        );
    }

    #[test]
    fn backfill_converts_comment_doc_and_is_idempotent_for_blocknote() {
        let mut props = serde_json::Map::new();
        props.insert(
            "comments".to_string(),
            json!([{
                "id": "c1",
                "createdAt": 1,
                "doc": "## Sub\nplain"
            }]),
        );
        let patch = compute_jira_markdown_backfill_patch(&props).expect("patch");
        let arr = patch.get("comments").and_then(|v| v.as_array()).expect("arr");
        let doc = arr[0].get("doc").and_then(|v| v.as_str()).expect("doc");
        assert!(doc.contains("heading"), "{}", doc);

        let mut after = props.clone();
        after.insert("comments".to_string(), patch.get("comments").unwrap().clone());
        assert!(
            compute_jira_markdown_backfill_patch(&after).is_none(),
            "second pass should not change BlockNote docs"
        );
    }
}
