use serde_json::{json, Value};

use crate::auth::{AuthedUser, Role};

fn project_tools() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "list_projects",
                "description": "List projects the current user can read.",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": [],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "search_projects",
                "description": "Search projects by name or projectKey.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Search keywords for name or projectKey." }
                    },
                    "required": ["query"],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "get_project_manifest",
                "description": "Get a project's manifest by projectId.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "projectId": { "type": "string", "description": "Project id to load." }
                    },
                    "required": ["projectId"],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "list_tasks",
                "description": "List tasks in a project. Returns totalCount (total task count), tasks (page), projectId, projectKey. Use totalCount for \"How many tasks?\" questions.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "projectId": { "type": "string", "description": "Project id." },
                        "projectKey": { "type": "string", "description": "Project key like REQ." },
                        "limit": { "type": "integer", "description": "Max results (1-100).", "minimum": 1, "maximum": 100 }
                    },
                    "required": [],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "search_tasks",
                "description": "Search tasks. Semantic search (query) searches title+description. Property filters (labels, status, priority) require projectId.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Keyword search in title and description (optional when using property filters)." },
                        "projectId": { "type": "string", "description": "Required when using labels/status/priority. Optional for semantic search." },
                        "projectKey": { "type": "string", "description": "Required when using labels/status/priority. Optional for semantic search." },
                        "labels": { "type": "array", "items": { "type": "string" }, "description": "Filter by labels; task matches if it has any of these." },
                        "status": { "type": "string", "description": "Filter by status (e.g. Todo, In Progress)." },
                        "priority": { "type": "string", "description": "Filter by priority (e.g. High, Medium)." },
                        "limit": { "type": "integer", "description": "Max results: 1-100 when using labels/status/priority filters; 1-20 for semantic search (query only).", "minimum": 1, "maximum": 100 }
                    },
                    "required": [],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "get_task",
                "description": "Get a task by taskKey (e.g. REQ-207). Same identifier as MCP read_entity: you may pass entity_id or entityId instead of taskKey.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "taskKey": { "type": "string", "description": "Task key like REQ-207 (preferred when set)." },
                        "entity_id": { "type": "string", "description": "Alias for taskKey (MCP read_entity parameter name)." },
                        "entityId": { "type": "string", "description": "Alias for taskKey (camelCase)." }
                    },
                    "required": [],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "search_wiki",
                "description": "Search wiki pages by keyword. Omit projectId to search all projects.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Keyword query." },
                        "projectId": { "type": "string", "description": "Limit to project (optional)." },
                        "projectKey": { "type": "string", "description": "Limit to project (optional)." },
                        "limit": { "type": "integer", "description": "Max results (1-20).", "minimum": 1, "maximum": 20 }
                    },
                    "required": ["query"],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "fetch_url",
                "description": "Fetch content from an external URL. Returns the page body as text. Use for reading web pages, documentation, or API responses.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "The URL to fetch (must be http or https)." }
                    },
                    "required": ["url"],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "get_current_datetime",
                "description": "Get the current date and time (PC/server local time).",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": [],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "get_wiki_page",
                "description": "Get a wiki page by pageId or title.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "projectId": { "type": "string", "description": "Project id that owns the wiki." },
                        "projectKey": { "type": "string", "description": "Project key like REQ." },
                        "pageId": { "type": "string", "description": "Wiki page id." },
                        "title": { "type": "string", "description": "Wiki page title." }
                    },
                    "required": [],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "create_wiki_page",
                "description": "Create a new wiki page with Markdown body. For release notes or summaries, pass non-empty Markdown in content (or body): empty pages render blank. Use search_tasks with labels to list tasks, then get_task for details.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "projectId": { "type": "string", "description": "Project id that owns the wiki." },
                        "projectKey": { "type": "string", "description": "Project key like REQ." },
                        "title": { "type": "string", "description": "Page title." },
                        "content": { "type": "string", "description": "Markdown body (preferred). Required for substantive pages." },
                        "body": { "type": "string", "description": "Alias for content (Markdown body)." }
                    },
                    "required": ["title"],
                    "additionalProperties": false
                }
            }
        }),
    ]
}

