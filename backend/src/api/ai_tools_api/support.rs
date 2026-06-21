use serde_json::{json, Value};

use crate::ai_tools::AiToolCallLog;
use crate::auth::{AuthedUser, Role};
use crate::models::ProjectManifest;

pub(super) fn build_transform_system_prompt() -> String {
    [
        "You are a ProjectManifest generator for Rizm.",
        "Return exactly one JSON object.",
        "Output JSON only. Do not add explanations, markdown, or code fences.",
        "Field names must be camelCase.",
        "",
        "Required output key:",
        "{ \"manifest\": ProjectManifest, \"scmConfig\"?: { \"workspace\": string, \"repoSlug\": string } }",
        "",
        "ProjectManifest shape (summary):",
        "{",
        "  \"name\": string,",
        "  \"entities\": Array<{",
        "    \"id\": string,",
        "    \"name\": string,",
        "    \"namePlural\": string,",
        "    \"properties\": Array<{ \"name\": string, \"type\": \"text\"|\"richtext\"|\"select\"|\"labels\"|\"number\"|\"date\"|\"boolean\"|\"user\", \"options\"?: string[], \"visible\"?: boolean }>,",
        "    \"defaultView\"?: string",
        "  }>,",
        "  \"views\": Array<{ \"id\": string, \"name\": string, \"type\": \"board\"|\"table\"|\"wiki\", \"entityId\": string, \"groupBy\"?: string, \"visibleProperties\": string[], \"sortBy\"?: string, \"sortOrder\"?: \"asc\"|\"desc\" }>,",
        "  \"defaultView\": string",
        "}",
        "",
        "Constraints:",
        "- views[].type: use \"table\" for list/table views. NEVER use \"list\" (deprecated).",
        "- entities[].id must be unique and non-empty",
        "- entities[].properties[].name must be unique within the entity and non-empty",
        "- if properties[].type is select, options must be present and non-empty",
        "- for label/tag fields, use type=labels (options are optional; if present they must be non-empty)",
        "- defaultView must match a views[].id",
        "- views[].entityId must match an entities[].id",
        "- views[].visibleProperties must be chosen from the entity properties",
        "- board views must include groupBy (select property with options)",
        "",
        "SCM (Bitbucket) integration:",
        "- When the user asks to enable Bitbucket/SCM integration or link with Bitbucket, add exactly one entity to manifest.entities with id \"scmIntegration\" (if not already present).",
        "- Use this exact entity shape: { \"id\": \"scmIntegration\", \"name\": \"SCM Integration\", \"namePlural\": \"SCM Integrations\", \"properties\": [{ \"name\": \"title\", \"type\": \"text\", \"visible\": true }] }.",
        "- Do NOT add properties to existing entities (e.g. task) for SCM; only add the scmIntegration entity.",
        "- Do NOT add any view whose entityId is \"scmIntegration\" (it must stay hidden).",
        "",
        "When the user mentions SCM/Bitbucket and provides repository info, include top-level \"scmConfig\": { \"workspace\": \"<value>\", \"repoSlug\": \"<value>\" }.",
        "- Extract workspace/repoSlug from flexible natural input, including:",
        "  - URL: https://bitbucket.org/<workspace>/<repoSlug>",
        "  - key-value lines: workspace: <value>, repository: <value>, repo: <value>, repo slug: <value>",
        "  - mixed punctuation/newlines and quoted values.",
        "- Prefer explicit key-value fields over URL-derived values if both are present.",
        "- Normalize repoSlug by removing trailing .git.",
        "- If either workspace or repoSlug is missing, omit scmConfig.",
        "- If both are present, output scmConfig exactly with keys \"workspace\" and \"repoSlug\".",
        "- Keep \"manifest\" as the full ProjectManifest.",
        "",
        "You may call tools to fetch other project manifests or wiki pages when needed.",
    ]
    .join("\n")
}

