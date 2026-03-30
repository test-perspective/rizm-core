pub mod db;
pub mod defaults;
pub mod import;
pub mod models;
pub mod projection;
pub mod time;
pub mod app_state;
pub mod service_gate;
pub mod auth;
pub mod admin;
pub mod ai_common;
pub mod ai_scm_from_text;
pub mod ai_progress;
pub mod ai_tools;
pub mod manifest_history;
pub mod task_key;
pub mod mcp;
pub mod mcp_api_key;
pub mod mcp_http;
pub mod permissions;
pub mod search;
pub mod api;
pub mod infra;

pub use crate::api::error::ApiError;

