//! Run Jira import: fetch issues and write to Rizm entities.

use std::collections::HashMap;

use serde_json::{Map, Value};

use crate::api::attachments_api::AttachmentMeta;
use crate::db::Db;
use crate::import::adf::{
    adf_to_blocknote_doc_with_context, classify_jira_description_value, jira_wiki_text_to_blocknote_doc,
    maybe_reparse_blocknote_from_flat_markdown, maybe_reparse_blocknote_wrapped_markdown, AdfImportContext,
    JiraDescriptionKind,
};

use super::attachment_import;
use super::board;
use super::client;
use super::comments;
use super::JIRA_ISSUE_PAGE_SIZE;
use super::super::{ImportEngineError, ImportMappingConfig, ImportResult};
use super::transform;

/// Adds `attachment` to requested fields when missing so issues include attachment metadata.
fn merge_field_ids_with_attachment(field_ids: &[String]) -> Vec<String> {
    let mut out = field_ids.to_vec();
    if !out.iter().any(|s| s == "attachment") {
        out.push("attachment".to_string());
    }
    out
}

/// How often to persist import job progress (SQLite). Higher = faster bulk import; `1` = every issue (debug).
fn jira_import_progress_flush_interval() -> i64 {
    const DEFAULT: i64 = 20;
    match std::env::var("KEEL_JIRA_IMPORT_PROGRESS_INTERVAL") {
        Ok(s) => s.parse::<i64>().unwrap_or(DEFAULT).max(1),
        Err(_) => DEFAULT,
    }
}

