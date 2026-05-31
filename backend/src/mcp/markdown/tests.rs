use super::{markdown_to_blocknote_doc, normalize_jira_wiki_color_delimiters};
use serde_json::Value;

#[test]
fn normalize_jira_color_delimiters_utf8_after_open_brace_does_not_panic() {
    let s = "1x}}（デフォルト）：標準的なサイズ。";
    assert_eq!(normalize_jira_wiki_color_delimiters(s), s);
}

#[test]
fn normalize_jira_color_delimiters_case_insensitive_tags() {
    let s = "{Color:#abc}hi{Color}";
    assert_eq!(
        normalize_jira_wiki_color_delimiters(s),
        "{color:#abc}hi{color}"
    );
}

#[test]
fn jira_nested_star_bullets_become_children() {
    let doc = markdown_to_blocknote_doc("* top\n** nested\n** nested2\n* top2").expect("convert");
    let arr: Vec<Value> = serde_json::from_str(&doc).expect("parse");
    assert_eq!(arr.len(), 2);
    assert_eq!(
        arr[0].get("type").and_then(Value::as_str),
        Some("bulletListItem")
    );
    let ch = arr[0]
        .get("children")
        .and_then(Value::as_array)
        .expect("children");
    assert_eq!(
        ch.len(),
        2,
        "expected two nested items under first top bullet"
    );
    assert_eq!(
        ch[0].get("type").and_then(Value::as_str),
        Some("bulletListItem")
    );
}

/// Regression: `* a` then `**** b` used to infinite-loop in `consume_list_siblings` (child depth
/// skipped `min_depth + 1`), stalling Jira comment/description import.
#[test]
fn jira_bullet_depth_gap_normalizes_and_finishes() {
    let doc = markdown_to_blocknote_doc("* top\n**** deep_jump").expect("convert");
    let arr: Vec<Value> = serde_json::from_str(&doc).expect("parse");
    assert_eq!(arr.len(), 1);
    let ch = arr[0]
        .get("children")
        .and_then(Value::as_array)
        .expect("nested");
    assert_eq!(ch.len(), 1);
    assert_eq!(
        ch[0].get("type").and_then(Value::as_str),
        Some("bulletListItem")
    );
}

#[test]
fn markdown_indented_dash_nests_under_parent() {
    let doc = markdown_to_blocknote_doc("- outer\n  - inner").expect("convert");
    let arr: Vec<Value> = serde_json::from_str(&doc).expect("parse");
    assert_eq!(arr.len(), 1);
    let ch = arr[0]
        .get("children")
        .and_then(Value::as_array)
        .expect("children");
    assert_eq!(ch.len(), 1);
}

#[test]
fn markdown_table_becomes_blocknote_table() {
    let doc = markdown_to_blocknote_doc("| Name | Value |\n| --- | --- |\n| alpha | 1 |")
        .expect("convert");
    let arr: Vec<Value> = serde_json::from_str(&doc).expect("parse");
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0].get("type").and_then(Value::as_str), Some("table"));
    let rows = arr[0]
        .get("content")
        .and_then(|c| c.get("rows"))
        .and_then(Value::as_array)
        .expect("rows");
    assert_eq!(rows.len(), 2);
    assert_eq!(
        rows[0]["cells"][0]["content"][0]["text"].as_str(),
        Some("Name")
    );
    assert_eq!(
        rows[0]["cells"][1]["content"][0]["text"].as_str(),
        Some("Value")
    );
    assert_eq!(
        rows[1]["cells"][0]["content"][0]["text"].as_str(),
        Some("alpha")
    );
    assert_eq!(
        rows[1]["cells"][1]["content"][0]["text"].as_str(),
        Some("1")
    );
}

#[test]
fn inline_autolink_https() {
    let doc = markdown_to_blocknote_doc("see https://example.com/path ok").expect("convert");
    let arr: Vec<Value> = serde_json::from_str(&doc).expect("parse");
    let c = arr[0]
        .get("content")
        .and_then(Value::as_array)
        .expect("content");
    let link = c
        .iter()
        .find(|x| x.get("type").and_then(Value::as_str) == Some("link"))
        .expect("link segment");
    assert_eq!(
        link.get("href").and_then(Value::as_str),
        Some("https://example.com/path")
    );
}

#[test]
fn inline_markdown_bracket_link() {
    let doc = markdown_to_blocknote_doc("[open](https://a.com/b)").expect("convert");
    let arr: Vec<Value> = serde_json::from_str(&doc).expect("parse");
    let c = arr[0]
        .get("content")
        .and_then(Value::as_array)
        .expect("content");
    assert_eq!(c.len(), 1);
    assert_eq!(c[0].get("type").and_then(Value::as_str), Some("link"));
    assert_eq!(
        c[0].get("href").and_then(Value::as_str),
        Some("https://a.com/b")
    );
}

