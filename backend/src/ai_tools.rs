use serde::Serialize;
use serde_json::{json, Value};
use std::time::Duration;

use crate::ai_common::extract_non_json_text;
use crate::ai_progress::{AiProgressEvent, AiProgressSender};
use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::ApiError;
use tokio::sync::watch;

mod tool_defs;
mod tool_exec;
mod tool_exec_admin;
use tool_defs::build_tool_definitions;
use tool_exec::{append_tool_calls, parse_tool_calls};

/// Builds a user-friendly error message when the LLM provider returns a non-200 response.
/// Extracts provider error details from JSON body when available (e.g. OpenRouter/DeepSeek format).
pub fn build_llm_error_message(status: u16, body: &str) -> String {
    let base = match status {
        401 => "Invalid API key. Please check your API key in LLM settings.",
        403 => "Access denied. Please verify your API key and permissions.",
        429 => "Rate limit exceeded. Please try again later.",
        _ => return format!("LLM provider error (HTTP {}).", status),
    };
    let detail = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| {
            v.get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str().map(String::from))
        })
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    match detail {
        Some(d) => {
            let truncated = if d.chars().count() > 200 {
                format!("{}...", d.chars().take(200).collect::<String>())
            } else {
                d
            };
            format!("{} Details: {}", base, truncated)
        }
        None => base.to_string(),
    }
}

#[derive(Debug, Clone)]
pub struct DeepseekConfig {
    pub base_url: String,
    pub model: String,
    pub timeout_secs: u64,
    pub connect_timeout_secs: u64,
}

