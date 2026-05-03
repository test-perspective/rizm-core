use super::compute_jira_markdown_backfill_patch;
use serde_json::{json, Value};

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