#[test]
fn markdown_bracket_link_same_url_not_double_nested() {
    let doc =
        markdown_to_blocknote_doc("[https://ex.com/x](https://ex.com/x) tail").expect("convert");
    let arr: Vec<Value> = serde_json::from_str(&doc).expect("parse");
    let c = arr[0]
        .get("content")
        .and_then(Value::as_array)
        .expect("content");
    let link = c
        .iter()
        .find(|x| x.get("type").and_then(Value::as_str) == Some("link"))
        .expect("link");
    let inner = link
        .get("content")
        .and_then(Value::as_array)
        .expect("inner");
    assert!(
        !inner
            .iter()
            .any(|x| x.get("type").and_then(Value::as_str) == Some("link")),
        "must not nest link inside link: {:?}",
        inner
    );
}

#[test]
fn jira_bracket_alias_pipe_url_becomes_markdown_link() {
    let doc =
        markdown_to_blocknote_doc("[https://ex.com/x|https://ex.com/x] after").expect("convert");
    let arr: Vec<Value> = serde_json::from_str(&doc).expect("parse");
    let c = arr[0]
        .get("content")
        .and_then(Value::as_array)
        .expect("content");
    let link = c
        .iter()
        .find(|x| x.get("type").and_then(Value::as_str) == Some("link"))
        .expect("link");
    assert_eq!(
        link.get("href").and_then(Value::as_str),
        Some("https://ex.com/x")
    );
}

#[test]
fn jira_bracket_link_keeps_hash_fragment_in_https_url() {
    let url = "https://mail.example/mail/u/0/#inbox/FMfcgzQVxlQDDZjBsRbZdsspxksbZVrL";
    let line = format!("[{url}|{url}]");
    let doc = markdown_to_blocknote_doc(&line).expect("convert");
    let arr: Vec<Value> = serde_json::from_str(&doc).expect("parse");
    let c = arr[0]
        .get("content")
        .and_then(Value::as_array)
        .expect("content");
    let link = c
        .iter()
        .find(|x| x.get("type").and_then(Value::as_str) == Some("link"))
        .expect("link");
    assert_eq!(link.get("href").and_then(Value::as_str), Some(url));
}

#[test]
fn extract_first_http_url_stops_at_pipe() {
    assert_eq!(
        super::extract_first_http_url("https://a.com/b|https://a.com/b").as_deref(),
        Some("https://a.com/b")
    );
}

#[test]
fn preprocess_angle_mailto_link() {
    let doc =
        markdown_to_blocknote_doc("Contact <[a@b.com|mailto:a@b.com]> please").expect("convert");
    assert!(doc.contains("mailto:"), "{}", doc);
    assert!(doc.contains("link") || doc.contains("a@b.com"), "{}", doc);
}

#[test]
fn preprocess_strips_quote_and_templates() {
    let doc =
        markdown_to_blocknote_doc("{quote}Hello{quote} and {{fetchPageName}}").expect("convert");
    assert!(!doc.contains("{quote}"), "{}", doc);
    assert!(doc.contains("\"quote\""), "expected quote block: {}", doc);
    assert!(doc.contains("Hello"), "{}", doc);
    assert!(doc.contains("fetchPageName"), "{}", doc);
    assert!(
        doc.contains("\"code\":true"),
        "expected inline code style: {}",
        doc
    );
}

#[test]
fn jira_quote_panel_wraps_multiline_content() {
    let doc =
        markdown_to_blocknote_doc("{quote}Line one\n\nLine two{quote}\n\nAfter").expect("convert");
    let arr: Vec<Value> = serde_json::from_str(&doc).expect("parse");
    let q = arr
        .iter()
        .find(|b| b.get("type").and_then(Value::as_str) == Some("quote"));
    assert!(q.is_some(), "{}", doc);
    let ch = q
        .unwrap()
        .get("children")
        .and_then(Value::as_array)
        .expect("children");
    assert!(
        ch.len() >= 2,
        "expected multiple blocks inside quote: {}",
        doc
    );
    assert!(doc.contains("After"), "{}", doc);
}

#[test]
fn preprocess_confluence_colon_brace_template() {
    let doc = markdown_to_blocknote_doc("x {{avi:confluence:trashed:page}} y").expect("convert");
    assert!(!doc.contains("{{"), "{}", doc);
    assert!(doc.contains("avi:confluence:trashed:page"), "{}", doc);
    assert!(doc.contains("\"code\":true"), "{}", doc);
}

#[test]
fn preprocess_confluence_double_brace_with_cjk_suffix() {
    let doc = markdown_to_blocknote_doc("x {{read:attachment:confluenceが必要だったの}} y")
        .expect("convert");
    assert!(!doc.contains("{{"), "{}", doc);
    assert!(doc.contains("read:attachment:confluence"), "{}", doc);
    assert!(doc.contains("が必要だったの"), "{}", doc);
    assert!(doc.contains("\"code\":true"), "{}", doc);
}

#[test]
fn jira_noformat_becomes_code_block_and_strips_markers() {
    let doc =
        markdown_to_blocknote_doc("Intro {noformat}line1\nline2{noformat} outro").expect("convert");
    assert!(!doc.contains("{noformat}"), "{}", doc);
    assert!(doc.contains("line1"), "{}", doc);
    assert!(doc.contains("line2"), "{}", doc);
    assert!(doc.contains("Intro"), "{}", doc);
    assert!(doc.contains("outro"), "{}", doc);
    assert!(doc.contains("\"codeBlock\""), "{}", doc);
    assert!(doc.contains("\"language\":\"text\""), "{}", doc);
}

