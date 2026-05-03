use super::super::context::AdfImportContext;
use super::jira_comment_body_to_blocknote_doc;
use serde_json::json;
use std::collections::HashMap;

#[test]
fn comment_plain_text_with_ctx_becomes_paragraph_doc() {
    let ctx = AdfImportContext {
        project_id: "p".to_string(),
        entity_pk: "e".to_string(),
        jira_to_rizm: HashMap::new(),
        rizm_meta_by_id: HashMap::new(),
    };
    let body = json!("Hello comment");
    let s = jira_comment_body_to_blocknote_doc(&body, Some(&ctx)).expect("doc");
    assert!(s.contains("Hello comment"));
    assert!(s.contains("paragraph"));
}

#[test]
fn comment_adf_doc_resolves_without_ctx_when_no_media() {
    let adf = json!({
        "type": "doc",
        "version": 1,
        "content": [{
            "type": "paragraph",
            "content": [{ "type": "text", "text": "x", "styles": {} }]
        }]
    });
    let s = jira_comment_body_to_blocknote_doc(&adf, None).expect("doc");
    assert!(s.contains("x"));
}

#[test]
fn comment_adf_text_with_jira_color_wiki_strips_markers() {
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
    let s = jira_comment_body_to_blocknote_doc(&adf, None).expect("doc");
    assert!(!s.contains("{color"), "{}", s);
    assert!(s.contains("確認"), "{}", s);
    assert!(s.contains("textColor"), "{}", s);
}

#[test]
fn comment_markdown_string_without_ctx_converts() {
    let body = json!("## Hello\n\n- **x**");
    let s = jira_comment_body_to_blocknote_doc(&body, None).expect("doc");
    assert!(s.contains("heading"), "{}", s);
    assert!(s.contains("bulletListItem"), "{}", s);
}

#[test]
fn comment_jira_wiki_h2_string_converts_to_heading() {
    let body = json!("h2. Section title\n\nBody text");
    let s = jira_comment_body_to_blocknote_doc(&body, None).expect("doc");
    assert!(s.contains("heading"), "{}", s);
    assert!(s.contains("\"level\":2"), "{}", s);
    assert!(s.contains("Section title"), "{}", s);
    assert!(s.contains("Body text"), "{}", s);
}

#[test]
fn comment_jira_wiki_noformat_becomes_code_block() {
    let body = json!("See {noformat}curl https://x\n-H y{noformat} done.");
    let s = jira_comment_body_to_blocknote_doc(&body, None).expect("doc");
    assert!(!s.contains("{noformat}"), "{}", s);
    assert!(s.contains("curl"), "{}", s);
    assert!(s.contains("\"codeBlock\""), "{}", s);
    assert!(s.contains("done"), "{}", s);
}

#[test]
fn comment_jira_wiki_color_wiki_paragraph_strips_markers() {
    let body = json!("{color:#FF5630}[ 確認 ]{color}");
    let s = jira_comment_body_to_blocknote_doc(&body, None).expect("doc");
    assert!(!s.contains("{color"), "{}", s);
    assert!(s.contains("確認"), "{}", s);
    assert!(s.contains("textColor"), "{}", s);
    assert!(s.contains("#FF5630"), "{}", s);
}

#[test]
fn description_legacy_markdown_with_ctx_converts() {
    let ctx = AdfImportContext {
        project_id: "p".to_string(),
        entity_pk: "e".to_string(),
        jira_to_rizm: HashMap::new(),
        rizm_meta_by_id: HashMap::new(),
    };
    let md = "# Title\n\n**bold** line";
    let s = super::jira_import_string_to_blocknote_doc(md, Some(&ctx)).expect("doc");
    assert!(s.contains("heading"), "{}", s);
    assert!(s.contains("paragraph"), "{}", s);
}

