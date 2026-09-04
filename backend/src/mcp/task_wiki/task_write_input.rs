//! MCP/AIA argument structs for task create/update.

use anyhow::Context;
use serde_json::Value;

use crate::mcp::jsonrpc::{read_present_string_array_arg, read_string_arg, read_string_array_arg};

#[derive(Debug, Clone, Default)]
pub struct TaskCreateInput {
    pub project_key: Option<String>,
    pub project_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub labels: Option<Vec<String>>,
    pub task_key: Option<String>,
    pub parent_task_key: Option<Vec<String>>,
    pub blocked_by: Option<Vec<String>>,
    pub blocks: Option<Vec<String>>,
    pub link: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default)]
pub struct TaskUpdateInput {
    pub task_key: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub labels: Option<Vec<String>>,
    pub add_labels: Option<Vec<String>>,
    pub remove_labels: Option<Vec<String>>,
    pub parent_task_key: Option<Vec<String>>,
    pub blocked_by: Option<Vec<String>>,
    pub add_blocked_by: Option<Vec<String>>,
    pub remove_blocked_by: Option<Vec<String>>,
    pub blocks: Option<Vec<String>>,
    pub link: Option<Vec<String>>,
    pub patch: Option<serde_json::Map<String, Value>>,
}

impl TaskCreateInput {
    pub fn from_mcp_args(args: &Value) -> anyhow::Result<Self> {
        let title =
            read_string_arg(args, &["title"]).context("missing required argument: title")?;
        Ok(Self {
            project_key: read_string_arg(args, &["projectKey", "project_key"]),
            project_id: read_string_arg(args, &["projectId", "project_id"]),
            title,
            description: read_string_arg(args, &["description", "body", "content"]),
            status: read_string_arg(args, &["status"]),
            priority: read_string_arg(args, &["priority"]),
            labels: read_string_array_arg(args, &["labels"]),
            task_key: read_string_arg(args, &["taskKey", "task_key"]),
            parent_task_key: read_present_string_array_arg(
                args,
                &["parentTaskKey", "parent_task_key"],
            ),
            blocked_by: read_present_string_array_arg(args, &["blockedBy", "blocked_by"]),
            blocks: read_present_string_array_arg(args, &["blocks"]),
            link: read_present_string_array_arg(args, &["link"]),
        })
    }
}

impl TaskUpdateInput {
    pub fn from_mcp_args(args: &Value) -> anyhow::Result<Self> {
        let task_key = read_string_arg(args, &["taskKey", "task_key", "entity_id", "entityId"])
            .context("missing required argument: taskKey")?;
        Ok(Self {
            task_key,
            title: read_string_arg(args, &["title"]),
            description: read_string_arg(args, &["description", "body", "content"]),
            status: read_string_arg(args, &["status"]),
            priority: read_string_arg(args, &["priority"]),
            labels: read_string_array_arg(args, &["labels"]),
            add_labels: read_string_array_arg(args, &["addLabels", "add_labels"]),
            remove_labels: read_string_array_arg(args, &["removeLabels", "remove_labels"]),
            parent_task_key: read_present_string_array_arg(
                args,
                &["parentTaskKey", "parent_task_key"],
            ),
            blocked_by: read_present_string_array_arg(args, &["blockedBy", "blocked_by"]),
            add_blocked_by: read_present_string_array_arg(
                args,
                &["addBlockedBy", "add_blocked_by"],
            ),
            remove_blocked_by: read_present_string_array_arg(
                args,
                &["removeBlockedBy", "remove_blocked_by"],
            ),
            blocks: read_present_string_array_arg(args, &["blocks"]),
            link: read_present_string_array_arg(args, &["link"]),
            patch: args.get("patch").and_then(Value::as_object).cloned(),
        })
    }
}
