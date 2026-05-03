//! Heuristics: Jira wiki attachment syntax and Markdown detection.

use crate::mcp::markdown::{parse_atx_heading_line, parse_jira_wiki_heading_line};

/// True if `s` contains a Jira wiki-style attachment segment `!name!` (single line, non-empty inner).
pub(super) fn has_jira_wiki_attachment_syntax(s: &str) -> bool {
    let mut rest = s;
    while let Some(i) = rest.find('!') {
        let after = &rest[i + 1..];
        if let Some(j) = after.find('!') {
            let inner = after[..j].trim();
            if !inner.is_empty() && !inner.contains('\n') {
                return true;
            }
            rest = &after[j + 1..];
        } else {
            break;
        }
    }
    false
}

/// Heuristic: treat as Markdown when common Markdown markers appear (headings, lists, code fences, links, emphasis).
pub(super) fn looks_like_markdown(s: &str) -> bool {
    if s.contains("```") {
        return true;
    }
    let normalized = s.replace('\r', "");
    for line in normalized.lines() {
        let t = line.trim_start();
        if parse_atx_heading_line(t).is_some()
            || t.starts_with("- ")
            || t.starts_with("* ")
            || t.starts_with("> ")
            || parse_jira_wiki_heading_line(t).is_some()
        {
            return true;
        }
        // Jira-style bullets often use `*word` without a space after `*`.
        if let Some(rest) = t.strip_prefix('*') {
            if !rest.starts_with('*') && !rest.is_empty() {
                return true;
            }
        }
        if t.contains('[') && t.contains("](") {
            return true;
        }
        // Bare URLs (Jira / pasted text) — re-parse and autolink in Markdown path.
        if t.contains("https://") || t.contains("http://") {
            return true;
        }
        // Jira nested bullets mis-imported as a paragraph line (`** subitem`).
        let u = t.trim_start();
        if u.starts_with("** ") || u.starts_with("*** ") {
            return true;
        }
    }
    if s.contains("(/)")
        || s.contains("(x)")
        || s.contains("(y)")
        || s.contains("(n)")
        || s.contains("(i)")
        || s.contains("(!)")
        || s.contains("(?)")
    {
        return true;
    }
    if s.contains("(on)") || s.contains("(off)") {
        return true;
    }
    if s.contains("(+)") || s.contains("(-)") || s.contains("(*)") {
        return true;
    }
    if s.contains("{quote}")
        || s.contains("{noformat}")
        || s.contains("{code}")
        || s.contains("{code:")
        || s.contains("{color:")
        || s.contains("{{")
        || s.contains("<[")
    {
        return true;
    }
    let star_pairs = s.match_indices("**").count();
    if star_pairs >= 2 {
        return true;
    }
    s.matches('`').count() >= 2
}
