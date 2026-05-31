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
    let desc = patch
        .get("Description")
        .and_then(|v| v.as_str())
        .expect("desc");
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
    let desc = patch
        .get("Description")
        .and_then(|v| v.as_str())
        .expect("desc");
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
    let desc = patch
        .get("Description")
        .and_then(|v| v.as_str())
        .expect("desc");
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
    let desc = patch
        .get("Description")
        .and_then(|v| v.as_str())
        .expect("desc");
    assert!(desc.contains('✅'), "{}", desc);
    assert!(desc.contains('❌'), "{}", desc);
}
