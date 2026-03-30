//! Adaptive Task Import: provider-agnostic import engines for external task tools.
//!
//! Each engine (Jira, Backlog, etc.) implements [ImportEngine] to provide:
//! - Connection verification
//! - Metadata fetching (projects, fields, statuses)
//! - Import execution (bulk task fetch and write to Rizm entities)

mod adf;
mod jira;

use crate::db::Db;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub use jira::JiraEngine;

#[cfg(test)]
mod tests;

/// Supported import providers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImportProvider {
    Jira,
    Backlog,
}

impl ImportProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            ImportProvider::Jira => "jira",
            ImportProvider::Backlog => "backlog",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.trim().to_lowercase().as_str() {
            "jira" => Some(ImportProvider::Jira),
            "backlog" => Some(ImportProvider::Backlog),
            _ => None,
        }
    }
}

/// Normalized metadata returned by engines for AI mapping proposal.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportMetadata {
    pub provider: String,
    pub projects: Vec<ImportProjectMeta>,
    pub fields: Vec<ImportFieldMeta>,
    pub statuses: Vec<ImportStatusMeta>,
    /// Issue type names for the selected project (e.g. ["Task", "Story", "Bug"]). Present when project_id_or_key was provided.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub issue_types: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProjectMeta {
    pub id: String,
    pub key: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFieldMeta {
    pub id: String,
    pub name: String,
    pub field_type: String,
    pub custom: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportStatusMeta {
    pub id: String,
    pub name: String,
    pub category: Option<String>,
}

/// Mapping configuration (AI proposal + user confirmation).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportMappingConfig {
    pub field_mappings: Vec<FieldMapping>,
    pub status_mappings: Vec<StatusMapping>,
    pub user_mappings: Option<Vec<UserMapping>>,
    pub excluded_statuses: Option<Vec<String>>,
    /// When set, issues in the board backlog (Agile API: not in any active/future sprint) get this status.
    /// Requires a Jira Software board for the project; uses GET /rest/agile/1.0/board/{id}/backlog.
    #[serde(default)]
    pub map_backlog_to_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldMapping {
    pub external_field_id: String,
    pub external_field_name: String,
    pub rizm_property: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusMapping {
    pub external_status_id: String,
    pub external_status_name: String,
    pub rizm_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserMapping {
    pub external_user_id: Option<String>,
    pub external_email: Option<String>,
    pub rizm_user_id: Option<String>,
}

/// Common interface for all import engines.
#[async_trait::async_trait]
pub trait ImportEngine: Send + Sync {
    fn provider(&self) -> ImportProvider;

    /// Verify connection and return basic info (e.g. server URL, user).
    async fn verify_connection(&self, connection_config: &Value) -> Result<(), ImportEngineError>;

    /// Fetch metadata (projects, fields, statuses) for mapping proposal.
    async fn fetch_metadata(
        &self,
        connection_config: &Value,
        project_id_or_key: Option<&str>,
    ) -> Result<ImportMetadata, ImportEngineError>;

    /// Run import: fetch tasks from external system and write to Rizm entities.
    /// Uses mapping_config to transform external data to Rizm schema.
    /// job_id: when present, engine may call db.set_import_job_progress(job_id, percent) to report progress.
    /// `db_path` resolves the on-disk attachments directory (same parent dir as the SQLite file).
    async fn run_import(
        &self,
        db: &Db,
        db_path: &str,
        connection_config: &Value,
        mapping_config: &ImportMappingConfig,
        target_project_id: &str,
        external_project_id_or_key: &str,
        job_id: Option<&str>,
    ) -> Result<ImportResult, ImportEngineError>;
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportResult {
    pub imported_count: u64,
    pub skipped_count: u64,
    pub error_count: u64,
}

#[derive(Debug, thiserror::Error)]
pub enum ImportEngineError {
    #[error("connection failed: {0}")]
    Connection(String),

    #[error("invalid config: {0}")]
    InvalidConfig(String),

    #[error("API error: {0}")]
    Api(String),

    #[error("parse error: {0}")]
    Parse(String),

    #[error("internal: {0}")]
    Internal(String),
}

/// Resolve engine by provider name.
pub fn get_engine(provider: ImportProvider) -> Box<dyn ImportEngine> {
    match provider {
        ImportProvider::Jira => Box::new(JiraEngine::new()),
        ImportProvider::Backlog => {
            // BacklogEngine not yet implemented
            unimplemented!("BacklogEngine is not yet implemented")
        }
    }
}