#[test]
fn wiki_attachment_syntax_bypasses_markdown_when_ctx_present() {
    let ctx = AdfImportContext {
        project_id: "p".to_string(),
        entity_pk: "e".to_string(),
        jira_to_rizm: HashMap::new(),
        rizm_meta_by_id: HashMap::new(),
    };
    let s = "# not a heading via md\n!missing.png!";
    let out = super::jira_import_string_to_blocknote_doc(s, Some(&ctx)).expect("doc");
    assert!(
        out.contains("# not a heading via md"),
        "wiki path should keep markdown-looking text as plain: {}",
        out
    );
}

#[test]
fn wiki_attach_path_converts_jira_code_macro_via_markdown() {
    let ctx = AdfImportContext {
        project_id: "p".to_string(),
        entity_pk: "e".to_string(),
        jira_to_rizm: HashMap::new(),
        rizm_meta_by_id: HashMap::new(),
    };
    let s = "!f.png!\n{code:yaml}a\nb{code}";
    let out = super::jira_import_string_to_blocknote_doc(s, Some(&ctx)).expect("doc");
    assert!(!out.contains("{code"), "{}", out);
    assert!(out.contains("\"codeBlock\""), "{}", out);
    assert!(out.contains('a'), "{}", out);
}

#[test]
fn wiki_attach_path_triple_hash_without_space_is_heading() {
    let ctx = AdfImportContext {
        project_id: "p".to_string(),
        entity_pk: "e".to_string(),
        jira_to_rizm: HashMap::new(),
        rizm_meta_by_id: HashMap::new(),
    };
    let s = "!f.png!\n###CompactTitle";
    let out = super::jira_import_string_to_blocknote_doc(s, Some(&ctx)).expect("doc");
    assert!(out.contains("\"heading\""), "{}", out);
    assert!(out.contains("CompactTitle"), "{}", out);
}

/// Regression: ADF → BlockNote nested lists must not be flattened/re-parsed just because a line contains `https://`.
#[test]
fn flat_markdown_reparse_skips_blocknote_with_top_level_list_items() {
    let doc = r#"[{"id":"a","type":"bulletListItem","props":{},"content":[{"type":"text","text":"Top ","styles":{}},{"type":"text","text":"https://kenputer.example/x","styles":{}}],"children":[{"id":"b","type":"bulletListItem","props":{},"content":[{"type":"text","text":"Nested","styles":{}}],"children":[]}]}]"#;
    assert!(
        super::maybe_reparse_blocknote_from_flat_markdown(doc, None).is_none(),
        "must preserve list structure"
    );
}

/// Regression: ADF `codeBlock` + later bare URL must not trigger flat Markdown re-parse (TPD-155).
#[test]
fn flat_markdown_reparse_skips_blocknote_with_code_block() {
    let doc = r##"[{"id":"c1","type":"codeBlock","props":{"backgroundColor":"default","textColor":"default","textAlignment":"left","language":"text"},"content":[{"type":"text","text":"91:4  warning  x","styles":{}}],"children":[]},{"id":"p1","type":"paragraph","props":{},"content":[{"type":"text","text":"See https://developer.atlassian.com/x","styles":{}}],"children":[]}]"##;
    assert!(
        super::maybe_reparse_blocknote_from_flat_markdown(doc, None).is_none(),
        "must preserve codeBlock"
    );
}

/// Paragraph-only BlockNote whose joined text is ATX Markdown (legacy import shape).
#[test]
fn flat_markdown_reparse_still_runs_for_paragraph_with_atx_heading_text() {
    let ctx = AdfImportContext {
        project_id: "p".to_string(),
        entity_pk: "e".to_string(),
        jira_to_rizm: HashMap::new(),
        rizm_meta_by_id: HashMap::new(),
    };
    let doc = r##"[{"id":"p1","type":"paragraph","props":{},"content":[{"type":"text","text":"# Hello","styles":{}}],"children":[]},{"id":"p2","type":"paragraph","props":{},"content":[{"type":"text","text":"Line","styles":{}}],"children":[]}]"##;
    let out = super::maybe_reparse_blocknote_from_flat_markdown(doc, Some(&ctx));
    assert!(out.is_some(), "expected reparse: {:?}", out);
    let s = out.expect("reparse");
    assert!(s.contains("heading"), "{}", s);
    assert!(s.contains("Hello"), "{}", s);
}