fn jira_import_progress_should_flush(
    partial_done: i64,
    last_flushed_partial: i64,
    total_issues: i64,
    interval: i64,
    end_of_fetched_page: bool,
) -> bool {
    if total_issues <= 0 {
        return false;
    }
    if interval <= 1 {
        return true;
    }
    if partial_done >= total_issues {
        return true;
    }
    if last_flushed_partial == 0 {
        return true;
    }
    if partial_done - last_flushed_partial >= interval {
        return true;
    }
    end_of_fetched_page
}

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
    let mut next_page_token: Option<String> = None;
    let mut board_start_at: i64 = 0;
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

    loop {
        let use_board_order = board_id.is_some();
        let (issues, has_more) = if let Some(ref bid) = board_id {
            let (issues, page_total, next) = board::fetch_board_issues_page(
                connection_config,
                bid,
                &jql,
                &field_ids_vec,
                board_start_at,
            )
            .await?;
            if total_issues == 0 {
                total_issues = page_total;
            }
            board_start_at = next.unwrap_or(-1);
            let has_more = next.is_some();
            (issues, has_more)
        } else {
            let mut body = serde_json::json!({
                "jql": jql,
                "maxResults": JIRA_ISSUE_PAGE_SIZE,
                "fields": fields_json,
            });
            if let Some(ref token) = next_page_token {
                body["nextPageToken"] = serde_json::json!(token);
            }
            let res = client::request(
                connection_config,
                "POST",
                &format!("{}/search/jql", client::jira_api_path()),
                Some(body),
            )
            .await?;
            let issues = res
                .get("issues")
                .or_else(|| res.get("values"))
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            if total_issues == 0 {
                total_issues = res.get("total").and_then(|v| v.as_i64()).unwrap_or(0);
            }
            next_page_token = res
                .get("nextPageToken")
                .and_then(|v| v.as_str())
                .map(String::from);
            (issues, next_page_token.is_some())
        };

        let issues_len = issues.len();
        if issues_len == 0 {
            break;
        }

        for (idx, issue) in issues.iter().enumerate() {
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

            let external_id = issue
                .get("id")
                .map(|v| {
                    v.as_str()
                        .map(|s| s.to_string())
                        .or_else(|| v.as_i64().map(|n| n.to_string()))
                        .unwrap_or_default()
                })
                .unwrap_or_default();
            let key = issue
                .get("key")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            if external_id.is_empty() {
                continue;
            }

            if db
                .get_entity_id_by_external(target_project_id, "jira", &external_id)
                .map_err(|e| ImportEngineError::Internal(e.to_string()))?
                .is_some()
            {
                skipped += 1;
                if use_board_order {
                    board_order += 1;
                }
                continue;
            }

            let fields = issue
                .get("fields")
                .and_then(|v| v.as_object())
                .cloned()
                .unwrap_or_default();
            let status_id = fields
                .get("status")
                .and_then(|s| s.get("id"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            if let Some(ref sid) = status_id {
                if excluded_status_ids.contains(sid) {
                    skipped += 1;
                    if use_board_order {
                        board_order += 1;
                    }
                    continue;
                }
            }

            let (metas, id_map) = match attachment_import::download_issue_attachments(
                connection_config,
                db_path,
                target_project_id,
                fields.get("attachment"),
            )
            .await
            {
                Ok(x) => x,
                Err(e) => {
                    tracing::warn!(error = %e, "jira import: attachment download failed for issue");
                    (vec![], HashMap::new())
                }
            };

            let mut rizm_meta_by_id: HashMap<String, AttachmentMeta> = HashMap::new();
            for m in &metas {
                rizm_meta_by_id.insert(m.id.clone(), m.clone());
            }

            let mut description_kind: Option<JiraDescriptionKind> = None;
            for fm in &mapping_config.field_mappings {
                if fm.rizm_property == "Description" {
                    description_kind = classify_jira_description_value(fields.get(&fm.external_field_id));
                    break;
                }
            }

            let mut properties: Map<String, Value> = Map::new();
            if let Some(ref k) = key {
                properties.insert("taskKey".to_string(), Value::String(k.clone()));
            }
            let is_backlog = key
                .as_ref()
                .map(|k| backlog_issue_keys.contains(k))
                .unwrap_or(false);
            let backlog_status = mapping_config
                .map_backlog_to_status
                .as_ref()
                .and_then(|s| {
                    if s.trim().is_empty() {
                        None
                    } else {
                        Some(s.trim().to_string())
                    }
                });

            for fm in &mapping_config.field_mappings {
                if fm.rizm_property.trim().is_empty() {
                    continue;
                }
                if fm.rizm_property == "Description" {
                    match classify_jira_description_value(fields.get(&fm.external_field_id)) {
                        Some(JiraDescriptionKind::Adf(_)) | Some(JiraDescriptionKind::LegacyWiki(_)) => {
                            continue;
                        }
                        None => {}
                    }
                }
                let raw = fields.get(&fm.external_field_id);
                let val = if fm.external_field_id == "assignee" && fm.rizm_property == "assigneeId" {
                    transform::resolve_assignee_by_email(db, raw)
                } else if fm.rizm_property == "status" && is_backlog && backlog_status.is_some() {
                    backlog_status.clone().map(Value::String)
                } else {
                    transform::extract_field_value(raw, &fm.external_field_id, &status_map)
                };
                if let Some(v) = val {
                    properties.insert(fm.rizm_property.clone(), v);
                }
            }

            if use_board_order {
                properties.insert(
                    "__keelOrder".to_string(),
                    Value::Number(serde_json::Number::from(board_order * 1000)),
                );
                board_order += 1;
            }

            match db.create_entity_for_project(
                target_project_id,
                None,
                "task",
                properties,
            ) {
                Ok(entity) => {
                    if db
                        .upsert_entity_external_id(
                            target_project_id,
                            &entity.id,
                            "jira",
                            &external_id,
                            key.as_deref(),
                        )
                        .is_err()
                    {
                        errors += 1;
                        continue;
                    }

                    let adf_ctx = AdfImportContext {
                        project_id: target_project_id.to_string(),
                        entity_pk: entity.id.clone(),
                        jira_to_rizm: id_map,
                        rizm_meta_by_id,
                    };

                    let description_blocknote: Option<String> = match &description_kind {
                        Some(JiraDescriptionKind::Adf(v)) => {
                            adf_to_blocknote_doc_with_context(v, Some(&adf_ctx))
                        }
                        Some(JiraDescriptionKind::LegacyWiki(s)) => {
                            jira_wiki_text_to_blocknote_doc(s, &adf_ctx)
                        }
                        None => None,
                    }
                    .map(|doc| {
                        maybe_reparse_blocknote_wrapped_markdown(&doc, Some(&adf_ctx))
                            .or_else(|| maybe_reparse_blocknote_from_flat_markdown(&doc, Some(&adf_ctx)))
                            .unwrap_or(doc)
                    });

                    let comments = if let Some(ref issue_key) = key {
                        comments::fetch_comments(db, connection_config, issue_key, Some(&adf_ctx)).await
                    } else {
                        vec![]
                    };

                    let mut patch = Map::new();
                    if let Some(doc) = description_blocknote {
                        patch.insert("Description".to_string(), Value::String(doc));
                    }
                    if !comments.is_empty() {
                        patch.insert("comments".to_string(), Value::Array(comments));
                    }
                    if !metas.is_empty() {
                        patch.insert(
                            "attachments".to_string(),
                            serde_json::to_value(&metas).unwrap_or(Value::Array(vec![])),
                        );
                    }

                    if !patch.is_empty() {
                        if db
                            .patch_entity_for_project(
                                target_project_id,
                                &entity.id,
                                entity.updated_at,
                                patch,
                            )
                            .is_err()
                        {
                            errors += 1;
                        }
                    }

                    imported += 1;
                }
                Err(_) => errors += 1,
            }
        }

        processed_count += issues_len as i64;
        if issues_len == 0 || !has_more {
            break;
        }
    }

    Ok(ImportResult {
        imported_count: imported,
        skipped_count: skipped,
        error_count: errors,
    })
}

#[cfg(test)]
mod progress_flush_tests {
    use super::jira_import_progress_should_flush;

    #[test]
    fn flush_interval_one_always_when_total_positive() {
        assert!(jira_import_progress_should_flush(1, 0, 10, 1, false));
        assert!(jira_import_progress_should_flush(5, 4, 10, 1, false));
    }

    #[test]
    fn flush_first_and_every_interval() {
        assert!(jira_import_progress_should_flush(1, 0, 100, 25, false));
        assert!(!jira_import_progress_should_flush(10, 1, 100, 25, false));
        assert!(jira_import_progress_should_flush(26, 1, 100, 25, false));
    }

    #[test]
    fn flush_end_of_page_even_if_below_interval() {
        assert!(!jira_import_progress_should_flush(99, 76, 1000, 25, false));
        assert!(jira_import_progress_should_flush(100, 76, 1000, 25, true));
    }

    #[test]
    fn flush_when_reached_total() {
        assert!(jira_import_progress_should_flush(1000, 990, 1000, 25, false));
    }

    #[test]
    fn no_flush_when_total_unknown() {
        assert!(!jira_import_progress_should_flush(1, 0, 0, 25, true));
    }
}
