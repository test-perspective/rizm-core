//! Run Jira import: fetch issues and write to Rizm entities.
//!
//! Submodules:
//!   - `progress`     : job-progress flush interval / decision helpers
//!   - `page_fetch`   : board / JQL pagination
//!   - `issue_import` : per-issue conversion + persistence

use std::collections::HashMap;

use serde_json::Value;

use crate::db::Db;
use crate::import::{ImportEngineError, ImportMappingConfig, ImportResult};

use super::board;
use super::client;

mod issue_import;
mod page_fetch;
mod progress;

use issue_import::{process_issue, IssueImportCtx, IssueOutcome};
use page_fetch::{fetch_next_page, merge_field_ids_with_attachment, PageCursor};
use progress::{jira_import_progress_flush_interval, jira_import_progress_should_flush};

pub async fn run_import(
    db: &Db,
    db_path: &str,
    connection_config: &Value,
    mapping_config: &ImportMappingConfig,
    target_project_id: &str,
    external_project_id_or_key: &str,
    job_id: Option<&str>,
) -> Result<ImportResult, ImportEngineError> {
    let field_ids: Vec<String> = mapping_config
        .field_mappings
        .iter()
        .map(|m| m.external_field_id.clone())
        .collect();
    let excluded_status_ids: std::collections::HashSet<String> = mapping_config
        .excluded_statuses
        .as_deref()
        .unwrap_or_default()
        .iter()
        .cloned()
        .collect();
    let status_map: HashMap<String, String> = mapping_config
        .status_mappings
        .iter()
        .map(|m| (m.external_status_id.clone(), m.rizm_status.clone()))
        .collect();

    let jql = format!("project = {}", external_project_id_or_key);
    let field_ids_for_fetch: Vec<String> = if field_ids.is_empty() {
        vec![
            "summary".to_string(),
            "description".to_string(),
            "status".to_string(),
        ]
    } else {
        field_ids
    };
    let board_id = board::fetch_board_id(connection_config, external_project_id_or_key).await;
    let backlog_issue_keys: std::collections::HashSet<String> = if mapping_config
        .map_backlog_to_status
        .as_ref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
        && board_id.is_some()
    {
        if let Some(ref bid) = board_id {
            board::fetch_backlog_issue_keys(connection_config, bid).await
        } else {
            std::collections::HashSet::new()
        }
    } else {
        std::collections::HashSet::new()
    };
    let field_ids_merged = merge_field_ids_with_attachment(&field_ids_for_fetch);
    let fields_json = serde_json::to_value(&field_ids_merged).unwrap_or(serde_json::json!([]));
    let field_ids_vec: Vec<String> = serde_json::from_value(fields_json.clone()).unwrap_or_else(|_| {
        vec![
            "summary".to_string(),
            "description".to_string(),
            "status".to_string(),
        ]
    });

    let mut cursor = PageCursor::new();
    let mut imported = 0u64;
    let mut skipped = 0u64;
    let mut errors = 0u64;
    let mut total_issues: i64 = 0;
    let mut processed_count: i64 = 0;
    let mut board_order: i64 = 0;
    let progress_flush_every = jira_import_progress_flush_interval();
    let mut last_progress_flushed_partial: i64 = 0;

    let count_res = client::request(
        connection_config,
        "POST",
        &format!("{}/search/approximate-count", client::jira_api_path()),
        Some(serde_json::json!({ "jql": jql })),
    )
    .await;
    if let Ok(cr) = count_res {
        total_issues = cr.get("total").and_then(|v| v.as_i64()).unwrap_or(0);
    }

    let use_board_order = board_id.is_some();

    let issue_ctx = IssueImportCtx {
        db,
        db_path,
        connection_config,
        mapping_config,
        target_project_id,
        excluded_status_ids: &excluded_status_ids,
        status_map: &status_map,
        backlog_issue_keys: &backlog_issue_keys,
        use_board_order,
    };

    loop {
        let page = fetch_next_page(
            connection_config,
            &jql,
            &field_ids_vec,
            &fields_json,
            board_id.as_ref(),
            &mut cursor,
        )
        .await?;
        if total_issues == 0 {
            if let Some(pt) = page.page_total {
                total_issues = pt;
            }
        }

        let issues_len = page.issues.len();
        if issues_len == 0 {
            break;
        }

        for (idx, issue) in page.issues.iter().enumerate() {
            let partial_done = processed_count + (idx as i64) + 1;
            let end_of_page = (idx + 1) == issues_len;
            if let Some(jid) = job_id {
                if total_issues > 0
                    && jira_import_progress_should_flush(
                        partial_done,
                        last_progress_flushed_partial,
                        total_issues,
                        progress_flush_every,
                        end_of_page,
                    )
                {
                    let p = ((partial_done as f64 / total_issues as f64) * 100.0).min(99.0) as i64;
                    let _ = db.set_import_job_progress_detailed(
                        jid,
                        p,
                        partial_done,
                        Some(total_issues),
                    );
                    last_progress_flushed_partial = partial_done;
                }
            }

            match process_issue(&issue_ctx, issue, &mut board_order).await? {
                IssueOutcome::Imported => imported += 1,
                IssueOutcome::Skipped => skipped += 1,
                IssueOutcome::Errored => errors += 1,
                IssueOutcome::NoExternalId => {}
            }
        }

        processed_count += issues_len as i64;
        if !page.has_more {
            break;
        }
    }

    Ok(ImportResult {
        imported_count: imported,
        skipped_count: skipped,
        error_count: errors,
    })
}
