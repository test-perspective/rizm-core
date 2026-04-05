//! Fetch and convert Jira comments to Rizm format.

use serde_json::Value;

use crate::db::Db;
use crate::import::adf::{
    jira_comment_body_to_blocknote_doc, maybe_reparse_blocknote_from_flat_markdown,
    maybe_reparse_blocknote_wrapped_markdown, AdfImportContext,
};

use super::client;
use super::transform::parse_jira_datetime;

fn finish_comment_vec(mut out: Vec<Value>) -> Vec<Value> {
    out.reverse();
    out
}

/// Fetch comments for an issue and convert to Rizm format. Returns empty array on error.
///
/// Uses paginated Jira requests (`startAt` / `maxResults`) so each HTTP response stays bounded.
pub async fn fetch_comments(
    db: &Db,
    config: &Value,
    issue_key: &str,
    adf_ctx: Option<&AdfImportContext>,
) -> Vec<Value> {
    const PAGE: i64 = super::JIRA_ISSUE_PAGE_SIZE;
    let mut out: Vec<Value> = Vec::new();
    let mut start_at: i64 = 0;

    loop {
        let path = format!(
            "{}/issue/{}/comment?startAt={}&maxResults={}",
            client::jira_api_path(),
            urlencoding::encode(issue_key),
            start_at,
            PAGE
        );
        let res = client::request(config, "GET", &path, None).await;

        let res = match res {
            Ok(v) => v,
            Err(_) => {
                return if start_at == 0 {
                    vec![]
                } else {
                    finish_comment_vec(out)
                };
            }
        };

        let comments = res
            .get("comments")
            .and_then(|c| c.as_array())
            .cloned()
            .unwrap_or_default();

        let total = res
            .get("total")
            .and_then(|t| t.as_i64())
            .unwrap_or(-1);

        let page_len = comments.len() as i64;
        if page_len == 0 {
            break;
        }

        for c in comments {
            let body = c.get("body");
            let doc = match body.and_then(|b| jira_comment_body_to_blocknote_doc(b, adf_ctx)) {
                Some(s) => maybe_reparse_blocknote_wrapped_markdown(&s, adf_ctx)
                    .or_else(|| maybe_reparse_blocknote_from_flat_markdown(&s, adf_ctx))
                    .unwrap_or(s),
                None => continue,
            };

            let created = c
                .get("created")
                .and_then(|v| v.as_str())
                .and_then(|s| parse_jira_datetime(s))
                .unwrap_or(0);

            let author = c.get("author").and_then(|a| {
                let name = a
                    .get("displayName")
                    .or_else(|| a.get("name"))
                    .and_then(|n| n.as_str())
                    .unwrap_or("")
                    .to_string();
                let email = a.get("emailAddress").and_then(|x| x.as_str());
                let author_json =
                    match email.and_then(|e| db.get_user_by_email_case_insensitive(e).ok().flatten()) {
                        Some(rizm_user) => serde_json::json!({
                            "id": rizm_user.id,
                            "name": name
                        }),
                        None => {
                            if name.is_empty() {
                                None?
                            }
                            serde_json::json!({ "name": name })
                        }
                    };
                Some(author_json)
            });

            let id = c
                .get("id")
                .and_then(|v| {
                    v.as_str()
                        .map(String::from)
                        .or_else(|| v.as_i64().map(|n| n.to_string()))
                })
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

            out.push(serde_json::json!({
                "id": id,
                "createdAt": created,
                "author": author,
                "doc": doc
            }));
        }

        start_at += page_len;
        if page_len < PAGE {
            break;
        }
        if total >= 0 && start_at >= total {
            break;
        }
    }

    finish_comment_vec(out)
}
