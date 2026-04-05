//! Jira Software (Agile) API: boards, backlog, column order.

use serde_json::Value;

use super::super::{ImportEngineError, ImportStatusMeta};
use super::client;

/// Get board ID for project (Jira Software). Returns None if no board.
pub async fn fetch_board_id(config: &Value, project_key: &str) -> Option<String> {
    let path = format!(
        "{}/board?projectKeyOrId={}",
        client::jira_agile_path(),
        urlencoding::encode(project_key)
    );
    let boards_res = client::request(config, "GET", &path, None).await.ok()?;
    let boards = boards_res.get("values")?.as_array()?.clone();
    let first = boards.first()?;
    first
        .get("id")
        .and_then(|v| v.as_i64().map(|n| n.to_string()).or_else(|| v.as_str().map(String::from)))
}

/// Fetch all issue keys from board backlog (Agile API). Returns empty set on error.
pub async fn fetch_backlog_issue_keys(
    config: &Value,
    board_id: &str,
) -> std::collections::HashSet<String> {
    let mut keys = std::collections::HashSet::new();
    let mut start_at: i64 = 0;
    loop {
        let path = format!(
            "{}/board/{}/backlog?maxResults={}&startAt={}",
            client::jira_agile_path(),
            urlencoding::encode(board_id),
            super::JIRA_ISSUE_PAGE_SIZE,
            start_at
        );
        let res = match client::request(config, "GET", &path, None).await {
            Ok(v) => v,
            Err(_) => break,
        };
        let issues = res
            .get("issues")
            .or_else(|| res.get("values"))
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        for issue in &issues {
            if let Some(k) = issue.get("key").and_then(|v| v.as_str()) {
                keys.insert(k.to_string());
            }
        }
        let total = res.get("total").and_then(|v| v.as_i64()).unwrap_or(0);
        start_at += issues.len() as i64;
        if start_at >= total || issues.is_empty() {
            break;
        }
    }
    keys
}

/// Fetch one page of board issues (rank order). Returns (issues, total, next_start_at).
pub async fn fetch_board_issues_page(
    config: &Value,
    board_id: &str,
    jql: &str,
    fields: &[String],
    start_at: i64,
) -> Result<(Vec<Value>, i64, Option<i64>), ImportEngineError> {
    let fields_param = fields
        .iter()
        .map(|s| urlencoding::encode(s))
        .collect::<Vec<_>>()
        .join(",");
    let path = format!(
        "{}/board/{}/issue?jql={}&maxResults={}&startAt={}&fields={}",
        client::jira_agile_path(),
        urlencoding::encode(board_id),
        urlencoding::encode(jql),
        super::JIRA_ISSUE_PAGE_SIZE,
        start_at,
        fields_param
    );
    let res = client::request(config, "GET", &path, None).await?;
    let issues = res
        .get("issues")
        .or_else(|| res.get("values"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let total = res.get("total").and_then(|v| v.as_i64()).unwrap_or(0);
    let next = if start_at + (issues.len() as i64) < total {
        Some(start_at + issues.len() as i64)
    } else {
        None
    };
    Ok((issues, total, next))
}

/// Reorder statuses to match board column order.
pub async fn reorder_statuses_by_board(
    config: &Value,
    statuses: Vec<ImportStatusMeta>,
    project_key: &str,
) -> Vec<ImportStatusMeta> {
    let id_to_status: std::collections::HashMap<String, ImportStatusMeta> =
        statuses.into_iter().map(|s| (s.id.clone(), s)).collect();

    let boards_res = client::request(
        config,
        "GET",
        &format!(
            "{}/board?projectKeyOrId={}",
            client::jira_agile_path(),
            urlencoding::encode(project_key)
        ),
        None,
    )
    .await;

    let boards = match boards_res {
        Ok(v) => v.get("values").and_then(|x| x.as_array()).cloned().unwrap_or_default(),
        Err(_) => return id_to_status.into_values().collect(),
    };

    let board_id = boards.first().and_then(|b| b.get("id")).and_then(|v| {
        v.as_i64()
            .map(|n| n.to_string())
            .or_else(|| v.as_str().map(String::from))
    });

    let board_id = match board_id {
        Some(id) => id,
        None => return id_to_status.into_values().collect(),
    };

    let config_res = client::request(
        config,
        "GET",
        &format!(
            "{}/board/{}/configuration",
            client::jira_agile_path(),
            board_id
        ),
        None,
    )
    .await;

    let columns = match config_res {
        Ok(v) => v
            .get("columnConfig")
            .and_then(|c| c.get("columns"))
            .and_then(|c| c.as_array())
            .cloned()
            .unwrap_or_default(),
        Err(_) => return id_to_status.into_values().collect(),
    };

    let mut ordered_ids = Vec::new();
    let empty: &[Value] = &[];
    for col in columns {
        let statuses_arr = col
            .get("statuses")
            .and_then(|s| s.as_array())
            .map(|v| v.as_slice())
            .unwrap_or(empty);
        for st in statuses_arr {
            let id = st.get("id").and_then(|v| {
                v.as_str()
                    .map(String::from)
                    .or_else(|| v.as_i64().map(|n| n.to_string()))
            });
            if let Some(id) = id {
                if !ordered_ids.contains(&id) {
                    ordered_ids.push(id);
                }
            }
        }
    }

    if ordered_ids.is_empty() {
        return id_to_status.into_values().collect();
    }

    let mut out = Vec::new();
    for id in &ordered_ids {
        if let Some(s) = id_to_status.get(id) {
            out.push(s.clone());
        }
    }
    for (id, s) in id_to_status {
        if !ordered_ids.contains(&id) {
            out.push(s);
        }
    }
    out
}
