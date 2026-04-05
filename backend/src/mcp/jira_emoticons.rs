//! Jira wiki emoticon tokens (parentheses syntax) → Unicode emoji for import / Markdown conversion.

/// True if the character after `)` may follow a Jira emoticon (avoid `(x)yz` false positives).
fn emoticon_trailing_boundary_ok(rest_after_close: &str) -> bool {
    let Some(c) = rest_after_close.chars().next() else {
        return true;
    };
    c.is_whitespace()
        || matches!(
            c,
            '.' | ','
                | ';'
                | ':'
                | '!'
                | '?'
                | ')'
                | ']'
                | '}'
                | '"'
                | '\''
                | '*'
                | '_'
                | '`'
                | '，'
                | '。'
                | '、'
        )
}

/// Replace Jira-style `(token)` emoticons with emoji. Longer tokens are matched first.
pub fn replace_jira_emoticons(input: &str) -> String {
    const TOKENS: &[(&str, &str)] = &[
        ("(off)", "🔴"),
        ("(on)", "🟢"),
        ("(y)", "👍"),
        ("(n)", "👎"),
        ("(i)", "ℹ️"),
        ("(!)", "⚠️"),
        ("(?)", "❓"),
        ("(+)", "➕"),
        ("(-)", "➖"),
        ("(*)", "⭐"),
        ("(/)", "✅"),
        ("(x)", "❌"),
    ];

    let mut out = String::with_capacity(input.len());
    let b = input.as_bytes();
    let mut i = 0usize;

    'scan: while i < b.len() {
        if b[i] == b'(' {
            let rest = &input[i..];
            for (pat, emoji) in TOKENS {
                if rest.starts_with(pat) {
                    let after = input.get(i + pat.len()..).unwrap_or("");
                    if emoticon_trailing_boundary_ok(after) {
                        out.push_str(emoji);
                        i += pat.len();
                        continue 'scan;
                    }
                }
            }
        }
        let ch = input[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

#[cfg(test)]
mod tests {
    use super::replace_jira_emoticons;

    #[test]
    fn slash_and_x_become_check_and_cross() {
        assert_eq!(
            replace_jira_emoticons("(/) done (x) fail"),
            "✅ done ❌ fail"
        );
    }

    #[test]
    fn requires_boundary_after_close_paren() {
        assert_eq!(
            replace_jira_emoticons("(x)thing unchanged"),
            "(x)thing unchanged"
        );
    }

    #[test]
    fn punctuation_after_emoticon_ok() {
        assert_eq!(replace_jira_emoticons("(x)."), "❌.");
        assert_eq!(replace_jira_emoticons("(/)!"), "✅!");
    }
}
