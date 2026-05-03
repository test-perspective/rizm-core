use super::compute_jira_markdown_backfill_patch;
use serde_json::{json, Value};

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
