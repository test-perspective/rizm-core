use std::collections::{HashMap, HashSet};

use serde_json::{Map, Value};

use crate::api::attachments_api::AttachmentMeta;
use crate::db::Db;
use crate::import::adf::{
    adf_to_blocknote_doc_with_context, classify_jira_description_value,
    jira_wiki_text_to_blocknote_doc, maybe_reparse_blocknote_from_flat_markdown,
    maybe_reparse_blocknote_wrapped_markdown, AdfImportContext, JiraDescriptionKind,
};
use crate::import::ImportEngineError;
use crate::import::ImportMappingConfig;

use crate::import::jira::attachment_import;
use crate::import::jira::comments;
use crate::import::jira::transform;

pub(super) struct IssueImportCtx<'a> {
    pub db: &'a Db,
    pub db_path: &'a str,
    pub connection_config: &'a Value,
    pub mapping_config: &'a ImportMappingConfig,
    pub target_project_id: &'a str,
    pub excluded_status_ids: &'a HashSet<String>,
    pub status_map: &'a HashMap<String, String>,
    pub backlog_issue_keys: &'a HashSet<String>,
    pub use_board_order: bool,
}

pub(super) enum IssueOutcome {
    Imported,
    Skipped,
    Errored,
    NoExternalId,
}

/// Process a single Jira issue: create the Rizm entity, download attachments,
/// convert description (ADF / legacy wiki), fetch comments, and patch the entity
/// with the resulting fields. Returns the outcome so the caller can update counters.
///
/// Consumes one slot of `board_order` whenever the issue is attributed a board
/// position — even on skip / dup — so the ordering stays stable.
pub(super) async fn process_issue(
    ctx: &IssueImportCtx<'_>,
    issue: &Value,
    board_order: &mut i64,
) -> Result<IssueOutcome, ImportEngineError> {
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
        return Ok(IssueOutcome::NoExternalId);
    }

    if ctx
        .db
        .get_entity_id_by_external(ctx.target_project_id, "jira", &external_id)
        .map_err(|e| ImportEngineError::Internal(e.to_string()))?
        .is_some()
    {
        if ctx.use_board_order {
            *board_order += 1;
        }
        return Ok(IssueOutcome::Skipped);
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
        if ctx.excluded_status_ids.contains(sid) {
            if ctx.use_board_order {
                *board_order += 1;
            }
            return Ok(IssueOutcome::Skipped);
        }
    }

    let (metas, id_map) = match attachment_import::download_issue_attachments(
        ctx.connection_config,
        ctx.db_path,
        ctx.target_project_id,
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
    for fm in &ctx.mapping_config.field_mappings {
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
        .map(|k| ctx.backlog_issue_keys.contains(k))
        .unwrap_or(false);
    let backlog_status = ctx
        .mapping_config
        .map_backlog_to_status
        .as_ref()
        .and_then(|s| {
            if s.trim().is_empty() {
                None
            } else {
                Some(s.trim().to_string())
            }
        });

    for fm in &ctx.mapping_config.field_mappings {
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
            transform::resolve_assignee_by_email(ctx.db, raw)
        } else if fm.rizm_property == "status" && is_backlog && backlog_status.is_some() {
            backlog_status.clone().map(Value::String)
        } else {
            transform::extract_field_value(raw, &fm.external_field_id, ctx.status_map)
        };
        if let Some(v) = val {
            properties.insert(fm.rizm_property.clone(), v);
        }
    }

    if ctx.use_board_order {
        properties.insert(
            "__keelOrder".to_string(),
            Value::Number(serde_json::Number::from(*board_order * 1000)),
        );
        *board_order += 1;
    }

    let entity =
        match ctx
            .db
            .create_entity_for_project(ctx.target_project_id, None, "task", properties)
        {
            Ok(entity) => entity,
            Err(_) => return Ok(IssueOutcome::Errored),
        };

    if ctx
        .db
        .upsert_entity_external_id(
            ctx.target_project_id,
            &entity.id,
            "jira",
            &external_id,
            key.as_deref(),
        )
        .is_err()
    {
        return Ok(IssueOutcome::Errored);
    }

    let adf_ctx = AdfImportContext {
        project_id: ctx.target_project_id.to_string(),
        entity_pk: entity.id.clone(),
        jira_to_rizm: id_map,
        rizm_meta_by_id,
    };

    let description_blocknote: Option<String> = match &description_kind {
        Some(JiraDescriptionKind::Adf(v)) => adf_to_blocknote_doc_with_context(v, Some(&adf_ctx)),
        Some(JiraDescriptionKind::LegacyWiki(s)) => jira_wiki_text_to_blocknote_doc(s, &adf_ctx),
        None => None,
    }
    .map(|doc| {
        maybe_reparse_blocknote_wrapped_markdown(&doc, Some(&adf_ctx))
            .or_else(|| maybe_reparse_blocknote_from_flat_markdown(&doc, Some(&adf_ctx)))
            .unwrap_or(doc)
    });

    let comments = if let Some(ref issue_key) = key {
        comments::fetch_comments(ctx.db, ctx.connection_config, issue_key, Some(&adf_ctx)).await
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
        if ctx
            .db
            .patch_entity_for_project(ctx.target_project_id, &entity.id, entity.updated_at, patch)
            .is_err()
        {
            return Ok(IssueOutcome::Errored);
        }
    }

    Ok(IssueOutcome::Imported)
}
