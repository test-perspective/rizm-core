//! Fetch Jira metadata: projects, fields, statuses, issue types.

use serde_json::Value;

use super::board;
use super::client;
use super::super::{
    ImportEngineError, ImportFieldMeta, ImportMetadata, ImportProjectMeta, ImportStatusMeta,
};

pub async fn fetch_metadata(
    connection_config: &Value,
    project_id_or_key: Option<&str>,
) -> Result<ImportMetadata, ImportEngineError> {
    let _ = client::base_url(connection_config)?;

    let projects_json: Vec<Value> = client::request(
        connection_config,
        "GET",
        &format!("{}/project", client::jira_api_path()),
        None,
    )
    .await?
    .as_array()
    .cloned()
    .unwrap_or_default();

    let projects: Vec<ImportProjectMeta> = projects_json
        .into_iter()
        .filter_map(|p| {
            let id = p.get("id")?.as_str()?.to_string();
            let key = p.get("key")?.as_str()?.to_string();
            let name = p.get("name")?.as_str()?.to_string();
            Some(ImportProjectMeta { id, key, name })
        })
        .collect();

    let fields_json: Vec<Value> = client::request(
        connection_config,
        "GET",
        &format!("{}/field", client::jira_api_path()),
        None,
    )
    .await?
    .as_array()
    .cloned()
    .unwrap_or_default();

    let fields: Vec<ImportFieldMeta> = fields_json
        .into_iter()
        .filter_map(|f| {
            let id = f.get("id")?.as_str()?.to_string();
            let name = f.get("name")?.as_str()?.to_string();
            let schema = f
                .get("schema")
                .and_then(|s| s.get("type"))
                .and_then(|t| t.as_str())
                .unwrap_or("string");
            let custom = f.get("custom").and_then(|c| c.as_bool()).unwrap_or(false);
            Some(ImportFieldMeta {
                id,
                name,
                field_type: schema.to_string(),
                custom,
            })
        })
        .collect();

    let statuses: Vec<ImportStatusMeta> = if let Some(proj) = project_id_or_key.filter(|s| !s.trim().is_empty()) {
        let project_statuses_json: Vec<Value> = client::request(
            connection_config,
            "GET",
            &format!(
                "{}/project/{}/statuses",
                client::jira_api_path(),
                urlencoding::encode(proj)
            ),
            None,
        )
        .await?
        .as_array()
        .cloned()
        .unwrap_or_default();
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut out = Vec::new();
        for it in project_statuses_json {
            let statuses_arr = it
                .get("statuses")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            for s in statuses_arr {
                let Some(id_val) = s.get("id").and_then(|v| v.as_str()) else { continue };
                let id = id_val.to_string();
                if seen.contains(&id) {
                    continue;
                }
                seen.insert(id.clone());
                let Some(name_val) = s.get("name").and_then(|v| v.as_str()) else { continue };
                let name = name_val.to_string();
                let category = s
                    .get("statusCategory")
                    .and_then(|c| c.get("name"))
                    .and_then(|n| n.as_str())
                    .map(|s| s.to_string());
                out.push(ImportStatusMeta { id, name, category });
            }
        }
        board::reorder_statuses_by_board(connection_config, out, proj).await
    } else {
        let statuses_json: Vec<Value> = client::request(
            connection_config,
            "GET",
            &format!("{}/status", client::jira_api_path()),
            None,
        )
        .await?
        .as_array()
        .cloned()
        .unwrap_or_default();
        statuses_json
            .into_iter()
            .filter_map(|s| {
                let id = s.get("id")?.as_str()?.to_string();
                let name = s.get("name")?.as_str()?.to_string();
                let category = s
                    .get("statusCategory")
                    .and_then(|c| c.get("name"))
                    .and_then(|n| n.as_str())
                    .map(|s| s.to_string());
                Some(ImportStatusMeta { id, name, category })
            })
            .collect()
    };

    let issue_types: Option<Vec<String>> =
        if let Some(proj) = project_id_or_key.filter(|s| !s.trim().is_empty()) {
            let project_res = client::request(
                connection_config,
                "GET",
                &format!("{}/project/{}", client::jira_api_path(), urlencoding::encode(proj)),
                None,
            )
            .await;
            if let Ok(v) = project_res {
                v.get("issueTypes")
                    .and_then(|arr| arr.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|it| {
                                it.get("name")
                                    .and_then(|n| n.as_str())
                                    .map(String::from)
                            })
                            .collect()
                    })
            } else {
                None
            }
        } else {
            None
        };

    Ok(ImportMetadata {
        provider: "jira".to_string(),
        projects,
        fields,
        statuses,
        issue_types,
    })
}
