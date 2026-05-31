//! Fetch external URL content. Used by AI Tools and MCP.

use anyhow::{Context, Result};
use reqwest::Client;
use serde_json::json;

const MAX_BODY_BYTES: usize = 512 * 1024;

/// Fetch content from an external URL. Returns JSON string with url, statusCode, content (or error).
pub async fn fetch_url(url_str: &str) -> Result<String> {
    let url_str = url_str.trim();
    if url_str.is_empty() {
        return Ok(json!({ "error": "url is required" }).to_string());
    }
    let parsed = url::Url::parse(url_str).context("invalid URL")?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Ok(json!({ "error": "only http and https URLs are allowed" }).to_string());
    }
    if let Some(host) = parsed.host_str() {
        let host_lower = host.to_lowercase();
        if host_lower == "localhost"
            || host_lower.starts_with("127.")
            || host_lower == "::1"
            || host_lower.ends_with(".local")
        {
            return Ok(json!({ "error": "localhost and local URLs are not allowed" }).to_string());
        }
    }

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .context("build http client")?;
    let resp = client.get(url_str).send().await.context("fetch failed")?;
    let status = resp.status();
    if !status.is_success() {
        return Ok(json!({
            "error": format!("HTTP {} {}", status.as_u16(), status.canonical_reason().unwrap_or("")),
            "statusCode": status.as_u16()
        })
        .to_string());
    }
    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();
    if !content_type.is_empty()
        && !content_type.contains("text/")
        && !content_type.contains("application/json")
        && !content_type.contains("application/xml")
        && !content_type.contains("application/xhtml")
    {
        return Ok(json!({
            "error": format!("unsupported content type: {}", content_type),
            "contentType": content_type
        })
        .to_string());
    }
    let bytes = resp.bytes().await.context("read body failed")?;
    if bytes.len() > MAX_BODY_BYTES {
        return Ok(json!({
            "error": format!("response too large (max {} KB)", MAX_BODY_BYTES / 1024),
            "truncated": true,
            "content": String::from_utf8_lossy(&bytes[..MAX_BODY_BYTES]).to_string()
        })
        .to_string());
    }
    let text = String::from_utf8_lossy(&bytes).to_string();
    Ok(json!({
        "url": url_str,
        "statusCode": 200,
        "content": text
    })
    .to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[tokio::test]
    async fn fetch_url_empty_returns_error_json() {
        let out = fetch_url("").await.unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(
            v.get("error").and_then(Value::as_str),
            Some("url is required")
        );
    }

    #[tokio::test]
    async fn fetch_url_whitespace_only_returns_error_json() {
        let out = fetch_url("   ").await.unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(
            v.get("error").and_then(Value::as_str),
            Some("url is required")
        );
    }

    #[tokio::test]
    async fn fetch_url_invalid_returns_err() {
        let err = fetch_url("not-a-url").await.unwrap_err();
        assert!(format!("{err}").contains("invalid"));
    }

    #[tokio::test]
    async fn fetch_url_file_scheme_returns_error_json() {
        let out = fetch_url("file:///etc/passwd").await.unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(
            v.get("error").and_then(Value::as_str),
            Some("only http and https URLs are allowed")
        );
    }

    #[tokio::test]
    async fn fetch_url_localhost_returns_error_json() {
        let out = fetch_url("http://localhost:8080/").await.unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(
            v.get("error").and_then(Value::as_str),
            Some("localhost and local URLs are not allowed")
        );
    }

    #[tokio::test]
    async fn fetch_url_127_returns_error_json() {
        let out = fetch_url("http://127.0.0.1/").await.unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(
            v.get("error").and_then(Value::as_str),
            Some("localhost and local URLs are not allowed")
        );
    }
}
