use serde_json::Value;

use crate::import::ImportEngineError;

use crate::import::jira::board;
use crate::import::jira::client;
use crate::import::jira::JIRA_ISSUE_PAGE_SIZE;

/// Tracks pagination state across board / JQL searches.
pub(super) struct PageCursor {
    pub next_page_token: Option<String>,
    pub board_start_at: i64,
}

impl PageCursor {
    pub fn new() -> Self {
        Self {
            next_page_token: None,
            board_start_at: 0,
        }
    }
}

pub(super) struct FetchedPage {
    pub issues: Vec<Value>,
    pub has_more: bool,
    /// Populated when known (first board/JQL response that exposed `total`).
    pub page_total: Option<i64>,
}

/// Fetch the next page of issues using the board API when a `board_id` is available,
/// otherwise fall back to `search/jql` with nextPageToken pagination.
pub(super) async fn fetch_next_page(
    connection_config: &Value,
    jql: &str,
    field_ids_vec: &[String],
    fields_json: &Value,
    board_id: Option<&String>,
    cursor: &mut PageCursor,
) -> Result<FetchedPage, ImportEngineError> {
    if let Some(bid) = board_id {
        let (issues, page_total, next) = board::fetch_board_issues_page(
            connection_config,
            bid,
            jql,
            field_ids_vec,
            cursor.board_start_at,
        )
        .await?;
        cursor.board_start_at = next.unwrap_or(-1);
        let has_more = next.is_some();
        Ok(FetchedPage {
            issues,
            has_more,
            page_total: if page_total > 0 { Some(page_total) } else { None },
        })
    } else {
        let mut body = serde_json::json!({
            "jql": jql,
            "maxResults": JIRA_ISSUE_PAGE_SIZE,
            "fields": fields_json,
        });
        if let Some(ref token) = cursor.next_page_token {
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
        let page_total = res.get("total").and_then(|v| v.as_i64());
        cursor.next_page_token = res
            .get("nextPageToken")
            .and_then(|v| v.as_str())
            .map(String::from);
        let has_more = cursor.next_page_token.is_some();
        Ok(FetchedPage {
            issues,
            has_more,
            page_total,
        })
    }
}

/// Merge the `attachment` field id into the caller-provided field list so issues
/// come back with attachment metadata included (needed for ADF inline references).
pub(super) fn merge_field_ids_with_attachment(field_ids: &[String]) -> Vec<String> {
    let mut out = field_ids.to_vec();
    if !out.iter().any(|s| s == "attachment") {
        out.push("attachment".to_string());
    }
    out
}
