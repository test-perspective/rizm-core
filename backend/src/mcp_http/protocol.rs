use serde_json::{json, Value};

pub fn initialize_result() -> Value {
    json!({
        "protocolVersion": "2025-11-25",
        "capabilities": {
            "tools": {}
        },
        "serverInfo": {
            "name": "keel-mcp-http",
            "version": env!("CARGO_PKG_VERSION")
        }
    })
}

pub fn tools_list_result() -> Value {
    json!({
        "tools": [
            {
                "name": "read_entity",
                "description": "Read a task entity by taskKey (e.g. TASK-101) and return its properties JSON.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "entity_id": {
                            "type": "string",
                            "description": "taskKey like TASK-101"
                        }
                    },
                    "required": ["entity_id"],
                    "additionalProperties": false
                }
            },
            {
                "name": "add_comment",
                "description": "Add a comment to a task or wiki page. Input text is stored as BlockNote JSON doc.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "targetType": {
                            "type": "string",
                            "enum": ["task", "wiki"],
                            "description": "Comment target type"
                        },
                        "taskKey": {
                            "type": "string",
                            "description": "Task key like REQ-25 (required when targetType=task)"
                        },
                        "projectKey": {
                            "type": "string",
                            "description": "Project key like REQ (required when targetType=wiki)"
                        },
                        "wikiPageId": {
                            "type": "string",
                            "description": "Wiki page entity id (required when targetType=wiki and wikiPageTitle omitted)"
                        },
                        "wikiPageTitle": {
                            "type": "string",
                            "description": "Wiki page title (required when targetType=wiki and wikiPageId omitted)"
                        },
                        "text": {
                            "type": "string",
                            "description": "Comment body in Markdown/plain text"
                        }
                    },
                    "required": ["targetType", "text"],
                    "additionalProperties": false
                }
            },
            {
                "name": "create_task",
                "description": "Create a task in a project. The taskKey is generated from the project key unless taskKey is explicitly provided.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "projectKey": { "type": "string", "description": "Project key like REQ" },
                        "projectId": { "type": "string", "description": "Project id" },
                        "title": { "type": "string", "description": "Task title" },
                        "description": { "type": "string", "description": "Optional Markdown/plain text task description" },
                        "status": { "type": "string", "description": "Task status (e.g. Todo, In Progress)" },
                        "priority": { "type": "string", "description": "Task priority (e.g. Low, Medium, High)" },
                        "labels": { "type": "array", "items": { "type": "string" }, "description": "Task labels" },
                        "taskKey": { "type": "string", "description": "Optional explicit task key like REQ-299" }
                    },
                    "required": ["title"],
                    "additionalProperties": false
                }
            },
            {
                "name": "update_task",
                "description": "Update a task by taskKey. Supports common fields and an optional patch object for additional task properties.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "taskKey": { "type": "string", "description": "Task key like REQ-299" },
                        "title": { "type": "string", "description": "Task title" },
                        "description": { "type": "string", "description": "Markdown/plain text task description" },
                        "status": { "type": "string", "description": "Task status" },
                        "priority": { "type": "string", "description": "Task priority" },
                        "labels": { "type": "array", "items": { "type": "string" }, "description": "Task labels" },
                        "patch": { "type": "object", "description": "Additional task properties to patch. createdBy and updatedBy are ignored." }
                    },
                    "required": ["taskKey"],
                    "additionalProperties": false
                }
            },
            {
                "name": "list_projects",
                "description": "List projects the current user can read.",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "required": [],
                    "additionalProperties": false
                }
            },
            {
                "name": "search_projects",
                "description": "Search readable projects by name or projectKey.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Search keywords for project name or projectKey" }
                    },
                    "required": ["query"],
                    "additionalProperties": false
                }
            },
            {
                "name": "get_project_manifest",
                "description": "Get a project's manifest by projectKey or projectId.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "projectKey": { "type": "string", "description": "Project key like REQ" },
                        "projectId": { "type": "string", "description": "Project id" }
                    },
                    "required": [],
                    "additionalProperties": false
                }
            },
            {
                "name": "get_current_datetime",
                "description": "Get the current server local date and time.",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "required": [],
                    "additionalProperties": false
                }
            },
            {
                "name": "apply_manifest",
                "description": "Validate and optionally apply a ProjectManifest. Use dryRun=true before saving; dryRun=false requires ifMatch.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "projectKey": { "type": "string", "description": "Project key like REQ" },
                        "projectId": { "type": "string", "description": "Project id" },
                        "manifest": { "type": "object", "description": "ProjectManifest JSON" },
                        "ifMatch": { "type": "string", "description": "Current manifest ETag returned by get_project_manifest" },
                        "dryRun": { "type": "boolean", "description": "When true, validate and return a summary without saving" },
                        "message": { "type": "string", "description": "Optional history message when saving" },
                        "source": { "type": "string", "description": "Optional history source; defaults to mcp_apply_manifest" }
                    },
                    "required": ["manifest"],
                    "additionalProperties": false
                }
            },
            {
                "name": "list_tasks",
                "description": "List tasks in a project.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "projectKey": { "type": "string", "description": "Project key like REQ" },
                        "projectId": { "type": "string", "description": "Project id" },
                        "limit": { "type": "integer", "description": "Max results (1-100)", "minimum": 1, "maximum": 100 }
                    },
                    "required": [],
                    "additionalProperties": false
                }
            },
            {
                "name": "search_tasks",
                "description": "Search tasks. Semantic search (query) searches title+description. Property filters (labels, status, priority) require project scope.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Keyword search in title and description (optional when using property filters)" },
                        "projectKey": { "type": "string", "description": "Required when using labels/status/priority. Optional for semantic search." },
                        "projectId": { "type": "string", "description": "Required when using labels/status/priority. Optional for semantic search." },
                        "labels": { "type": "array", "items": { "type": "string" }, "description": "Filter by labels; task matches if it has any of these" },
                        "status": { "type": "string", "description": "Filter by status (e.g. Todo, In Progress)" },
                        "priority": { "type": "string", "description": "Filter by priority (e.g. High, Medium)" },
                        "limit": { "type": "integer", "description": "Max results (1-20)", "minimum": 1, "maximum": 20 }
                    },
                    "required": [],
                    "additionalProperties": false
                }
            },
            {
                "name": "search_wiki",
                "description": "Search wiki pages by keyword. Omit projectKey/projectId to search all projects.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Search query" },
                        "projectKey": { "type": "string", "description": "Limit to project (optional)" },
                        "projectId": { "type": "string", "description": "Limit to project (optional)" },
                        "limit": { "type": "integer", "description": "Max results (1-20)", "minimum": 1, "maximum": 20 }
                    },
                    "required": ["query"],
                    "additionalProperties": false
                }
            },
            {
                "name": "get_wiki_page",
                "description": "Get a wiki page by pageId or title.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "projectKey": { "type": "string", "description": "Project key like REQ" },
                        "projectId": { "type": "string", "description": "Project id" },
                        "pageId": { "type": "string", "description": "Wiki page entity id" },
                        "wikiPageTitle": { "type": "string", "description": "Wiki page title" }
                    },
                    "required": [],
                    "additionalProperties": false
                }
            },
            {
                "name": "create_wiki_page",
                "description": "Create a new wiki page with optional Markdown content. Use to save investigation results or notes.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "projectKey": { "type": "string", "description": "Project key like REQ" },
                        "projectId": { "type": "string", "description": "Project id" },
                        "title": { "type": "string", "description": "Page title" },
                        "content": { "type": "string", "description": "Optional Markdown content for the page body" }
                    },
                    "required": ["title"],
                    "additionalProperties": false
                }
            },
            {
                "name": "fetch_url",
                "description": "Fetch content from an external URL (http/https). Returns JSON with url, statusCode, content. Localhost and non-text content types are not allowed.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "URL to fetch (http or https only)" }
                    },
                    "required": ["url"],
                    "additionalProperties": false
                }
            }
        ]
    })
}
