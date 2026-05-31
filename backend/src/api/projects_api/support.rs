use std::collections::HashMap;

use crate::auth::Role;
use crate::models::{
    Permission, PolicyDefaults, Project, ProjectConfig, ProjectManifest, ProjectPolicy,
};

pub(super) fn normalize_project_key(s: &str) -> String {
    s.trim().to_uppercase()
}

pub(super) fn is_valid_project_key(s: &str) -> bool {
    // 3-10 chars, A-Z0-9
    let k = normalize_project_key(s);
    let bytes = k.as_bytes();
    if bytes.len() < 3 || bytes.len() > 10 {
        return false;
    }
    bytes.iter().all(|b| matches!(b, b'A'..=b'Z' | b'0'..=b'9'))
}

pub(super) fn can_create_project(role: Role) -> bool {
    role != Role::Viewer
}

pub(super) fn suggest_project_key(name: &str, is_taken: impl Fn(&str) -> bool) -> String {
    let base = normalize_project_key(name).replace(|c: char| !c.is_ascii_alphanumeric(), "");
    let mut candidates: Vec<String> = Vec::new();

    if base.len() >= 3 {
        candidates.push(base.chars().take(3).collect());
    }

    let letters = normalize_project_key(name).replace(|c: char| !c.is_ascii_alphabetic(), "");
    if !letters.is_empty() {
        let padded = format!("{}XXX", letters);
        let key: String = padded.chars().take(3).collect();
        candidates.push(key);
    }

    candidates.push("NEW".to_string());

    for c in &candidates {
        let key: String = c.chars().take(3).collect();
        if key.len() == 3 && !is_taken(&key) {
            return key;
        }
    }

    let prefix = candidates
        .get(0)
        .and_then(|c| c.chars().next())
        .unwrap_or('N');
    for i in 1..1000 {
        let suffix = format!("{:02}", i);
        let key: String = format!("{}{}", prefix, suffix).chars().take(3).collect();
        if key.len() == 3 && !is_taken(&key) {
            return key;
        }
    }

    "001".to_string()
}

/// Create a new project with the given manifest. Used by Adaptive Task Import.
pub fn create_project_with_manifest(
    db: &crate::db::Db,
    user_id: &str,
    name: &str,
    project_key: &str,
    manifest: ProjectManifest,
) -> anyhow::Result<String> {
    let project_id = uuid::Uuid::new_v4().to_string();
    let now = crate::time::now_ms();
    let key = normalize_project_key(project_key);
    if !is_valid_project_key(&key) {
        anyhow::bail!("project.projectKey must be 3-10 chars (A-Z0-9)");
    }
    let project = Project {
        id: project_id.clone(),
        name: name.to_string(),
        project_key: Some(key),
        lifecycle_status: Some("importing".to_string()),
        created_at: now,
        updated_at: now,
        entities: vec![],
        config: ProjectConfig { manifest },
    };
    db.replace_project_state(project)?;
    let mut users_map = HashMap::new();
    users_map.insert(user_id.to_string(), Permission::Write);
    let policy = ProjectPolicy {
        project_defaults: PolicyDefaults {
            users: users_map,
            groups: HashMap::new(),
            anonymous: Permission::None,
        },
    };
    db.set_project_policy(&project_id, policy)?;
    Ok(project_id)
}

#[cfg(test)]
mod tests {
    use crate::auth::Role;

    use super::{can_create_project, suggest_project_key};

    #[test]
    fn test_can_create_project_by_role() {
        assert!(can_create_project(Role::Admin));
        assert!(can_create_project(Role::Editor));
        assert!(!can_create_project(Role::Viewer));
    }

    #[test]
    fn test_suggest_project_key_skips_taken() {
        let taken = ["DEV".to_string(), "NEW".to_string()];
        let key = suggest_project_key("Development", |candidate| {
            taken.contains(&candidate.to_string())
        });
        assert_ne!(key, "DEV");
        assert_ne!(key, "NEW");
        assert_eq!(key.len(), 3);
    }
}
