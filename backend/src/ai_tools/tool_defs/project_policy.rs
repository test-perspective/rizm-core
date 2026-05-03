use serde_json::{json, Value};

pub(super) fn project_policy_tools() -> Vec<Value> {
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