pub(super) fn build_transform_user_prompt(
    input: &str,
    project_id: Option<&str>,
    current: Option<&ProjectManifest>,
) -> String {
    let mut s = String::new();
    s.push_str("User request:\n");
    s.push_str(input);
    s.push_str("\n\n");
    if let Some(project_id) = project_id {
        if !project_id.trim().is_empty() {
            s.push_str("Current project id:\n");
            s.push_str(project_id.trim());
            s.push_str("\n\n");
        }
    }
    if let Some(m) = current {
        if let Ok(v) = serde_json::to_string_pretty(m) {
            s.push_str("Current manifest (reference):\n");
            s.push_str(&v);
            s.push_str("\n\n");
        }
    }
    s.push_str("Return exactly one JSON object. Required key: \"manifest\" (ProjectManifest). Optional key: \"scmConfig\" ({\"workspace\": string, \"repoSlug\": string}).");
    s
}

pub(super) fn build_transform_conversation_system_prompt(
    project_id: Option<&str>,
    current: Option<&ProjectManifest>,
) -> String {
    let mut s = String::new();
    s.push_str("You are helping the user design a ProjectManifest for Rizm.\n");
    s.push_str("Language: Reply in the same language the user writes in (e.g. Japanese for Japanese input). Do not force English.\n");
    s.push_str("Your role is to clarify requirements through conversation.\n");
    s.push_str("Ask clarifying questions when needed (e.g., sales vs support CRM, which entities to include).\n");
    s.push_str("When you have enough information, say something like \"I'm ready to generate the manifest\" or \"Ready to generate.\" Do NOT output JSON in this phase.\n");
    s.push_str("Bitbucket / SCM:\n");
    s.push_str("- If the user already gave a bitbucket.org/... URL (or explicit workspace + repo slug), treat repository identity as settled.\n");
    s.push_str("- Do NOT send long questionnaires (numbered lists about goals, optional entities, views, OAuth details). At most one short follow-up if something is ambiguous (e.g., wrong host or missing slug).\n");
    s.push_str("- Standard setup is only the hidden scmIntegration entity; task cards show branch/PR after OAuth. Do not propose extra Commit/PullRequest entities unless the user explicitly asks.\n");
    s.push_str("- Reply in 2–4 short sentences: confirm repo, note that Generate Manifest in this panel will add scmIntegration and save workspace/repo, then OAuth runs outside chat. End with clear readiness, e.g. \"Ready to generate the manifest.\"\n");
    s.push_str("Use tools (list_projects, get_project_manifest) to fetch other project manifests or wiki pages when helpful.\n");
    s.push_str("Keep responses concise.\n");
    if let Some(pid) = project_id {
        if !pid.trim().is_empty() {
            s.push_str("\nCurrent project id:\n");
            s.push_str(pid.trim());
            s.push('\n');
        }
    }
    if let Some(m) = current {
        if let Ok(v) = serde_json::to_string_pretty(m) {
            s.push_str("\nCurrent manifest (reference):\n");
            s.push_str(&v);
            s.push('\n');
        }
    }
    s
}

pub(super) fn build_chat_system_prompt(
    project_id: Option<&str>,
    project_key: Option<&str>,
    user: Option<&AuthedUser>,
) -> String {
    let mut s = String::new();
    s.push_str("You are a Rizm assistant.\n");
    s.push_str("Use tools to fetch project data or wiki pages only when needed.\n");
    s.push_str("When the user asks to save investigation results or notes to a wiki page, use create_wiki_page to create a new page with the content.\n");
    s.push_str("Release notes / wiki write-ups: use search_tasks with projectId or projectKey plus labels (and optional status/priority) to list relevant tasks; property-filtered search allows up to 100 results per call. For query-only semantic search, limit stays at 20. Use get_task with taskKey, or entity_id / entityId with the same value as MCP read_entity. Always pass non-empty Markdown in create_wiki_page content (or body); if fetch_url fails, write from task fields only.\n");
    s.push_str("Task updates: use update_task to change title, status, priority, description, or other task fields. For label changes, prefer addLabels to attach labels and removeLabels to detach specific labels without affecting others; avoid labels full replace unless you intentionally want to overwrite every label on the task.\n");
    s.push_str("Keep responses concise and actionable.\n");
    s.push_str("For questions like \"How many tasks?\" or \"タスク数はいくつ?\", use list_tasks and report the totalCount from the response.\n");
    if let Some(project_id) = project_id {
        if !project_id.trim().is_empty() {
            s.push_str("\nCurrent project id:\n");
            s.push_str(project_id.trim());
            s.push('\n');
        }
    }
    if let Some(project_key) = project_key {
        if !project_key.trim().is_empty() {
            s.push_str("Current project key:\n");
            s.push_str(project_key.trim());
            s.push('\n');
            s.push_str("When the user refers to the project by its key, they mean this project.\n");
        }
    }
    let is_admin = user.map(|u| u.role == Role::Admin).unwrap_or(false);
    if is_admin {
        s.push_str("\nYou have admin tools available. You can:\n");
        s.push_str("- List users (including inactive), get user by ID (includes lastLoginAt), bulk delete users, create users, update user role/disabled status, reset passwords.\n");
        s.push_str("- List groups, create/update/delete groups, add/remove members, get group members or user's groups.\n");
        s.push_str(
            "- Manage per-project access: get_project_policy and grant_project_user_access (use projectId or projectKey). If the person is not a user yet, create_user first, then grant read or write.\n",
        );
        s.push_str("Use these tools when the user asks about user or group management, or adding someone to a project.\n");
    }
    s
}