fn project_policy_tools() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "get_project_policy",
                "description": "Get the project access policy (per-user and per-group defaults). Admin only. Use projectId or projectKey.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "projectId": { "type": "string", "description": "Project id." },
                        "projectKey": { "type": "string", "description": "Project key (e.g. REQ)." }
                    },
                    "required": [],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "grant_project_user_access",
                "description": "Grant or revoke a user's access on a project via project defaults (read/write). Admin only. Use userId or email; if the user does not exist yet, create_user first. permission \"none\" removes that user from project user defaults.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "projectId": { "type": "string", "description": "Project id." },
                        "projectKey": { "type": "string", "description": "Project key (e.g. REQ)." },
                        "userId": { "type": "string", "description": "User id (optional if email is set)." },
                        "email": { "type": "string", "description": "User email (optional if userId is set)." },
                        "permission": { "type": "string", "description": "read, write, or none (removes user entry)." }
                    },
                    "required": ["permission"],
                    "additionalProperties": false
                }
            }
        }),
    ]
}

fn admin_tools() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "list_users",
                "description": "List users. Returns id, email, role, isDisabled, createdAt, lastLoginAt. Filter by inactive (disabled) users.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "inactiveOnly": { "type": "boolean", "description": "If true, return only disabled users." },
                        "includeDisabled": { "type": "boolean", "description": "If true, include disabled users in results. Default excludes them." }
                    },
                    "required": [],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "get_user",
                "description": "Get a single user by ID. Returns id, email, role, isDisabled, createdAt, lastLoginAt (last login timestamp).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "userId": { "type": "string", "description": "User ID to fetch." }
                    },
                    "required": ["userId"],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "bulk_delete_users",
                "description": "Delete multiple users by their IDs. Cannot delete the last admin.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "userIds": { "type": "array", "items": { "type": "string" }, "description": "User IDs to delete." }
                    },
                    "required": ["userIds"],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "create_user",
                "description": "Create a new user.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "email": { "type": "string", "description": "User email." },
                        "role": { "type": "string", "description": "Role: admin, editor, or viewer." },
                        "initialPassword": { "type": "string", "description": "Initial password (min 12 chars). If omitted, a temp password is generated." }
                    },
                    "required": ["email", "role"],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "update_user",
                "description": "Update user role or disabled status.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "userId": { "type": "string", "description": "User ID to update." },
                        "role": { "type": "string", "description": "New role: admin, editor, or viewer." },
                        "isDisabled": { "type": "boolean", "description": "Whether to disable the user." }
                    },
                    "required": ["userId"],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "reset_password",
                "description": "Reset a user's password.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "userId": { "type": "string", "description": "User ID." },
                        "generateTemp": { "type": "boolean", "description": "If true, generate a temp password and return it." },
                        "newPassword": { "type": "string", "description": "New password (min 12 chars). Use when generateTemp is false." }
                    },
                    "required": ["userId"],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "list_groups",
                "description": "List all user groups.",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": [],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "create_group",
                "description": "Create a new user group.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "Group name." },
                        "description": { "type": "string", "description": "Optional description." }
                    },
                    "required": ["name"],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "update_group",
                "description": "Update a group's name or description.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "groupId": { "type": "string", "description": "Group ID." },
                        "name": { "type": "string", "description": "New name." },
                        "description": { "type": "string", "description": "Optional description." }
                    },
                    "required": ["groupId", "name"],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "delete_group",
                "description": "Delete a user group.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "groupId": { "type": "string", "description": "Group ID to delete." }
                    },
                    "required": ["groupId"],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "add_member_to_group",
                "description": "Add a user to a group. Use groupId from list_groups (the id field), not the group name.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "groupId": { "type": "string", "description": "Group ID." },
                        "userId": { "type": "string", "description": "User ID to add." }
                    },
                    "required": ["groupId", "userId"],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "remove_member_from_group",
                "description": "Remove a user from a group.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "groupId": { "type": "string", "description": "Group ID." },
                        "userId": { "type": "string", "description": "User ID to remove." }
                    },
                    "required": ["groupId", "userId"],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "get_group_members",
                "description": "Get the list of user IDs in a group.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "groupId": { "type": "string", "description": "Group ID." }
                    },
                    "required": ["groupId"],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "get_user_groups",
                "description": "Get the list of group IDs a user belongs to.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "userId": { "type": "string", "description": "User ID." }
                    },
                    "required": ["userId"],
                    "additionalProperties": false
                }
            }
        }),
    ]
}

pub(super) fn build_tool_definitions(
    user: &AuthedUser,
    project_id: Option<&str>,
    force_include_admin: bool,
) -> Vec<Value> {
    let mut tools = project_tools();
    if user.role == Role::Admin {
        tools.extend(project_policy_tools());
    }
    let include_admin = user.role == Role::Admin
        && (force_include_admin || project_id.map(|s| s.trim().is_empty()).unwrap_or(true));
    if include_admin {
        tools.extend(admin_tools());
    }
    tools
}
