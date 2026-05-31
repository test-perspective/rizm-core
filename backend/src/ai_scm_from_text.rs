//! Heuristic extraction of Bitbucket workspace/repo from AIT conversation text (REQ-275).

use crate::ai_progress::ScmConfigResult;
use crate::models::{EntityDefinition, ProjectManifest, PropertyDefinition, PropertyType};

/// Concatenates the final transform input and all history message bodies for URL scanning.
pub fn combine_transform_text_for_scm(input: &str, history_contents: &[&str]) -> String {
    let mut s = String::new();
    s.push_str(input.trim());
    for c in history_contents {
        s.push('\n');
        s.push_str(c.trim());
    }
    s
}

/// Extracts Bitbucket Cloud workspace and repo slug from free text (with or without URL scheme).
pub fn parse_bitbucket_workspace_repo(text: &str) -> Option<(String, String)> {
    let b = text.as_bytes();
    let pat = b"bitbucket.org/";
    for i in 0..=b.len().saturating_sub(pat.len()) {
        if !b[i..i + pat.len()].eq_ignore_ascii_case(pat) {
            continue;
        }
        if !bitbucket_org_match_valid(text, i) {
            continue;
        }
        let suffix = text.get(i + pat.len()..).unwrap_or("");
        if let Some(pair) = parse_workspace_slug_after_origin(suffix) {
            return Some(pair);
        }
    }
    None
}

fn bitbucket_org_match_valid(text: &str, idx: usize) -> bool {
    if idx == 0 {
        return true;
    }
    !text[..idx]
        .chars()
        .next_back()
        .map_or(false, |c| c.is_alphanumeric() || c == '_' || c == '-')
}

fn parse_workspace_slug_after_origin(suffix: &str) -> Option<(String, String)> {
    let suffix = suffix.trim_start_matches('/');
    let (ws, rest) = split_first_path_segment(suffix)?;
    if ws.is_empty() {
        return None;
    }
    let rest = rest.trim_start_matches('/');
    let (raw_slug, _) = split_first_path_segment(rest)?;
    if raw_slug.is_empty() {
        return None;
    }
    let slug = raw_slug.trim_end_matches(".git").to_string();
    if slug.is_empty() {
        return None;
    }
    Some((ws.to_string(), slug))
}

fn split_first_path_segment(s: &str) -> Option<(&str, &str)> {
    let s = s.trim_start_matches('/');
    if s.is_empty() {
        return None;
    }
    let end = s
        .find(|c: char| c == '/' || c == '?' || c == '#' || c.is_whitespace())
        .unwrap_or(s.len());
    if end == 0 {
        return None;
    }
    let seg = &s[..end];
    if seg.is_empty() {
        return None;
    }
    let rest = s.get(end..).unwrap_or("");
    Some((seg, rest))
}

pub fn ensure_scm_integration_entity(manifest: &mut ProjectManifest) {
    if manifest.entities.iter().any(|e| e.id == "scmIntegration") {
        return;
    }
    manifest.entities.push(EntityDefinition {
        id: "scmIntegration".to_string(),
        name: "SCM Integration".to_string(),
        name_plural: "SCM Integrations".to_string(),
        properties: vec![PropertyDefinition {
            name: "title".to_string(),
            type_: PropertyType::Text,
            options: None,
            visible: Some(true),
        }],
        default_view: None,
    });
}

/// When the LLM omits `scmConfig` or the `scmIntegration` entity, recover from a Bitbucket URL in the conversation.
pub fn apply_bitbucket_scm_from_conversation_text(
    manifest: &mut ProjectManifest,
    combined_text: &str,
    llm_scm: Option<ScmConfigResult>,
) -> Option<ScmConfigResult> {
    let from_text = parse_bitbucket_workspace_repo(combined_text).map(|(workspace, repo_slug)| {
        ScmConfigResult {
            workspace,
            repo_slug,
        }
    });
    let llm_had = llm_scm.is_some();
    let text_had = from_text.is_some();
    if text_had || llm_had {
        ensure_scm_integration_entity(manifest);
    }
    llm_scm.or(from_text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        EntityDefinition, ProjectManifest, PropertyDefinition, PropertyType, ViewConfig, ViewType,
    };

    #[test]
    fn parse_bitbucket_https_url() {
        let t = "Connect https://bitbucket.org/abe-nyquist/tp-proto please";
        let (w, s) = parse_bitbucket_workspace_repo(t).expect("parse");
        assert_eq!(w, "abe-nyquist");
        assert_eq!(s, "tp-proto");
    }

    #[test]
    fn parse_bitbucket_no_scheme() {
        let t = "repo: bitbucket.org/my-ws/my-repo.git\n";
        let (w, s) = parse_bitbucket_workspace_repo(t).expect("parse");
        assert_eq!(w, "my-ws");
        assert_eq!(s, "my-repo");
    }

    #[test]
    fn parse_rejects_typos_without_slash_after_host() {
        assert!(parse_bitbucket_workspace_repo("evilbitbucket.org/w/s").is_none());
    }

    #[test]
    fn fallback_adds_entity_and_scm_when_llm_omits() {
        let mut m = ProjectManifest {
            name: "P".to_string(),
            entities: vec![EntityDefinition {
                id: "task".to_string(),
                name: "Task".to_string(),
                name_plural: "Tasks".to_string(),
                properties: vec![
                    PropertyDefinition {
                        name: "title".to_string(),
                        type_: PropertyType::Text,
                        options: None,
                        visible: Some(true),
                    },
                    PropertyDefinition {
                        name: "status".to_string(),
                        type_: PropertyType::Select,
                        options: Some(vec!["todo".to_string(), "done".to_string()]),
                        visible: Some(true),
                    },
                ],
                default_view: None,
            }],
            views: vec![ViewConfig {
                id: "board".to_string(),
                name: "Board".to_string(),
                type_: ViewType::Board,
                entity_id: "task".to_string(),
                group_by: Some("status".to_string()),
                visible_properties: vec!["title".to_string()],
                sort_by: None,
                sort_order: None,
                column_order: None,
                hidden_columns: None,
                board_dividers: None,
            }],
            default_view: "board".to_string(),
        };
        let combined = combine_transform_text_for_scm(
            "Generate the manifest based on our conversation above.",
            &["bitbucketと連携して。リポジトリは、https://bitbucket.org/ws-x/repo-y"],
        );
        let cfg = apply_bitbucket_scm_from_conversation_text(&mut m, &combined, None);
        assert!(m.entities.iter().any(|e| e.id == "scmIntegration"));
        let c = cfg.expect("scm");
        assert_eq!(c.workspace, "ws-x");
        assert_eq!(c.repo_slug, "repo-y");
    }
}
