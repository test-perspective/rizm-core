use axum::http::StatusCode;
use serde_json::{json, Value};

use crate::ApiError;

use super::super::{BitbucketProjectConfig, CreatePullRequestRequest};

pub async fn bitbucket_get_mainbranch(
    cfg: &BitbucketProjectConfig,
    access_token: &str,
) -> Result<Option<String>, ApiError> {
    let url = format!(
        "https://api.bitbucket.org/2.0/repositories/{}/{}/?fields=mainbranch.name",
        urlencoding::encode(&cfg.workspace),
        urlencoding::encode(&cfg.repo_slug)
    );
    let client = reqwest::Client::new();
    let res = client
        .get(url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|_| ApiError::internal())?;
    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        if status == StatusCode::UNAUTHORIZED {
            return Err(ApiError::unauthorized(text));
        }
        if status == StatusCode::FORBIDDEN {
            return Err(ApiError::forbidden(text));
        }
        return Err(ApiError::bad_request(text));
    }
    let json: Value = res.json().await.map_err(|_| ApiError::internal())?;
    let name = json
        .get("mainbranch")
        .and_then(|m| m.get("name"))
        .and_then(|n| n.as_str())
        .map(|s| s.to_string());
    Ok(name)
}

pub async fn bitbucket_list_branches(
    cfg: &BitbucketProjectConfig,
    access_token: &str,
    query: Option<&str>,
) -> Result<Vec<String>, ApiError> {
    let q = match query {
        Some(s) if !s.trim().is_empty() => format!(r#"name ~ "{}""#, s.trim()),
        _ => r#"name ~ "master" OR name ~ "main" OR name ~ "develop""#.to_string(),
    };
    let q_encoded = urlencoding::encode(&q).to_string();
    let url = format!(
        "https://api.bitbucket.org/2.0/repositories/{}/{}/refs/branches?pagelen=20&sort=-target.date&q={}",
        urlencoding::encode(&cfg.workspace),
        urlencoding::encode(&cfg.repo_slug),
        q_encoded
    );
    let client = reqwest::Client::new();
    let res = client
        .get(url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|_| ApiError::internal())?;
    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        if status == StatusCode::UNAUTHORIZED {
            return Err(ApiError::unauthorized(text));
        }
        if status == StatusCode::FORBIDDEN {
            return Err(ApiError::forbidden(text));
        }
        return Err(ApiError::bad_request(text));
    }
    let json: Value = res.json().await.map_err(|_| ApiError::internal())?;
    let mut out = Vec::new();
    if let Some(values) = json.get("values").and_then(|v| v.as_array()) {
        for v in values {
            if let Some(name) = v.get("name").and_then(|n| n.as_str()) {
                out.push(name.to_string());
            }
        }
    }
    Ok(out)
}

async fn bitbucket_get_branch_hash(
    cfg: &BitbucketProjectConfig,
    access_token: &str,
    branch: &str,
) -> Result<String, ApiError> {
    let url = format!(
        "https://api.bitbucket.org/2.0/repositories/{}/{}/refs/branches/{}",
        urlencoding::encode(&cfg.workspace),
        urlencoding::encode(&cfg.repo_slug),
        urlencoding::encode(branch)
    );
    let client = reqwest::Client::new();
    let res = client
        .get(url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|_| ApiError::internal())?;
    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        if status == StatusCode::UNAUTHORIZED {
            return Err(ApiError::unauthorized(text));
        }
        if status == StatusCode::FORBIDDEN {
            return Err(ApiError::forbidden(text));
        }
        return Err(ApiError::bad_request(text));
    }
    let json: Value = res.json().await.map_err(|_| ApiError::internal())?;
    json.get("target")
        .and_then(|t| t.get("hash"))
        .and_then(|h| h.as_str())
        .map(|s| s.to_string())
        .ok_or_else(ApiError::internal)
}

pub async fn bitbucket_create_branch(
    cfg: &BitbucketProjectConfig,
    access_token: &str,
    name: &str,
    base_branch: &str,
) -> Result<(String, String), ApiError> {
    let target_hash = bitbucket_get_branch_hash(cfg, access_token, base_branch).await?;
    let url = format!(
        "https://api.bitbucket.org/2.0/repositories/{}/{}/refs/branches",
        urlencoding::encode(&cfg.workspace),
        urlencoding::encode(&cfg.repo_slug)
    );
    let client = reqwest::Client::new();
    let res = client
        .post(url)
        .bearer_auth(access_token)
        .json(&json!({
            "name": name,
            "target": { "hash": target_hash }
        }))
        .send()
        .await
        .map_err(|_| ApiError::internal())?;
    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        if status == StatusCode::UNAUTHORIZED {
            return Err(ApiError::unauthorized(text));
        }
        if status == StatusCode::FORBIDDEN {
            return Err(ApiError::forbidden(text));
        }
        return Err(ApiError::bad_request(text));
    }
    let json: Value = res.json().await.map_err(|_| ApiError::internal())?;
    let branch_name = json.get("name").and_then(|v| v.as_str()).unwrap_or(name).to_string();
    let html = json
        .get("links")
        .and_then(|l| l.get("html"))
        .and_then(|h| h.get("href"))
        .and_then(|h| h.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            format!(
                "https://bitbucket.org/{}/{}/branch/{}",
                cfg.workspace,
                cfg.repo_slug,
                urlencoding::encode(name)
            )
        });
    Ok((branch_name, html))
}

pub async fn bitbucket_create_pull_request(
    cfg: &BitbucketProjectConfig,
    access_token: &str,
    req: &CreatePullRequestRequest,
) -> Result<(String, String, String), ApiError> {
    let url = format!(
        "https://api.bitbucket.org/2.0/repositories/{}/{}/pullrequests",
        urlencoding::encode(&cfg.workspace),
        urlencoding::encode(&cfg.repo_slug)
    );
    let client = reqwest::Client::new();
    let res = client
        .post(url)
        .bearer_auth(access_token)
        .json(&json!({
            "title": req.title,
            "description": req.description,
            "source": { "branch": { "name": req.source_branch } },
            "destination": { "branch": { "name": req.destination_branch } }
        }))
        .send()
        .await
        .map_err(|_| ApiError::internal())?;
    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        if status == StatusCode::UNAUTHORIZED {
            return Err(ApiError::unauthorized(text));
        }
        if status == StatusCode::FORBIDDEN {
            return Err(ApiError::forbidden(text));
        }
        return Err(ApiError::bad_request(text));
    }
    let json: Value = res.json().await.map_err(|_| ApiError::internal())?;
    let id = json.get("id").map(|v| v.to_string()).unwrap_or_else(|| "unknown".to_string());
    let title = json.get("title").and_then(|v| v.as_str()).unwrap_or(&req.title).to_string();
    let html = json
        .get("links")
        .and_then(|l| l.get("html"))
        .and_then(|h| h.get("href"))
        .and_then(|h| h.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("https://bitbucket.org/{}/{}/pull-requests", cfg.workspace, cfg.repo_slug));
    Ok((id, title, html))
}
