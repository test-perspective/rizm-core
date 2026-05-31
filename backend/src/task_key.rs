use anyhow::{bail, Context, Result};

pub fn is_valid_project_key(s: &str) -> bool {
    // 3-10 chars, A-Z0-9
    let k = s.trim().to_uppercase();
    let bytes = k.as_bytes();
    if bytes.len() < 3 || bytes.len() > 10 {
        return false;
    }
    bytes.iter().all(|b| matches!(b, b'A'..=b'Z' | b'0'..=b'9'))
}

pub fn parse_task_key_and_project(raw: &str) -> Result<(String, String)> {
    let raw = raw.trim();
    if raw.is_empty() {
        bail!("empty");
    }
    let upper = raw.to_uppercase();
    let (prefix, rest) = upper.split_once('-').context("missing '-'")?;
    if !is_valid_project_key(prefix) {
        bail!("invalid projectKey prefix");
    }
    if rest.is_empty() || !rest.as_bytes().iter().all(|b| matches!(b, b'0'..=b'9')) {
        bail!("invalid task sequence");
    }
    let n: i64 = rest.parse().context("invalid sequence")?;
    if n <= 0 {
        bail!("sequence must be > 0");
    }
    Ok((prefix.to_string(), format!("{prefix}-{n}")))
}
