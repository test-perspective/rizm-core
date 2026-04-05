//! HTTP client for Jira Cloud REST API.

use std::time::Duration;

use serde_json::Value;

use super::super::ImportEngineError;

const JIRA_API_PATH: &str = "/rest/api/3";
const JIRA_AGILE_PATH: &str = "/rest/agile/1.0";

/// Per-request ceiling so a stalled Jira call cannot block an import job indefinitely.
const JIRA_HTTP_TIMEOUT: Duration = Duration::from_secs(120);
const JIRA_CONNECT_TIMEOUT: Duration = Duration::from_secs(30);

fn build_http_client() -> Result<reqwest::Client, ImportEngineError> {
    reqwest::Client::builder()
        .connect_timeout(JIRA_CONNECT_TIMEOUT)
        .timeout(JIRA_HTTP_TIMEOUT)
        .build()
        .map_err(|e| ImportEngineError::Internal(e.to_string()))
}

pub fn base_url(config: &Value) -> Result<String, ImportEngineError> {
    let url = config
        .get("baseUrl")
        .or_else(|| config.get("base_url"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| ImportEngineError::InvalidConfig("baseUrl is required".to_string()))?;
    let url = url.trim().trim_end_matches('/');
    if url.is_empty() {
        return Err(ImportEngineError::InvalidConfig("baseUrl cannot be empty".to_string()));
    }
    Ok(url.to_string())
}

pub fn auth_header(config: &Value) -> Result<String, ImportEngineError> {
    if let Some(token) = config
        .get("apiToken")
        .or_else(|| config.get("api_token"))
        .and_then(|v| v.as_str())
    {
        let email = config
            .get("email")
            .and_then(|v| v.as_str())
            .unwrap_or("user@example.com");
        use base64::Engine;
        let basic = base64::engine::general_purpose::STANDARD
            .encode(format!("{}:{}", email, token).as_bytes());
        return Ok(format!("Basic {}", basic));
    }
    if let Some(token) = config
        .get("personalAccessToken")
        .or_else(|| config.get("personal_access_token"))
        .and_then(|v| v.as_str())
    {
        return Ok(format!("Bearer {}", token));
    }
    Err(ImportEngineError::InvalidConfig(
        "apiToken (with email) or personalAccessToken is required".to_string(),
    ))
}

pub async fn request(
    config: &Value,
    method: &str,
    path: &str,
    body: Option<Value>,
) -> Result<Value, ImportEngineError> {
    let base = base_url(config)?;
    let auth = auth_header(config)?;
    let url = format!(
        "{}{}{}",
        base,
        if base.ends_with('/') { "" } else { "/" },
        path
    );

    let client = build_http_client()?;

    let mut req = match method {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        _ => return Err(ImportEngineError::Internal(format!("unsupported method {}", method))),
    };

    req = req
        .header("Authorization", auth)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json");

    if let Some(b) = body {
        req = req.json(&b);
    }

    let res = req
        .send()
        .await
        .map_err(|e| ImportEngineError::Connection(e.to_string()))?;

    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| ImportEngineError::Api(e.to_string()))?;

    if !status.is_success() {
        return Err(ImportEngineError::Api(format!("{}: {}", status, text)));
    }

    if text.trim().is_empty() {
        return Ok(Value::Null);
    }

    serde_json::from_str(&text).map_err(|e| ImportEngineError::Parse(e.to_string()))
}

/// GET a binary resource (e.g. `/rest/api/3/attachment/content/{id}`). Does not parse JSON.
pub async fn request_bytes(config: &Value, path: &str) -> Result<Vec<u8>, ImportEngineError> {
    let base = base_url(config)?;
    let auth = auth_header(config)?;
    let url = format!(
        "{}{}{}",
        base,
        if base.ends_with('/') { "" } else { "/" },
        path
    );

    let client = build_http_client()?;

    let res = client
        .get(&url)
        .header("Authorization", auth)
        .header("Accept", "*/*")
        .send()
        .await
        .map_err(|e| ImportEngineError::Connection(e.to_string()))?;

    let status = res.status();
    let bytes = res
        .bytes()
        .await
        .map_err(|e| ImportEngineError::Api(e.to_string()))?;

    if !status.is_success() {
        let text = String::from_utf8_lossy(&bytes);
        return Err(ImportEngineError::Api(format!("{}: {}", status, text)));
    }

    Ok(bytes.to_vec())
}

pub fn jira_api_path() -> &'static str {
    JIRA_API_PATH
}

pub fn jira_agile_path() -> &'static str {
    JIRA_AGILE_PATH
}
