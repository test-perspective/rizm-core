//! Repair BlockNote docs where Jira `[alias|url]` or duplicated hrefs produced mangled link nodes.

use serde_json::{json, Value};

use super::inline_text::inline_text_eq;
use super::json_norm::is_blocknote_doc_json_string;
use crate::mcp::markdown::extract_first_http_url;

fn sanitize_nested_same_href_links_in_value(v: &Value) -> (Value, bool) {
    if v.get("type").and_then(|t| t.as_str()) != Some("link") {
        return (v.clone(), false);
    }
    let mut v = v.clone();
    let mut changed = false;
    if let Some(obj) = v.as_object_mut() {
        if let Some(Value::Array(items)) = obj.get_mut("content") {
            let mut new_items = Vec::with_capacity(items.len());
            for it in items.iter() {
                let (ni, c) = sanitize_nested_same_href_links_in_value(it);
                new_items.push(ni);
                changed |= c;
            }
            *items = new_items;
        }
    }
    let before = v.clone();
    let v = peel_redundant_same_href_link_wrapper(v);
    if v != before {
        changed = true;
    }
    (v, changed)
}

/// `link { href, content: [ link { same href, ... } ] }` → inner link (repeat until stable).
fn peel_redundant_same_href_link_wrapper(mut v: Value) -> Value {
    loop {
        let next = {
            let Some(obj) = v.as_object() else {
                break;
            };
            if obj.get("type").and_then(|t| t.as_str()) != Some("link") {
                break;
            }
            let outer_h = obj.get("href").and_then(|h| h.as_str());
            let inner = match obj.get("content").and_then(|c| c.as_array()) {
                Some(a) if a.len() == 1 => a.first(),
                _ => break,
            };
            let Some(inner) = inner else {
                break;
            };
            let inner_o = match inner.as_object() {
                Some(o) => o,
                None => break,
            };
            if inner_o.get("type").and_then(|t| t.as_str()) != Some("link") {
                break;
            }
            let inner_h = inner_o.get("href").and_then(|h| h.as_str());
            if outer_h != inner_h {
                break;
            }
            inner.clone()
        };
        v = next;
    }
    v
}

fn sanitize_nested_same_href_links_in_array(items: &[Value]) -> (Vec<Value>, bool) {
    let mut out = Vec::with_capacity(items.len());
    let mut changed = false;
    for it in items {
        let (nv, c) = sanitize_nested_same_href_links_in_value(it);
        out.push(nv);
        changed |= c;
    }
    (out, changed)
}

fn try_fix_mangled_link(v: &Value) -> Option<Value> {
    let o = v.as_object()?;
    if o.get("type").and_then(|t| t.as_str()) != Some("link") {
        return None;
    }
    let href = o.get("href").and_then(|x| x.as_str())?;
    let clean = extract_first_http_url(href)?;
    if clean == href && !href.contains('|') && !href.contains(']') {
        return None;
    }
    Some(json!({
        "type": "link",
        "href": clean,
        "content": [{
            "type": "text",
            "text": clean,
            "styles": {}
        }]
    }))
}

fn sanitize_inline_content_array(items: &[Value]) -> (Vec<Value>, bool) {
    let mut out: Vec<Value> = Vec::new();
    let mut i = 0;
    let mut changed = false;
    while i < items.len() {
        if i + 1 < items.len() && inline_text_eq(&items[i], "[") {
            if let Some(fixed) = try_fix_mangled_link(&items[i + 1]) {
                out.push(fixed);
                i += 2;
                changed = true;
                continue;
            }
        }
        if let Some(fixed) = try_fix_mangled_link(&items[i]) {
            let was_same = fixed == items[i];
            out.push(fixed);
            if !was_same {
                changed = true;
            }
            i += 1;
            continue;
        }
        out.push(items[i].clone());
        i += 1;
    }
    let (out, c2) = sanitize_nested_same_href_links_in_array(&out);
    (out, changed || c2)
}

fn sanitize_blocknote_recursive(block: &Value) -> (Value, bool) {
    let mut b = block.clone();
    let mut any = false;
    if let Some(obj) = b.as_object_mut() {
        // ADF blockquote used `content: []` with block `children`; BlockNote quote needs inline content.
        if obj.get("type").and_then(|t| t.as_str()) == Some("quote") {
            let needs_placeholder = obj
                .get("content")
                .and_then(|c| c.as_array())
                .map(|a| a.is_empty())
                .unwrap_or(true)
                && obj
                    .get("children")
                    .and_then(|c| c.as_array())
                    .map(|a| !a.is_empty())
                    .unwrap_or(false);
            if needs_placeholder {
                obj.insert(
                    "content".to_string(),
                    json!([{
                        "type": "text",
                        "text": "",
                        "styles": {}
                    }]),
                );
                any = true;
            }
        }
        let typ = obj.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if matches!(
            typ,
            "paragraph"
                | "heading"
                | "bulletListItem"
                | "numberedListItem"
                | "toggleListItem"
                | "checkListItem"
                | "quote"
        ) {
            if let Some(Value::Array(items)) = obj.get("content") {
                let (new_items, c) = sanitize_inline_content_array(items);
                if c {
                    obj.insert("content".to_string(), Value::Array(new_items));
                    any = true;
                }
            }
        }
        if let Some(Value::Array(children)) = obj.get("children") {
            let mut new_ch = Vec::new();
            let mut c2 = false;
            for ch in children {
                let (nb, c) = sanitize_blocknote_recursive(ch);
                c2 |= c;
                new_ch.push(nb);
            }
            if c2 {
                obj.insert("children".to_string(), Value::Array(new_ch));
                any = true;
            }
        }
    }
    (b, any)
}

/// Repair BlockNote docs where Jira `[alias|url]` was split into `[` text + malformed `link` href.
pub fn maybe_sanitize_jira_wiki_mangled_links(s: &str) -> Option<String> {
    let t = s.trim();
    if !is_blocknote_doc_json_string(t) {
        return None;
    }
    let arr: Vec<Value> = serde_json::from_str(t).ok()?;
    let mut out = Vec::new();
    let mut any = false;
    for b in arr {
        let (nb, c) = sanitize_blocknote_recursive(&b);
        any |= c;
        out.push(nb);
    }
    if !any {
        return None;
    }
    serde_json::to_string(&out).ok()
}