#[test]
fn jira_noformat_does_not_parse_markdown_inside() {
    let doc = markdown_to_blocknote_doc("{noformat}**not bold**{noformat}").expect("convert");
    assert!(!doc.contains("{noformat}"), "{}", doc);
    assert!(doc.contains("**not bold**"), "{}", doc);
}

#[test]
fn jira_wiki_color_hex_strips_markers_and_sets_text_color() {
    let doc = markdown_to_blocknote_doc("{color:#FF5630}[ 確認 ]{color}").expect("convert");
    assert!(!doc.contains("{color"), "{}", doc);
    assert!(doc.contains("確認"), "{}", doc);
    assert!(doc.contains("#FF5630"), "{}", doc);
    assert!(doc.contains("textColor"), "{}", doc);
}

#[test]
fn jira_wiki_color_bare_hex_gets_hash_prefix() {
    let doc = markdown_to_blocknote_doc("{color:FF5630}X{color}").expect("convert");
    assert!(doc.contains("\"textColor\":\"#FF5630\""), "{}", doc);
    assert!(doc.contains("\"text\":\"X\""), "{}", doc);
}

#[test]
fn jira_wiki_nested_color_closes_inner_first() {
    let doc =
        markdown_to_blocknote_doc("{color:red}a{color:blue}b{color}c{color}").expect("convert");
    assert!(!doc.contains("{color"), "{}", doc);
    assert!(doc.contains("a"), "{}", doc);
    assert!(doc.contains("b"), "{}", doc);
    assert!(doc.contains("c"), "{}", doc);
    assert!(doc.contains("\"textColor\":\"red\""), "{}", doc);
    assert!(doc.contains("\"textColor\":\"blue\""), "{}", doc);
}

#[test]
fn jira_wiki_h2_line_becomes_heading_block() {
    let doc = markdown_to_blocknote_doc("h2. Section title\n\nParagraph body.").expect("convert");
    assert!(doc.contains("\"heading\""), "{}", doc);
    assert!(doc.contains("\"level\":2"), "{}", doc);
    assert!(doc.contains("Section title"), "{}", doc);
    assert!(doc.contains("Paragraph body"), "{}", doc);
}

#[test]
fn jira_wiki_h6_clamps_to_heading_level_3() {
    let doc = markdown_to_blocknote_doc("h6. Deep").expect("convert");
    assert!(doc.contains("\"heading\""), "{}", doc);
    assert!(doc.contains("\"level\":3"), "{}", doc);
}

#[test]
fn jira_wiki_heading_line_is_case_insensitive() {
    let doc = markdown_to_blocknote_doc("H3. Caps title\n\nBody.").expect("convert");
    assert!(doc.contains("\"heading\""), "{}", doc);
    assert!(doc.contains("\"level\":3"), "{}", doc);
    assert!(doc.contains("Caps title"), "{}", doc);
}

#[test]
fn atx_heading_without_space_after_hashes() {
    let doc = markdown_to_blocknote_doc("###NoSpaceTitle\n\np").expect("convert");
    assert!(doc.contains("\"heading\""), "{}", doc);
    assert!(doc.contains("\"level\":3"), "{}", doc);
    assert!(doc.contains("NoSpaceTitle"), "{}", doc);
}

#[test]
fn jira_code_block_strips_markers_and_preserves_newlines() {
    let doc = markdown_to_blocknote_doc("{code}line1\nline2{code} after").expect("convert");
    assert!(!doc.contains("{code}"), "{}", doc);
    assert!(doc.contains("line1"), "{}", doc);
    assert!(doc.contains("line2"), "{}", doc);
    assert!(doc.contains("after"), "{}", doc);
    assert!(doc.contains("\"codeBlock\""), "{}", doc);
}

#[test]
fn jira_code_block_with_lang_strips_open_attributes() {
    let doc = markdown_to_blocknote_doc("{code:java}x{code}").expect("convert");
    assert!(!doc.contains("{code"), "{}", doc);
    assert!(doc.contains("\"text\":\"x\""), "{}", doc);
    assert!(doc.contains("\"codeBlock\""), "{}", doc);
    assert!(doc.contains("\"language\":\"java\""), "{}", doc);
}

#[test]
fn bracket_mailto_without_angle() {
    let doc = markdown_to_blocknote_doc("[a@b.com|mailto:a@b.com]").expect("convert");
    assert!(doc.contains("mailto:"), "{}", doc);
}

#[test]
fn jira_emoticons_in_markdown_line() {
    let doc = markdown_to_blocknote_doc("(/) pass (x) fail").expect("convert");
    let arr: Vec<Value> = serde_json::from_str(&doc).expect("parse");
    let t = arr[0].get("content").and_then(Value::as_array).expect("c")[0]
        .get("text")
        .and_then(Value::as_str)
        .expect("text");
    assert!(t.contains('✅'), "{t}");
    assert!(t.contains('❌'), "{t}");
}
