//! Basic ADF → BlockNote conversion tests (no re-parse chain).

use std::collections::HashMap;

use super::super::context::AdfImportContext;
use super::adf_to_blocknote_doc_with_context;
use crate::api::attachments_api::AttachmentMeta;
use serde_json::{json, Value};

fn test_ctx(jira_id: &str, rizm_id: &str, fname: &str, mime: &str) -> AdfImportContext {
    let mut jira_to_rizm = HashMap::new();
    jira_to_rizm.insert(jira_id.to_string(), rizm_id.to_string());
    let mut rizm_meta_by_id = HashMap::new();
    rizm_meta_by_id.insert(
        rizm_id.to_string(),
        AttachmentMeta {
            id: rizm_id.to_string(),
            file_name: fname.to_string(),
            mime_type: Some(mime.to_string()),
            size: 1,
            created_at: 0,
        },
    );
    AdfImportContext {
        project_id: "p".to_string(),
        entity_pk: "e".to_string(),
        jira_to_rizm,
        rizm_meta_by_id,
    }
}

#[test]
fn adf_to_blocknote_doc_empty_content_none() {
    let adf = json!({"type": "doc", "version": 1, "content": []});
    assert!(adf_to_blocknote_doc_with_context(&adf, None).is_none());
}

#[test]
fn nested_media_single_in_panel_emits_image_block() {
    let ctx = test_ctx("10001", "rizm-1", "shot.png", "image/png");
    let adf = json!({
        "type": "doc",
        "version": 1,
        "content": [{
            "type": "panel",
            "content": [{
                "type": "mediaSingle",
                "content": [{
                    "type": "media",
                    "attrs": { "type": "file", "id": "10001", "collection": "" }
                }]
            }]
        }]
    });
    let s = adf_to_blocknote_doc_with_context(&adf, Some(&ctx)).expect("doc");
    let blocks: Vec<Value> = serde_json::from_str(&s).unwrap();
    assert!(blocks
        .iter()
        .any(|b| b.get("type").and_then(|t| t.as_str()) == Some("image")));
}

#[test]
fn nested_media_single_in_blockquote_emits_image_in_quote_children() {
    let ctx = test_ctx("10002", "rizm-2", "a.png", "image/png");
    let adf = json!({
        "type": "doc",
        "version": 1,
        "content": [{
            "type": "blockquote",
            "content": [{
                "type": "mediaSingle",
                "content": [{
                    "type": "media",
                    "attrs": { "type": "file", "id": "10002", "collection": "" }
                }]
            }]
        }]
    });
    let s = adf_to_blocknote_doc_with_context(&adf, Some(&ctx)).expect("doc");
    let blocks: Vec<Value> = serde_json::from_str(&s).unwrap();
    let quote = blocks
        .iter()
        .find(|b| b.get("type").and_then(|t| t.as_str()) == Some("quote"));
    let quote = quote.expect("quote block");
    let content = quote
        .get("content")
        .and_then(|c| c.as_array())
        .expect("content");
    assert!(
        !content.is_empty(),
        "quote must have inline content for BlockNote"
    );
    let children = quote
        .get("children")
        .and_then(|c| c.as_array())
        .expect("children");
    assert!(children
        .iter()
        .any(|b| b.get("type").and_then(|t| t.as_str()) == Some("image")));
}

#[test]
fn media_single_inside_list_item_emits_image_child() {
    let ctx = test_ctx("10003", "rizm-3", "b.png", "image/png");
    let adf = json!({
        "type": "doc",
        "version": 1,
        "content": [{
            "type": "bulletList",
            "content": [{
                "type": "listItem",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{ "type": "text", "text": "see:" }]
                    },
                    {
                        "type": "mediaSingle",
                        "content": [{
                            "type": "media",
                            "attrs": { "type": "file", "id": "10003", "collection": "" }
                        }]
                    }
                ]
            }]
        }]
    });
    let s = adf_to_blocknote_doc_with_context(&adf, Some(&ctx)).expect("doc");
    let blocks: Vec<Value> = serde_json::from_str(&s).unwrap();
    let li = blocks
        .iter()
        .find(|b| b.get("type").and_then(|t| t.as_str()) == Some("bulletListItem"));
    let li = li.expect("list item");
    let children = li
        .get("children")
        .and_then(|c| c.as_array())
        .expect("children");
    assert!(children
        .iter()
        .any(|b| b.get("type").and_then(|t| t.as_str()) == Some("image")));
}

