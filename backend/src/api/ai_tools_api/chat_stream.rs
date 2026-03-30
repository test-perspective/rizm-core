use axum::{
    body::Body,
    extract::State,
    http::header,
    response::Response,
    Extension, Json,
};
use bytes::Bytes;
use std::convert::Infallible;
use std::time::Instant;
use tokio::sync::{mpsc, watch};
use tokio_stream::wrappers::ReceiverStream;
use tokio_stream::StreamExt;

use crate::ai_progress::{AiProgressEvent, AiProgressSender};
use crate::ai_tools::chat_with_tools;
use crate::app_state::AppState;
use crate::auth::AuthedUser;
use crate::time;
use crate::ApiError;

use super::support::{build_ai_audit_meta_json, build_chat_system_prompt, build_history_messages};
use super::resolve_llm_config_chat;
use super::ChatRequest;

pub(super) async fn chat_with_tools_stream(
    State(state): State<AppState>,
    Extension(user): Extension<AuthedUser>,
    Json(req): Json<ChatRequest>,
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
                message: "Starting AI assistant".to_string(),
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
        let config = match resolve_llm_config_chat(&req) {
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

        let db = state.db.read().await;
        let effective_project_id: Option<String> = req
            .project_id
            .as_ref()
            .filter(|s| !s.trim().is_empty())
            .cloned()
            .or_else(|| db.get_active_project_id_for_user(&user.user_id).ok().flatten());
        let project_key: Option<String> = effective_project_id
            .as_ref()
            .and_then(|pid| db.get_project_key_by_id(pid).ok().flatten());
        drop(db);

        let system_prompt = build_chat_system_prompt(
            effective_project_id.as_deref(),
            project_key.as_deref(),
            Some(&user),
        );
        let mut messages = vec![serde_json::json!({ "role": "system", "content": system_prompt })];
        messages.extend(build_history_messages(&req.history));
        messages.push(serde_json::json!({ "role": "user", "content": req.input.trim() }));

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
            None,
            15,
            Some(progress.clone()),
            Some(cancel_rx.clone()),
            effective_project_id.as_deref(),
            false,
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

        let content = result.content;
        let elapsed_ms = started.elapsed().as_millis();
        let result_value = serde_json::Value::String(content.clone());
        let meta_json = build_ai_audit_meta_json(
            "chat-tools-stream",
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

        let _ = progress
            .send(AiProgressEvent::ChatResult {
                message: content,
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