pub fn deepseek_config() -> DeepseekConfig {
    DeepseekConfig {
        base_url: std::env::var("KEEL_DEEPSEEK_BASE_URL")
            .unwrap_or_else(|_| "https://api.deepseek.com".to_string()),
        model: std::env::var("KEEL_DEEPSEEK_MODEL").unwrap_or_else(|_| "deepseek-chat".to_string()),
        timeout_secs: std::env::var("KEEL_DEEPSEEK_TIMEOUT_SECS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(300),
        connect_timeout_secs: std::env::var("KEEL_DEEPSEEK_CONNECT_TIMEOUT_SECS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(10),
    }
}

pub fn resolve_deepseek_api_key(req_key: Option<&str>) -> Result<String, ApiError> {
    let req_key = req_key.map(|s| s.trim()).filter(|s| !s.is_empty());
    let env_key = std::env::var("KEEL_DEEPSEEK_API_KEY")
        .ok()
        .map(|s| s.trim().to_string());
    let env_key = env_key
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());
    req_key.or(env_key).map(|s| s.to_string()).ok_or_else(|| {
        ApiError::bad_request("deepseek api key is not set (set in UI or KEEL_DEEPSEEK_API_KEY)")
    })
}

/// Unified LLM config for OpenAI-compatible providers (Open Router, DeepSeek, Ollama).
#[derive(Debug, Clone)]
pub struct LlmConfig {
    pub base_url: String,
    pub model: String,
    pub api_key: Option<String>,
    pub timeout_secs: u64,
    pub connect_timeout_secs: u64,
}

impl LlmConfig {
    pub fn for_openrouter(model: String, api_key: String) -> Result<Self, ApiError> {
        let api_key = api_key.trim().to_string();
        if api_key.is_empty() {
            return Err(ApiError::bad_request(
                "Open Router API key is required (set in LLM settings)",
            ));
        }
        Ok(Self {
            base_url: std::env::var("KEEL_OPENROUTER_BASE_URL")
                .unwrap_or_else(|_| "https://openrouter.ai/api/v1".to_string()),
            model,
            api_key: Some(api_key),
            timeout_secs: 300,
            connect_timeout_secs: 10,
        })
    }

    pub fn for_deepseek(api_key: String, model_override: Option<String>) -> Result<Self, ApiError> {
        let api_key = resolve_deepseek_api_key(Some(api_key.as_str()))?;
        let config = deepseek_config();
        Ok(Self {
            base_url: config.base_url,
            model: model_override.unwrap_or(config.model),
            api_key: Some(api_key),
            timeout_secs: config.timeout_secs,
            connect_timeout_secs: config.connect_timeout_secs,
        })
    }

    pub fn for_ollama(model_override: Option<String>) -> Self {
        let ollama_url = std::env::var("KEEL_OLLAMA_URL")
            .unwrap_or_else(|_| "http://localhost:11434".to_string());
        let base_url = format!("{}/v1", ollama_url.trim_end_matches('/'));
        let model = model_override.unwrap_or_else(|| {
            std::env::var("KEEL_OLLAMA_MODEL").unwrap_or_else(|_| "llama3.2".to_string())
        });
        Self {
            base_url,
            model,
            api_key: None,
            timeout_secs: std::env::var("KEEL_OLLAMA_TIMEOUT_SECS")
                .ok()
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(300),
            connect_timeout_secs: 10,
        }
    }
}

#[derive(Debug, Clone)]
pub(super) struct ToolCall {
    pub(super) id: String,
    pub(super) name: String,
    pub(super) arguments: Value,
}

#[derive(Debug, Serialize, Clone)]
pub struct AiToolCallLog {
    pub id: String,
    pub name: String,
    pub arguments: Value,
}

#[derive(Debug, Serialize, Clone)]
pub struct AiChatWithToolsResult {
    pub content: String,
    pub tool_calls: Vec<AiToolCallLog>,
}

pub async fn chat_with_tools(
    state: &AppState,
    user: &AuthedUser,
    config: LlmConfig,
    mut messages: Vec<Value>,
    response_format: Option<Value>,
    max_loops: usize,
    progress: Option<AiProgressSender>,
    mut cancel_rx: Option<watch::Receiver<bool>>,
    project_id: Option<&str>,
    force_include_admin: bool,
) -> Result<AiChatWithToolsResult, ApiError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(config.timeout_secs))
        .connect_timeout(Duration::from_secs(config.connect_timeout_secs))
        .build()
        .map_err(|_| ApiError::internal())?;

    let base = config.base_url.trim_end_matches('/');
    let endpoint = if base.ends_with("/v1") {
        format!("{}/chat/completions", base)
    } else {
        format!("{}/v1/chat/completions", base)
    };
    let tools = build_tool_definitions(user, project_id, force_include_admin);
    let mut tool_call_logs: Vec<AiToolCallLog> = Vec::new();

    for _ in 0..max_loops {
        if let Some(rx) = cancel_rx.as_ref() {
            if *rx.borrow() {
                return Err(ApiError::bad_request("request canceled"));
            }
        }
        let body = json!({
            "model": config.model,
            "messages": messages.clone(),
            "stream": false,
            "tools": tools.clone(),
            "tool_choice": "auto",
            "response_format": response_format.clone()
        });

        let mut req = client
            .post(&endpoint)
            .header("Accept", "application/json")
            .json(&body);
        if let Some(ref key) = config.api_key {
            if !key.is_empty() {
                req = req.bearer_auth(key);
            }
        }

        let mut send_fut = Box::pin(req.send());
        let res = match cancel_rx.as_mut() {
            Some(rx) => tokio::select! {
                r = &mut send_fut => r,
                _ = rx.changed() => {
                    return Err(ApiError::bad_request("request canceled"));
                }
            },
            None => send_fut.await,
        }
        .map_err(|_| ApiError::bad_request("failed to call llm provider"))?;

        if !res.status().is_success() {
            let status = res.status().as_u16();
            let body = res.text().await.unwrap_or_default();
            let msg = build_llm_error_message(status, &body);
            return Err(ApiError::bad_request(msg));
        }

        let raw: Value = res
            .json()
            .await
            .map_err(|_| ApiError::bad_request("invalid response from llm provider"))?;
        let choice = raw
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first());
        if let Some(progress) = progress.as_ref() {
            let reasoning = choice
                .and_then(|c0| {
                    c0.get("reasoning_content")
                        .and_then(|v| v.as_str())
                        .or_else(|| c0.get("reasoning").and_then(|v| v.as_str()))
                        .or_else(|| {
                            c0.get("message")
                                .and_then(|m| m.get("reasoning_content"))
                                .and_then(|v| v.as_str())
                        })
                        .or_else(|| {
                            c0.get("message")
                                .and_then(|m| m.get("reasoning"))
                                .and_then(|v| v.as_str())
                        })
                        .or_else(|| {
                            c0.get("message")
                                .and_then(|m| m.get("thinking"))
                                .and_then(|v| v.as_str())
                        })
                })
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(ToString::to_string);
            if let Some(text) = reasoning {
                let _ = progress.send(AiProgressEvent::LlmOutput { text }).await;
            }
        }
        let message = raw
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|c0| c0.get("message"))
            .cloned()
            .ok_or_else(|| ApiError::bad_request("llm provider returned empty content"))?;
        if let Some(progress) = progress.as_ref() {
            if let Some(content) = message.get("content").and_then(|c| c.as_str()) {
                if let Some(text) = extract_non_json_text(content) {
                    let _ = progress.send(AiProgressEvent::LlmOutput { text }).await;
                }
            }
        }

        let tool_calls = parse_tool_calls(&message);
        if tool_calls.is_empty() {
            let content = message
                .get("content")
                .and_then(|c| c.as_str())
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| ApiError::bad_request("llm provider returned empty content"))?;
            return Ok(AiChatWithToolsResult {
                content: content.to_string(),
                tool_calls: tool_call_logs,
            });
        }

        for call in &tool_calls {
            if let Some(progress) = progress.as_ref() {
                let _ = progress
                    .send(AiProgressEvent::ToolCall {
                        name: call.name.clone(),
                    })
                    .await;
            }
            tool_call_logs.push(AiToolCallLog {
                id: call.id.clone(),
                name: call.name.clone(),
                arguments: call.arguments.clone(),
            });
            tracing::info!(
                tool_name = %call.name,
                tool_arguments = %call.arguments,
                "AI tools: tool call"
            );
        }

        messages = append_tool_calls(messages, message, state, user, &tool_calls).await?;
    }

    Err(ApiError::bad_request("llm tool loop exceeded limit"))
}

/// Legacy wrapper for DeepSeek-only callers.
pub async fn deepseek_chat_with_tools(
    state: &AppState,
    user: &AuthedUser,
    api_key: &str,
    config: DeepseekConfig,
    messages: Vec<Value>,
    response_format: Option<Value>,
    max_loops: usize,
    progress: Option<AiProgressSender>,
    cancel_rx: Option<watch::Receiver<bool>>,
) -> Result<AiChatWithToolsResult, ApiError> {
    let llm_config = LlmConfig {
        base_url: config.base_url,
        model: config.model,
        api_key: Some(api_key.to_string()),
        timeout_secs: config.timeout_secs,
        connect_timeout_secs: config.connect_timeout_secs,
    };
    chat_with_tools(
        state,
        user,
        llm_config,
        messages,
        response_format,
        max_loops,
        progress,
        cancel_rx,
        None,
        false,
    )
    .await
}

#[cfg(test)]
mod tests;