#[test]
fn media_single_falls_back_to_alt_filename_when_media_id_is_uuid() {
    let ctx = test_ctx("10736", "rizm-4", "slide1.png", "image/png");
    let adf = json!({
        "type": "doc",
        "version": 1,
        "content": [{
            "type": "mediaSingle",
            "content": [{
                "type": "media",
                "attrs": {
                    "type": "file",
                    "id": "cfe6dc40-6f1a-4cf3-bbe7-119c40c0a35f",
                    "alt": "slide1.png",
                    "collection": ""
                }
            }]
        }]
    });
    let s = adf_to_blocknote_doc_with_context(&adf, Some(&ctx)).expect("doc");
    let blocks: Vec<Value> = serde_json::from_str(&s).unwrap();
    assert!(blocks
        .iter()
        .any(|b| b.get("type").and_then(|t| t.as_str()) == Some("image")));
}

#[test]
fn adf_text_node_with_jira_color_wiki_converts_to_textcolor() {
    let adf = json!({
        "type": "doc",
        "version": 1,
        "content": [{
            "type": "paragraph",
            "content": [{
                "type": "text",
                "text": "{color:#FF5630}[ 確認 ]{color}"
            }]
        }]
    });
    let s = adf_to_blocknote_doc_with_context(&adf, None).expect("doc");
    assert!(!s.contains("{color"), "{}", s);
    assert!(s.contains("確認"), "{}", s);
    assert!(s.contains("textColor"), "{}", s);
    assert!(s.contains("#FF5630"), "{}", s);
}

#[test]
fn adf_jira_color_case_insensitive_delimiters_in_text_node() {
    let adf = json!({
        "type": "doc",
        "version": 1,
        "content": [{
            "type": "paragraph",
            "content": [{
                "type": "text",
                "text": "{Color:#FF5630}OK{Color}"
            }]
        }]
    });
    let s = adf_to_blocknote_doc_with_context(&adf, None).expect("doc");
    assert!(!s.to_ascii_lowercase().contains("{color"), "{}", s);
    assert!(s.contains("OK"), "{}", s);
    assert!(s.contains("#FF5630"), "{}", s);
}

#[test]
fn adf_status_inline_becomes_plain_text() {
    let adf = json!({
        "type": "doc",
        "version": 1,
        "content": [{
            "type": "paragraph",
            "content": [
                {"type": "text", "text": "a "},
                {"type": "status", "attrs": {"text": "再現せず", "color": "blue"}},
                {"type": "text", "text": " b"}
            ]
        }]
    });
    let s = super::adf_to_blocknote_doc_with_context(&adf, None).expect("doc");
    assert!(s.contains("再現せず"), "{}", s);
}

#[test]
fn adf_link_mark_becomes_blocknote_link_inline() {
    let adf = json!({
        "type": "doc",
        "version": 1,
        "content": [{
            "type": "paragraph",
            "content": [{
                "type": "text",
                "text": "x",
                "marks": [{ "type": "link", "attrs": { "href": "http://example.test/y" } }]
            }]
        }]
    });
    let s = super::adf_to_blocknote_doc_with_context(&adf, None).expect("doc");
    assert!(s.contains("\"link\""), "{}", s);
    assert!(s.contains("http://example.test/y"), "{}", s);
    assert!(s.contains("x"), "{}", s);
}

#[test]
fn adf_strike_mark_uses_blocknote_strike_style_key() {
    let adf = json!({
        "type": "doc",
        "version": 1,
        "content": [{
            "type": "paragraph",
            "content": [{
                "type": "text",
                "text": "gone",
                "marks": [{ "type": "strike" }]
            }]
        }]
    });
    let s = super::adf_to_blocknote_doc_with_context(&adf, None).expect("doc");
    assert!(
        s.contains("\"strike\":true"),
        "expected BlockNote strike style, got {}",
        s
    );
    assert!(!s.contains("strikethrough"), "{}", s);
}
