//! Regression tests that exercise the full import re-parse chain (TPD-*).

use serde_json::{json, Value};

#[test]
fn tpd4_paragraph_then_ordered_list_stays_numbered_after_import_reparse_chain() {
    use crate::import::adf::{
        maybe_reparse_blocknote_from_flat_markdown, maybe_reparse_blocknote_wrapped_markdown,
    };

    let adf = json!({
        "type": "doc",
        "version": 1,
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": "再現方法"}]},
            {"type": "orderedList", "attrs": {"order": 1}, "content": [
                {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "テーブルを空にする"}]}]},
                {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "ステップ2"}]}]}
            ]},
            {"type": "paragraph", "content": [{"type": "text", "text": "別セクション"}]},
            {"type": "orderedList", "attrs": {"order": 1}, "content": [
                {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "A"}]}]},
                {"type": "listItem", "content": [{"type": "paragraph"}]}
            ]}
        ]
    });
    let ctx = super::super::context::AdfImportContext::empty();
    let doc = super::adf_to_blocknote_doc_with_context(&adf, Some(&ctx)).expect("adf doc");
    let after = maybe_reparse_blocknote_wrapped_markdown(&doc, Some(&ctx))
        .or_else(|| maybe_reparse_blocknote_from_flat_markdown(&doc, Some(&ctx)))
        .unwrap_or_else(|| doc.clone());

    let blocks: Vec<Value> = serde_json::from_str(&after).unwrap();
    let top_numbered = blocks
        .iter()
        .filter(|b| b.get("type").and_then(|t| t.as_str()) == Some("numberedListItem"))
        .count();
    assert!(top_numbered >= 2, "expected top-level numbered list items: {}", after);
    assert!(
        !blocks
            .iter()
            .any(|b| b.get("type").and_then(|t| t.as_str()) == Some("heading")),
        "ADF without headings must not produce heading blocks: {}",
        after
    );
}

#[test]
fn tpd196_ordered_list_keeps_numbered_items_after_import_reparse_chain() {
    use crate::import::adf::{
        maybe_reparse_blocknote_from_flat_markdown, maybe_reparse_blocknote_wrapped_markdown,
    };

    let adf = json!({
        "type": "doc",
        "version": 1,
        "content": [
            {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "再現手順"}]},
            {"type": "orderedList", "attrs": {"order": 1}, "content": [
                {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "ステップ1"}]}]},
                {"type": "listItem", "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": "ステップ2"}]},
                    {"type": "bulletList", "content": [
                        {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "ネストA"}]}]},
                        {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "ネストB"}]}]}
                    ]}
                ]},
                {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "ステップ3"}]}]}
            ]}
        ]
    });
    let ctx = super::super::context::AdfImportContext::empty();
    let doc = super::adf_to_blocknote_doc_with_context(&adf, Some(&ctx)).expect("adf doc");
    let after = maybe_reparse_blocknote_wrapped_markdown(&doc, Some(&ctx))
        .or_else(|| maybe_reparse_blocknote_from_flat_markdown(&doc, Some(&ctx)))
        .unwrap_or_else(|| doc.clone());

    let blocks: Vec<Value> = serde_json::from_str(&after).unwrap();
    let numbered_count = blocks
        .iter()
        .filter(|b| b.get("type").and_then(|t| t.as_str()) == Some("numberedListItem"))
        .count();
    assert!(numbered_count >= 1, "need top-level numbered items: {}", after);

    fn count_numbered_deep(blocks: &[Value]) -> usize {
        let mut n = 0usize;
        for b in blocks {
            if b.get("type").and_then(|t| t.as_str()) == Some("numberedListItem") {
                n += 1;
            }
            if let Some(ch) = b.get("children").and_then(|c| c.as_array()) {
                n += count_numbered_deep(ch.as_slice());
            }
        }
        n
    }
    assert!(count_numbered_deep(&blocks) >= 3, "nested doc should keep ≥3 numbered items: {}", after);

    for b in &blocks {
        if b.get("type").and_then(|t| t.as_str()) != Some("heading") {
            continue;
        }
        let level = b
            .get("props")
            .and_then(|p| p.get("level"))
            .and_then(|l| l.as_i64())
            .unwrap_or(0);
        let flat = b
            .get("content")
            .and_then(|c| c.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.get("text").and_then(|t| t.as_str()))
                    .collect::<String>()
            })
            .unwrap_or_default();
        if flat.starts_with("ステップ") {
            assert_ne!(
                level, 1,
                "ordered-list steps must not become ATX-style (level 1) headings: {}",
                after
            );
        }
    }
}

#[test]
fn tpd155_code_block_survives_import_reparse_chain() {
    use crate::import::adf::{
        maybe_reparse_blocknote_from_flat_markdown, maybe_reparse_blocknote_wrapped_markdown,
    };

    let adf = json!({
        "type": "doc",
        "version": 1,
        "content": [
            {
                "type": "codeBlock",
                "content": [{ "type": "text", "text": "91:4    warning  lint\n\n97:16   warning  more" }]
            },
            {
                "type": "paragraph",
                "content": [{ "type": "text", "text": "forge lintで引っかかる。" }]
            },
            {
                "type": "paragraph",
                "content": [{ "type": "text", "text": "See https://developer.atlassian.com/x" }]
            }
        ]
    });
    let ctx = super::super::context::AdfImportContext::empty();
    let doc = super::adf_to_blocknote_doc_with_context(&adf, Some(&ctx)).expect("adf doc");
    let after = maybe_reparse_blocknote_wrapped_markdown(&doc, Some(&ctx))
        .or_else(|| maybe_reparse_blocknote_from_flat_markdown(&doc, Some(&ctx)))
        .unwrap_or_else(|| doc.clone());

    let blocks: Vec<Value> = serde_json::from_str(&after).unwrap();
    assert_eq!(
        blocks.first().and_then(|b| b.get("type")).and_then(|t| t.as_str()),
        Some("codeBlock"),
        "first block must stay codeBlock: {}",
        after
    );
    let code_text = blocks
        .first()
        .and_then(|b| b.get("content"))
        .and_then(|c| c.as_array())
        .and_then(|a| a.first())
        .and_then(|x| x.get("text"))
        .and_then(|t| t.as_str())
        .unwrap_or("");
    assert!(
        code_text.contains("91:4") && code_text.contains("97:16"),
        "code body must be preserved: {}",
        after
    );
}