pub(super) fn build_history_messages(history: &[super::ChatHistoryMessage]) -> Vec<Value> {
    history
        .iter()
        .filter_map(|item| {
            let role = item.role.trim();
            let content = item.content.trim();
            if content.is_empty() {
                return None;
            }
            if role != "user" && role != "assistant" {
                return None;
            }
            Some(json!({
                "role": role,
                "content": content,
            }))
        })
        .collect()
}

pub(super) fn build_ai_audit_meta_json(
    kind: &str,
    model: &str,
    user_prompt: &str,
    result_value: Value,
    tool_calls: &[AiToolCallLog],
    project_id: Option<&str>,
    elapsed_ms: u128,
) -> String {
    let mut ai = json!({
        "kind": kind,
        "model": model,
        "prompt": user_prompt,
        "result": result_value,
        "toolCalls": tool_calls,
        "elapsedMs": elapsed_ms
    });
    if let Some(project_id) = project_id {
        if !project_id.trim().is_empty() {
            ai.as_object_mut().unwrap().insert(
                "projectId".to_string(),
                Value::String(project_id.trim().to_string()),
            );
        }
    }
    json!({ "ai": ai }).to_string()
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use crate::ai_tools::AiToolCallLog;
    use crate::auth::{AuthedUser, Role};
    use crate::models::ProjectManifest;

    use super::{
        build_ai_audit_meta_json, build_chat_system_prompt, build_history_messages,
        build_transform_conversation_system_prompt,
    };

    #[test]
    fn build_ai_audit_meta_json_includes_expected_fields() {
        let tool_calls = vec![
            AiToolCallLog {
                id: "call-1".to_string(),
                name: "search_projects".to_string(),
                arguments: json!({ "query": "alpha" }),
            },
            AiToolCallLog {
                id: "call-2".to_string(),
                name: "get_project_manifest".to_string(),
                arguments: json!({ "projectId": "p1" }),
            },
        ];
        let meta_json = build_ai_audit_meta_json(
            "chat-tools",
            "deepseek-chat",
            "user prompt",
            Value::String("ok".to_string()),
            &tool_calls,
            Some("project-1"),
            1234,
        );
        let parsed: Value = serde_json::from_str(&meta_json).expect("parse meta json");
        let ai = parsed.get("ai").expect("ai field");
        assert_eq!(ai.get("kind").and_then(|v| v.as_str()), Some("chat-tools"));
        assert_eq!(
            ai.get("model").and_then(|v| v.as_str()),
            Some("deepseek-chat")
        );
        assert_eq!(
            ai.get("prompt").and_then(|v| v.as_str()),
            Some("user prompt")
        );
        assert_eq!(
            ai.get("projectId").and_then(|v| v.as_str()),
            Some("project-1")
        );
        assert_eq!(ai.get("elapsedMs").and_then(|v| v.as_u64()), Some(1234));
        let tool_calls_value = ai.get("toolCalls").and_then(|v| v.as_array());
        assert_eq!(tool_calls_value.map(|v| v.len()), Some(2));
    }

    #[test]
    fn build_history_messages_filters_invalid_items() {
        let history = vec![
            super::super::ChatHistoryMessage {
                role: "user".to_string(),
                content: " Hello ".to_string(),
            },
            super::super::ChatHistoryMessage {
                role: "assistant".to_string(),
                content: " World ".to_string(),
            },
            super::super::ChatHistoryMessage {
                role: "system".to_string(),
                content: "ignored".to_string(),
            },
            super::super::ChatHistoryMessage {
                role: "user".to_string(),
                content: "   ".to_string(),
            },
        ];

        let out = build_history_messages(&history);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].get("role").and_then(|v| v.as_str()), Some("user"));
        assert_eq!(
            out[0].get("content").and_then(|v| v.as_str()),
            Some("Hello")
        );
        assert_eq!(
            out[1].get("role").and_then(|v| v.as_str()),
            Some("assistant")
        );
        assert_eq!(
            out[1].get("content").and_then(|v| v.as_str()),
            Some("World")
        );
    }

    #[test]
    fn build_transform_conversation_system_prompt_includes_context() {
        let prompt = build_transform_conversation_system_prompt(Some("proj-1"), None);
        assert!(prompt.contains("helping the user design a ProjectManifest"));
        assert!(prompt.contains("proj-1"));
        assert!(prompt.contains("Ask clarifying questions"));
        assert!(prompt.contains("Do NOT output JSON"));
        assert!(prompt.contains("Bitbucket"));
        assert!(prompt.contains("scmIntegration"));
        assert!(prompt.contains("same language"));
        assert!(prompt.contains("Do NOT send long questionnaires"));
    }

    #[test]
    fn build_transform_conversation_system_prompt_includes_current_manifest() {
        let manifest = ProjectManifest {
            name: "Test App".to_string(),
            entities: vec![],
            views: vec![],
            default_view: "table".to_string(),
        };
        let prompt = build_transform_conversation_system_prompt(Some("p1"), Some(&manifest));
        assert!(prompt.contains("Current manifest"));
        assert!(prompt.contains("Test App"));
    }

    #[test]
    fn build_chat_system_prompt_includes_admin_hints_when_admin_and_empty_project() {
        let user = AuthedUser {
            user_id: "admin-1".to_string(),
            email: "admin@example.local".to_string(),
            role: Role::Admin,
            last_login_at: None,
            session_id: "s1".to_string(),
        };
        let prompt = build_chat_system_prompt(None, None, Some(&user));
        assert!(prompt.contains("admin tools"));
        assert!(prompt.contains("user or group management"));
    }

    #[test]
    fn build_chat_system_prompt_excludes_admin_hints_when_not_admin() {
        let user = AuthedUser {
            user_id: "editor-1".to_string(),
            email: "editor@example.local".to_string(),
            role: Role::Editor,
            last_login_at: None,
            session_id: "s1".to_string(),
        };
        let prompt = build_chat_system_prompt(None, None, Some(&user));
        assert!(!prompt.contains("admin tools"));
    }

    #[test]
    fn build_chat_system_prompt_includes_project_context() {
        let prompt = build_chat_system_prompt(Some("proj-123"), Some("RIZM"), None);
        assert!(prompt.contains("Current project id"));
        assert!(prompt.contains("proj-123"));
        assert!(prompt.contains("Current project key"));
        assert!(prompt.contains("RIZM"));
        assert!(prompt.contains("refers to the project by its key"));
    }

    #[test]
    fn build_chat_system_prompt_includes_release_notes_hints() {
        let prompt = build_chat_system_prompt(Some("p1"), Some("REQ"), None);
        assert!(prompt.contains("Release notes"));
        assert!(prompt.contains("entity_id"));
        assert!(prompt.contains("create_wiki_page"));
    }

    #[test]
    fn build_chat_system_prompt_includes_admin_hints_when_admin_inside_project() {
        let user = AuthedUser {
            user_id: "admin-1".to_string(),
            email: "admin@example.local".to_string(),
            role: Role::Admin,
            last_login_at: None,
            session_id: "s1".to_string(),
        };
        let prompt = build_chat_system_prompt(Some("proj-1"), Some("REQ"), Some(&user));
        assert!(prompt.contains("admin tools"));
        assert!(prompt.contains("get_project_policy"));
        assert!(prompt.contains("grant_project_user_access"));
    }
}
