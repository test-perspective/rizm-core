use axum::Extension;
use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Instant;

use crate::ai_common::{extract_json_value, normalize_manifest, validate_manifest};
use crate::ai_tools::{
    chat_with_tools as llm_chat_with_tools, resolve_deepseek_api_key, LlmConfig,
};
use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::models::ProjectManifest;
use crate::time;
use crate::ApiError;
use chat_stream::chat_with_tools_stream;
use stream::transform_manifest_with_tools_stream;
use support::{
    build_ai_audit_meta_json, build_chat_system_prompt, build_history_messages,
    build_transform_system_prompt, build_transform_user_prompt,
};
use transform_conversation_stream::transform_conversation_stream;

mod chat_stream;
mod stream;
mod support;
mod transform_conversation_stream;

async fn openrouter_models() -> Result<Json<serde_json::Value>, ApiError> {
    let base = std::env::var("KEEL_OPENROUTER_BASE_URL")
        .unwrap_or_else(|_| "https://openrouter.ai/api/v1".to_string());
    let url = format!(
        "{}/models?supported_parameters=tools",
        base.trim_end_matches('/')
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|_| ApiError::internal())?;
    let res = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|_| ApiError::bad_request("failed to fetch Open Router models"))?;
    if !res.status().is_success() {
        return Err(ApiError::bad_request(
            "Open Router models API returned non-200",
        ));
    }
    let data: serde_json::Value = res
        .json()
        .await
        .map_err(|_| ApiError::bad_request("invalid JSON from Open Router models"))?;
    Ok(Json(data))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TransformToolsRequest {
    input: String,
    #[serde(default)]
    current_manifest: Option<ProjectManifest>,
    #[serde(default)]
    deepseek_api_key: Option<String>,
    #[serde(default)]
    project_id: Option<String>,
    #[serde(default)]
    history: Vec<ChatHistoryMessage>,
    /// Provider: "openrouter" | "deepseek" | "ollama". Default: "deepseek" for backward compat.
    #[serde(default)]
    provider: Option<String>,
    /// Model ID (for openrouter: e.g. "openai/gpt-4o", for ollama: e.g. "llama3.2").
    #[serde(default)]
    model: Option<String>,
    /// API key for Open Router (user-provided, no server fallback).
    #[serde(default)]
    openrouter_api_key: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TransformResponse {
    manifest: ProjectManifest,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ChatRequest {
    input: String,
    #[serde(default)]
    deepseek_api_key: Option<String>,
    #[serde(default)]
    project_id: Option<String>,
    #[serde(default)]
    history: Vec<ChatHistoryMessage>,
    #[serde(default)]
    provider: Option<String>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    openrouter_api_key: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ChatHistoryMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TransformConversationRequest {
    input: String,
    #[serde(default)]
    current_manifest: Option<ProjectManifest>,
    #[serde(default)]
    deepseek_api_key: Option<String>,
    #[serde(default)]
    project_id: Option<String>,
    #[serde(default)]
    history: Vec<ChatHistoryMessage>,
    #[serde(default)]
    provider: Option<String>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    openrouter_api_key: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatResponse {
    message: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/ai/openrouter-models", get(openrouter_models))
        .route(
            "/api/ai/transform-tools",
            post(transform_manifest_with_tools),
        )
        .route(
            "/api/ai/transform-tools-stream",
            post(transform_manifest_with_tools_stream),
        )
        .route(
            "/api/ai/transform-conversation-stream",
            post(transform_conversation_stream),
        )
        .route("/api/ai/chat", post(chat_with_tools))
        .route("/api/ai/chat-stream", post(chat_with_tools_stream))
}

pub(super) fn resolve_llm_config(req: &TransformToolsRequest) -> Result<LlmConfig, ApiError> {
    resolve_llm_config_from(
        req.provider.as_deref(),
        req.model.as_deref(),
        req.deepseek_api_key.as_deref(),
        req.openrouter_api_key.as_deref(),
    )
}

async fn transform_manifest_with_tools(
    State(state): State<AppState>,
    Extension(user): Extension<AuthedUser>,
    Json(req): Json<TransformToolsRequest>,
) -> Result<Json<TransformResponse>, ApiError> {
    let started = Instant::now();
    if req.input.trim().is_empty() {
        return Err(ApiError::bad_request("input is required"));
    }

    let config = resolve_llm_config(&req)?;

    let system_prompt = build_transform_system_prompt();
    let user_prompt = build_transform_user_prompt(
        req.input.trim(),
        req.project_id.as_deref(),
        req.current_manifest.as_ref(),
    );

    let mut messages = vec![json!({ "role": "system", "content": system_prompt })];
    messages.extend(build_history_messages(&req.history));
    messages.push(json!({ "role": "user", "content": user_prompt }));

    let result = llm_chat_with_tools(
        &state,
        &user,
        config.clone(),
        messages,
        Some(json!({ "type": "json_object" })),
        15,
        None,
        None,
        req.project_id.as_deref(),
        true,
    )
    .await?;
    let content = result.content;

    let parsed = extract_json_value(&content).map_err(ApiError::bad_request)?;
    let manifest_value = parsed
        .get("manifest")
        .cloned()
        .unwrap_or_else(|| parsed.clone());
    let mut manifest: ProjectManifest = serde_json::from_value(manifest_value)
        .map_err(|_| ApiError::bad_request("model output does not match ProjectManifest shape"))?;

    let llm_scm = parsed
        .get("scmConfig")
        .and_then(|v| v.as_object())
        .and_then(|o| {
            let ws = o.get("workspace").and_then(|v| v.as_str()).map(str::trim);
            let slug = o.get("repoSlug").and_then(|v| v.as_str()).map(str::trim);
            match (ws, slug) {
                (Some(w), Some(s)) if !w.is_empty() && !s.is_empty() => {
                    Some(crate::ai_progress::ScmConfigResult {
                        workspace: w.to_string(),
                        repo_slug: s.to_string(),
                    })
                }
                _ => None,
            }
        });

    let history_refs: Vec<&str> = req.history.iter().map(|m| m.content.as_str()).collect();
    let combined =
        crate::ai_scm_from_text::combine_transform_text_for_scm(req.input.trim(), &history_refs);
    let _scm_config = crate::ai_scm_from_text::apply_bitbucket_scm_from_conversation_text(
        &mut manifest,
        &combined,
        llm_scm,
    );

    let manifest = normalize_manifest(manifest);
    validate_manifest(&manifest).map_err(ApiError::bad_request)?;

    let elapsed_ms = started.elapsed().as_millis();
    let result_value = json!({ "name": manifest.name });
    let meta_json = build_ai_audit_meta_json(
        "transform-tools",
        &config.model,
        req.input.trim(),
        result_value.clone(),
        &result.tool_calls,
        req.project_id.as_deref(),
        elapsed_ms,
    );
    let _ = (state.db.read().await).insert_audit_log(
        Some(&user.user_id),
        "AI_TRANSFORM_TOOLS",
        None,
        Some(&meta_json),
        time::now_ms(),
    );
    tracing::info!(
        prompt = %req.input.trim(),
        "AI tools: prompt"
    );
    tracing::info!(
        result = %result_value,
        "AI tools: result"
    );
    if !result.tool_calls.is_empty() {
        tracing::info!(
            tool_calls = %json!(result.tool_calls),
            "AI tools: tool calls"
        );
    }

    Ok(Json(TransformResponse { manifest }))
}

pub(super) fn resolve_llm_config_chat(req: &ChatRequest) -> Result<LlmConfig, ApiError> {
    resolve_llm_config_from(
        req.provider.as_deref(),
        req.model.as_deref(),
        req.deepseek_api_key.as_deref(),
        req.openrouter_api_key.as_deref(),
    )
}

pub(super) fn resolve_llm_config_conversation(
    req: &TransformConversationRequest,
) -> Result<LlmConfig, ApiError> {
    resolve_llm_config_from(
        req.provider.as_deref(),
        req.model.as_deref(),
        req.deepseek_api_key.as_deref(),
        req.openrouter_api_key.as_deref(),
    )
}

fn resolve_llm_config_from(
    provider: Option<&str>,
    model: Option<&str>,
    deepseek_api_key: Option<&str>,
    openrouter_api_key: Option<&str>,
) -> Result<LlmConfig, ApiError> {
    let provider = provider.unwrap_or("deepseek").trim().to_lowercase();
    match provider.as_str() {
        "openrouter" => {
            let model = model
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(String::from)
                .ok_or_else(|| ApiError::bad_request("model is required for Open Router"))?;
            let api_key = openrouter_api_key
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| {
                    ApiError::bad_request("Open Router API key is required (set in LLM settings)")
                })?;
            LlmConfig::for_openrouter(model, api_key.to_string())
        }
        "ollama" => Ok(LlmConfig::for_ollama(model.map(String::from))),
        _ => {
            let api_key = resolve_deepseek_api_key(deepseek_api_key)?;
            LlmConfig::for_deepseek(api_key, model.map(String::from))
        }
    }
}

async fn chat_with_tools(
    State(state): State<AppState>,
    Extension(user): Extension<AuthedUser>,
    Json(req): Json<ChatRequest>,
) -> Result<Json<ChatResponse>, ApiError> {
    let started = Instant::now();
    if req.input.trim().is_empty() {
        return Err(ApiError::bad_request("input is required"));
    }

    let config = resolve_llm_config_chat(&req)?;

    let db = state.db.read().await;
    let effective_project_id: Option<String> = req
        .project_id
        .as_ref()
        .filter(|s| !s.trim().is_empty())
        .cloned()
        .or_else(|| {
            db.get_active_project_id_for_user(&user.user_id)
                .ok()
                .flatten()
        });
    let project_key: Option<String> = effective_project_id
        .as_ref()
        .and_then(|pid| db.get_project_key_by_id(pid).ok().flatten());
    drop(db);

    let system_prompt = build_chat_system_prompt(
        effective_project_id.as_deref(),
        project_key.as_deref(),
        Some(&user),
    );
    let mut messages = vec![json!({ "role": "system", "content": system_prompt })];
    messages.extend(build_history_messages(&req.history));
    messages.push(json!({ "role": "user", "content": req.input.trim() }));

    let result = llm_chat_with_tools(
        &state,
        &user,
        config.clone(),
        messages,
        None,
        15,
        None,
        None,
        effective_project_id.as_deref(),
        false,
    )
    .await?;
    let content = result.content;

    let elapsed_ms = started.elapsed().as_millis();
    let result_value = Value::String(content.clone());
    let meta_json = build_ai_audit_meta_json(
        "chat-tools",
        &config.model,
        req.input.trim(),
        result_value.clone(),
        &result.tool_calls,
        effective_project_id.as_deref(),
        elapsed_ms,
    );
    let _ = (state.db.read().await).insert_audit_log(
        Some(&user.user_id),
        "AI_CHAT_TOOLS",
        None,
        Some(&meta_json),
        time::now_ms(),
    );
    tracing::info!(
        prompt = %req.input.trim(),
        "AI tools: prompt"
    );
    tracing::info!(
        result = %result_value,
        "AI tools: result"
    );
    if !result.tool_calls.is_empty() {
        tracing::info!(
            tool_calls = %json!(result.tool_calls),
            "AI tools: tool calls"
        );
    }

    Ok(Json(ChatResponse { message: content }))
}
