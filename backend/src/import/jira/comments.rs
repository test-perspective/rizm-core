//! Fetch and convert Jira comments to Rizm format.

use serde_json::Value;

use crate::db::Db;
use crate::import::adf::{jira_comment_body_to_blocknote_doc, AdfImportContext};

use super::client;
use super::transform::parse_jira_datetime;

/// Fetch comments for an issue and convert to Rizm format. Returns empty array on error.
pub async fn fetch_comments(
    db: &Db,
    config: &Value,
    issue_key: &str,
    adf_ctx: Option<&AdfImportContext>,
) -> Vec<Value> {
    let path = format!(
        "{}/issue/{}/comment",
        client::jira_api_path(),
        urlencoding::encode(issue_key)
    );
    let res = client::request(config, "GET", &path, None).await;

    let res = match res {
        Ok(v) => v,
        Err(_) => return vec![],
    };

    let comments = res
        .get("comments")
        .and_then(|c| c.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::new();
    for c in comments {
        let body = c.get("body");
        let doc = match body.and_then(|b| jira_comment_body_to_blocknote_doc(b, adf_ctx)) {
            Some(s) => s,
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
            let author_json = match email.and_then(|e| db.get_user_by_email_case_insensitive(e).ok().flatten()) {
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
    out.reverse();
    out
}
