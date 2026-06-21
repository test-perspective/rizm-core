use serde_json::{json, Value};

pub(super) fn project_tools() -> Vec<Value> {
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
                "name": "create_task",
                "description": "Create a task in a project. The taskKey is generated from the project key unless taskKey is explicitly provided.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "projectKey": { "type": "string", "description": "Project key like REQ." },
                        "projectId": { "type": "string", "description": "Project id." },
                        "title": { "type": "string", "description": "Task title." },
                        "description": { "type": "string", "description": "Optional Markdown/plain text task description." },
                        "status": { "type": "string", "description": "Task status (e.g. Todo, In Progress)." },
                        "priority": { "type": "string", "description": "Task priority (e.g. Low, Medium, High)." },
                        "labels": { "type": "array", "items": { "type": "string" }, "description": "Initial task labels." },
                        "taskKey": { "type": "string", "description": "Optional explicit task key like REQ-299." }
                    },
                    "required": ["title"],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "update_task",
                "description": "Update a task by taskKey. Supports common fields and an optional patch object for additional task properties. Use addLabels/removeLabels for incremental label changes; avoid labels full replace unless you intend to overwrite all labels.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "taskKey": { "type": "string", "description": "Task key like REQ-299 (preferred when set)." },
                        "entity_id": { "type": "string", "description": "Alias for taskKey (MCP read_entity parameter name)." },
                        "entityId": { "type": "string", "description": "Alias for taskKey (camelCase)." },
                        "title": { "type": "string", "description": "Task title." },
                        "description": { "type": "string", "description": "Markdown/plain text task description." },
                        "status": { "type": "string", "description": "Task status." },
                        "priority": { "type": "string", "description": "Task priority." },
                        "labels": { "type": "array", "items": { "type": "string" }, "description": "Replace all task labels with this array." },
                        "addLabels": { "type": "array", "items": { "type": "string" }, "description": "Add labels without removing existing ones." },
                        "removeLabels": { "type": "array", "items": { "type": "string" }, "description": "Remove specific labels while keeping others." },
                        "patch": { "type": "object", "description": "Additional task properties to patch. createdBy and updatedBy are ignored." }
                    },
                    "required": [],
                    "additionalProperties": false
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "add_comment",
                "description": "Add a comment to a task or wiki page. Input text is Markdown/plain text and is stored as a BlockNote document.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "targetType": { "type": "string", "enum": ["task", "wiki"], "description": "Comment target type." },
                        "taskKey": { "type": "string", "description": "Task key like REQ-299 (required when targetType=task)." },
                        "projectKey": { "type": "string", "description": "Project key like REQ (required when targetType=wiki)." },
                        "wikiPageId": { "type": "string", "description": "Wiki page entity id." },
                        "wikiPageTitle": { "type": "string", "description": "Wiki page title." },
                        "text": { "type": "string", "description": "Comment body in Markdown/plain text." }
                    },
                    "required": ["targetType", "text"],
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
