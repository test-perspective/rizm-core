use serde_json::{json, Value};

pub(super) fn admin_tools() -> Vec<Value> {
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
