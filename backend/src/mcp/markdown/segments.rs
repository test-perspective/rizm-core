//! Splitters for Jira `{quote}`, `{noformat}`, and `{code}` / `{code:lang}` panel markers.

#[derive(Debug, Clone, Copy)]
pub(super) enum JiraQuoteSegment<'a> {
    Outside(&'a str),
    Quoted(&'a str),
}

#[derive(Debug, Clone, Copy)]
pub(super) enum JiraNoformatSegment<'a> {
    Outside(&'a str),
    Noformatted(&'a str),
}

#[derive(Debug, Clone, Copy)]
pub(super) enum JiraCodeSegment<'a> {
    Outside(&'a str),
    Coded {
        body: &'a str,
        language: Option<&'a str>,
    },
}

/// `{code}` or `{code:lang}` open tag: `(total_open_len, language_if_any)`.
fn parse_jira_code_open(s: &str) -> Option<(usize, Option<&str>)> {
    const PREFIX: &str = "{code";
    if !s.starts_with(PREFIX) {
        return None;
    }
    let after = s.get(PREFIX.len()..)?;
    if after.starts_with('}') {
        return Some((PREFIX.len() + 1, None));
    }
    if after.starts_with(':') {
        let rest = after.get(1..)?;
        let end_rel = rest.find('}')?;
        let lang_raw = rest.get(..end_rel)?;
        let lang_trim = lang_raw.trim();
        let language = if lang_trim.is_empty() {
            None
        } else {
            Some(lang_trim)
        };
        let open_len = PREFIX.len() + 1 + end_rel + 1;
        return Some((open_len, language));
    }
    None
}

/// First `{code}` close tag in `s` (exact `{code}`, not `{code:…}` open tags).
fn find_jira_code_close_tag(s: &str) -> Option<usize> {
    let mut start = 0usize;
    while start < s.len() {
        let rel = s.get(start..)?.find("{code}")?;
        let i = start + rel;
        if s.get(i..)
            .is_some_and(|t| t.starts_with("{code}") && !t.starts_with("{code:"))
        {
            return Some(i);
        }
        start = i + 1;
    }
    None
}

/// Split on Jira `{code}` / `{code:…}` … `{code}`; unclosed opening runs to end as `Coded`.
pub(super) fn split_jira_code_segments(input: &str) -> Vec<JiraCodeSegment<'_>> {
    let mut out = Vec::new();
    let mut rest = input;
    while !rest.is_empty() {
        let Some(pos) = rest.find("{code") else {
            out.push(JiraCodeSegment::Outside(rest));
            break;
        };
        let from_open = &rest[pos..];
        let Some((open_len, language)) = parse_jira_code_open(from_open) else {
            if pos > 0 {
                out.push(JiraCodeSegment::Outside(&rest[..pos]));
            }
            rest = &rest[(pos + 1).min(rest.len())..];
            continue;
        };
        if pos > 0 {
            out.push(JiraCodeSegment::Outside(&rest[..pos]));
        }
        let after_open = &from_open[open_len..];
        match find_jira_code_close_tag(after_open) {
            Some(close_rel) => {
                out.push(JiraCodeSegment::Coded {
                    body: &after_open[..close_rel],
                    language,
                });
                rest = &after_open[close_rel + "{code}".len()..];
            }
            None => {
                out.push(JiraCodeSegment::Coded {
                    body: after_open,
                    language,
                });
                break;
            }
        }
    }
    out
}

/// Split on `{noformat}` markers; unclosed opening runs to end of string as `Noformatted`.
/// Inner text is kept verbatim (no wiki / Markdown preprocessing).
pub(super) fn split_jira_noformat_segments(input: &str) -> Vec<JiraNoformatSegment<'_>> {
    const M: &str = "{noformat}";
    let mut out = Vec::new();
    let mut rest = input;
    while !rest.is_empty() {
        match rest.find(M) {
            None => {
                out.push(JiraNoformatSegment::Outside(rest));
                break;
            }
            Some(pos) => {
                if pos > 0 {
                    out.push(JiraNoformatSegment::Outside(&rest[..pos]));
                }
                rest = &rest[pos + M.len()..];
                match rest.find(M) {
                    Some(end) => {
                        out.push(JiraNoformatSegment::Noformatted(&rest[..end]));
                        rest = &rest[end + M.len()..];
                    }
                    None => {
                        if !rest.is_empty() {
                            out.push(JiraNoformatSegment::Noformatted(rest));
                        }
                        break;
                    }
                }
            }
        }
    }
    out
}

/// Split on `{quote}` markers; unclosed opening panel runs to end of string as `Quoted`.
pub(super) fn split_jira_quote_segments(input: &str) -> Vec<JiraQuoteSegment<'_>> {
    const M: &str = "{quote}";
    let mut out = Vec::new();
    let mut rest = input;
    while !rest.is_empty() {
        match rest.find(M) {
            None => {
                out.push(JiraQuoteSegment::Outside(rest));
                break;
            }
            Some(pos) => {
                if pos > 0 {
                    out.push(JiraQuoteSegment::Outside(&rest[..pos]));
                }
                rest = &rest[pos + M.len()..];
                match rest.find(M) {
                    Some(end) => {
                        out.push(JiraQuoteSegment::Quoted(&rest[..end]));
                        rest = &rest[end + M.len()..];
                    }
                    None => {
                        if !rest.is_empty() {
                            out.push(JiraQuoteSegment::Quoted(rest));
                        }
                        break;
                    }
                }
            }
        }
    }
    out
}
