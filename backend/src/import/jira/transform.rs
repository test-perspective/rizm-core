//! Field value extraction and conversion from Jira JSON to Rizm format.

use std::collections::HashMap;

use serde_json::Value;

use crate::db::Db;


/// Resolve Jira assignee to Rizm user id by email. Returns None if no match.
pub fn resolve_assignee_by_email(db: &Db, raw: Option<&Value>) -> Option<Value> {
    let obj = raw?.as_object()?;
    let email = obj.get("emailAddress").and_then(|v| v.as_str())?;
    let user = db.get_user_by_email_case_insensitive(email).ok().flatten()?;
    Some(Value::String(user.id))
}

/// Parse Jira ISO datetime (e.g. "2024-01-15T10:30:00.000+0000") to milliseconds.
pub fn parse_jira_datetime(s: &str) -> Option<i64> {
    use chrono::DateTime;
    let normalized = s.replace("+0000", "+00:00").replace("-0000", "-00:00");
    DateTime::parse_from_rfc3339(&normalized)
        .ok()
        .map(|dt| dt.timestamp_millis())
}

pub fn extract_field_value(
    raw: Option<&Value>,
    field_id: &str,
    status_map: &HashMap<String, String>,
) -> Option<Value> {
    let v = raw?;
    if field_id == "status" {
        let id = v.get("id").and_then(|x| x.as_str())?;
        let mapped = status_map.get(id).cloned().unwrap_or_else(|| {
            v.get("name")
                .and_then(|n| n.as_str())
                .unwrap_or("")
                .to_string()
        });
        return Some(Value::String(mapped));
    }
    if field_id == "issuetype" {
        let name = v
            .get("name")
            .and_then(|n| n.as_str())
            .map(|s| s.to_string());
        return name.map(Value::String);
    }
    if let Some(s) = v.as_str() {
        return Some(Value::String(s.to_string()));
    }
    if let Some(n) = v.as_i64() {
        return Some(Value::Number(serde_json::Number::from(n)));
    }
    if let Some(b) = v.as_bool() {
        return Some(Value::Bool(b));
    }
    if let Some(obj) = v.as_object() {
        if let Some(name) = obj.get("name").and_then(|n| n.as_str()) {
            return Some(Value::String(name.to_string()));
        }
        if let Some(display_name) = obj.get("displayName").and_then(|n| n.as_str()) {
            return Some(Value::String(display_name.to_string()));
        }
        if let Some(email) = obj.get("emailAddress").and_then(|n| n.as_str()) {
            return Some(Value::String(email.to_string()));
        }
        if let Some(key) = obj.get("key").and_then(|n| n.as_str()) {
            return Some(Value::String(key.to_string()));
        }
    }
    if let Some(arr) = v.as_array() {
        if field_id == "issuelinks" {
            let keys: Vec<String> = arr
                .iter()
                .filter_map(|x| {
                    let obj = x.as_object()?;
                    obj.get("inwardIssue")
                        .or_else(|| obj.get("outwardIssue"))
                        .and_then(|iss| iss.get("key"))
                        .and_then(|k| k.as_str())
                        .map(|s| s.to_string())
                })
                .collect();
            if !keys.is_empty() {
                return Some(Value::Array(keys.into_iter().map(Value::String).collect()));
            }
        }
        let labels: Vec<String> = arr
            .iter()
            .filter_map(|x| {
                if let Some(s) = x.as_str() {
                    return Some(s.to_string());
                }
                x.as_object()
                    .and_then(|o| o.get("name").or_else(|| o.get("value")).and_then(|n| n.as_str()))
                    .map(|s| s.to_string())
            })
            .collect();
        if !labels.is_empty() {
            return Some(Value::Array(
                labels.into_iter().map(Value::String).collect(),
            ));
        }
    }
    None
}
