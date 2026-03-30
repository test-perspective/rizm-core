use axum::{
    body::Body,
    extract::State,
    http::header,
    response::Response,
    Extension, Json,
};
use bytes::Bytes;
use serde_json::json;
use std::convert::Infallible;
use std::time::Instant;
use tokio::sync::{mpsc, watch};
use tokio_stream::wrappers::ReceiverStream;
use tokio_stream::StreamExt;

use crate::ai_common::{extract_json_value, extract_reasoning_text_from_json, normalize_manifest, validate_manifest};
use crate::ai_progress::{AiProgressEvent, AiProgressSender};
use crate::ai_tools::chat_with_tools;
use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::models::ProjectManifest;
use crate::time;
use crate::ApiError;

use super::{
    build_ai_audit_meta_json, build_history_messages, build_transform_system_prompt, build_transform_user_prompt,
    resolve_llm_config, TransformToolsRequest,
};

pub(super) async fn transform_manifest_with_tools_stream(
    State(state): State<AppState>,
    Extension(user): Extension<AuthedUser>,
    Json(req): Json<TransformToolsRequest>,
) -> Result<Response, ApiError> {
    let (tx, rx) = mpsc::channel::<String>(64);
    let (cancel_tx, cancel_rx) = watch::channel(false);
    let progress = AiProgressSender::new(tx.clone());
    let state = state.clone();
    let req = req;

    tokio::spawn(async move {
        tx.closed().await;
        let _ = cancel_tx.send(true);
    });

    tokio::spawn(async move {
        if progress
            .send(AiProgressEvent::Phase {
                message: "Starting AI transform with tools".to_string(),
            })
            .await
            .is_err()
        {
            return;
        }
        if req.input.trim().is_empty() {
            let _ = progress
                .send(AiProgressEvent::Error {
                    message: "input is required".to_string(),
                })
                .await;
            return;
        }

        let started = Instant::now();
        let config = match resolve_llm_config(&req) {
            Ok(v) => v,
            Err(err) => {
                let _ = progress
                    .send(AiProgressEvent::Error {
                        message: err.message,
                    })
                    .await;
                return;
            }
        };

        let system_prompt = build_transform_system_prompt();
        let user_prompt = build_transform_user_prompt(
            req.input.trim(),
            req.project_id.as_deref(),
            req.current_manifest.as_ref(),
        );

        let mut messages = vec![json!({ "role": "system", "content": system_prompt })];
        messages.extend(build_history_messages(&req.history));
        messages.push(json!({ "role": "user", "content": user_prompt }));

        let _ = progress
            .send(AiProgressEvent::Phase {
                message: "Sending request".to_string(),
            })
            .await;

        let result = match chat_with_tools(
            &state,
            &user,
            config.clone(),
            messages,
            Some(json!({ "type": "json_object" })),
            15,
            Some(progress.clone()),
            Some(cancel_rx.clone()),
            req.project_id.as_deref(),
            true,
        )
        .await
        {
            Ok(v) => v,
            Err(err) => {
                let _ = progress
                    .send(AiProgressEvent::Error {
                        message: err.message,
                    })
                    .await;
                return;
            }
        };

        let _ = progress
            .send(AiProgressEvent::Phase {
                message: "Parsing manifest".to_string(),
            })
            .await;

        let parsed = match extract_json_value(&result.content) {
            Ok(v) => v,
            Err(msg) => {
                let _ = progress
                    .send(AiProgressEvent::Error { message: msg.to_string() })
                    .await;
                return;
            }
        };
        if let Some(reasoning) = extract_reasoning_text_from_json(&parsed) {
            let _ = progress.send(AiProgressEvent::LlmOutput { text: reasoning }).await;
        }
        let manifest_value = parsed.get("manifest").cloned().unwrap_or_else(|| parsed.clone());
        let mut manifest: ProjectManifest = match serde_json::from_value(manifest_value) {
            Ok(v) => v,
            Err(_) => {
                let _ = progress
                    .send(AiProgressEvent::Error {
                        message: "model output does not match ProjectManifest shape".to_string(),
                    })
                    .await;
                return;
            }
        };

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
        let combined = crate::ai_scm_from_text::combine_transform_text_for_scm(req.input.trim(), &history_refs);
        let scm_config = crate::ai_scm_from_text::apply_bitbucket_scm_from_conversation_text(
            &mut manifest,
            &combined,
            llm_scm,
        );

        let manifest = normalize_manifest(manifest);
        if let Err(msg) = validate_manifest(&manifest) {
            let _ = progress.send(AiProgressEvent::Error { message: msg }).await;
            return;
        }

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

        let _ = progress
            .send(AiProgressEvent::Result {
                manifest,
                scm_config,
            })
            .await;
    });

    let stream = ReceiverStream::new(rx).map(|line| Ok::<Bytes, Infallible>(Bytes::from(line)));
    let body = Body::from_stream(stream);
    let mut response = Response::new(body);
    let headers = response.headers_mut();
    headers.insert(header::CONTENT_TYPE, header::HeaderValue::from_static("application/x-ndjson"));
    headers.insert(header::CACHE_CONTROL, header::HeaderValue::from_static("no-cache"));
    headers.insert(
        header::HeaderName::from_static("x-accel-buffering"),
        header::HeaderValue::from_static("no"),
    );
    Ok(response)
}
