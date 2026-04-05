//! Jira import engine: fetches projects, fields, statuses, comments and issues from Jira Cloud REST API v3.

/// Max issues (or comments) per Jira REST page. Cloud allows up to 100 for search/board/comment pagination.
pub(crate) const JIRA_ISSUE_PAGE_SIZE: i64 = 100;

mod attachment_import;
mod backfill;
mod board;
mod client;
mod comments;
mod import_run;
mod metadata;
mod transform;

use serde_json::Value;

use crate::db::Db;

pub use backfill::compute_jira_markdown_backfill_patch;

use super::{
    ImportEngine, ImportEngineError, ImportMappingConfig, ImportMetadata, ImportProvider,
    ImportResult,
};

#[derive(Debug, Default)]
pub struct JiraEngine;

impl JiraEngine {
    pub fn new() -> Self {
        Self::default()
    }
}

#[async_trait::async_trait]
impl ImportEngine for JiraEngine {
    fn provider(&self) -> ImportProvider {
        ImportProvider::Jira
    }

    async fn verify_connection(&self, connection_config: &Value) -> Result<(), ImportEngineError> {
        let _ = client::base_url(connection_config)?;
        let _ = client::auth_header(connection_config)?;
        let res = client::request(
            connection_config,
            "GET",
            &format!("{}/myself", client::jira_api_path()),
            None,
        )
        .await?;
        if res.get("active").and_then(|v| v.as_bool()).unwrap_or(false) {
            Ok(())
        } else if res.is_object() && res.get("key").is_some() {
            Ok(())
        } else {
            Err(ImportEngineError::Connection(
                "Jira /myself returned unexpected response".to_string(),
            ))
        }
    }

    async fn fetch_metadata(
        &self,
        connection_config: &Value,
        project_id_or_key: Option<&str>,
    ) -> Result<ImportMetadata, ImportEngineError> {
        metadata::fetch_metadata(connection_config, project_id_or_key).await
    }

    async fn run_import(
        &self,
        db: &Db,
        db_path: &str,
        connection_config: &Value,
        mapping_config: &ImportMappingConfig,
        target_project_id: &str,
        external_project_id_or_key: &str,
        job_id: Option<&str>,
    ) -> Result<ImportResult, ImportEngineError> {
        import_run::run_import(
            db,
            db_path,
            connection_config,
            mapping_config,
            target_project_id,
            external_project_id_or_key,
            job_id,
        )
        .await
    }
}
