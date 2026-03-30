use anyhow::Context;
use crate::auth::{AuthedUser, Role};
use crate::db::Db;
use crate::models::Permission;

pub fn check_permission(
    db: &Db,
    project_id: &str,
    user: Option<&AuthedUser>,
    action: Action,
) -> anyhow::Result<Permission> {
    // Admin users always have write permission (bypass all policy checks)
    if let Some(u) = user {
        if u.role == Role::Admin {
            return Ok(Permission::Write);
        }
    }

    let policy = db
        .get_project_policy(project_id)
        .context("get project policy")?;

    // If no policy exists, default to None (deny all)
    let policy = match policy {
        Some(p) => p,
        None => return Ok(Permission::None),
    };

    // Get user info
    let user_id = user.map(|u| u.user_id.as_str());
    let user_groups = if let Some(user) = user {
        db.get_user_groups(&user.user_id).context("get user groups")?
    } else {
        vec![]
    };

    // Check permissions in priority order:
    // 1. Project default user setting
    // 2. Project default group setting
    // 3. Project default anonymous setting
    // 4. System default (None)

    // Check project default user setting
    if let Some(user_id) = user_id {
        if let Some(perm) = policy.project_defaults.users.get(user_id) {
            if !perm_sufficient(*perm, action) {
                return Ok(Permission::None);
            }
            return Ok(*perm);
        }
    }

    // Check project default group setting
    let mut group_perms = Vec::new();
    let mut has_explicit_none = false;
    for group_id in &user_groups {
        if let Some(perm) = policy.project_defaults.groups.get(group_id) {
            if *perm == Permission::None {
                has_explicit_none = true;
            }
            group_perms.push(*perm);
        }
    }
    if has_explicit_none {
        return Ok(Permission::None);
    }
    if let Some(perm) = resolve_group_permissions(&group_perms) {
        if perm_sufficient(perm, action) {
            return Ok(perm);
        }
        return Ok(Permission::None);
    }

    // Check project default anonymous setting
    if user_id.is_none() {
        let perm = policy.project_defaults.anonymous;
        if !perm_sufficient(perm, action) {
            return Ok(Permission::None);
        }
        return Ok(perm);
    }

    // System default: deny all
    Ok(Permission::None)
}

pub fn can_read(
    db: &Db,
    project_id: &str,
    user: Option<&AuthedUser>,
) -> anyhow::Result<bool> {
    let perm = check_permission(db, project_id, user, Action::Read)?;
    Ok(perm != Permission::None)
}

pub fn can_write(
    db: &Db,
    project_id: &str,
    user: Option<&AuthedUser>,
) -> anyhow::Result<bool> {
    let perm = check_permission(db, project_id, user, Action::Write)?;
    Ok(perm == Permission::Write)
}

#[derive(Debug, Clone, Copy)]
pub enum Action {
    Read,
    Write,
}

fn perm_sufficient(perm: Permission, action: Action) -> bool {
    match (perm, action) {
        (Permission::None, _) => false,
        (Permission::Read, Action::Read) => true,
        (Permission::Read, Action::Write) => false,
        (Permission::Write, _) => true,
    }
}

fn resolve_group_permissions(perms: &[Permission]) -> Option<Permission> {
    if perms.is_empty() {
        return None;
    }

    // If any group has explicit None, deny (safety first)
    if perms.iter().any(|&p| p == Permission::None) {
        return Some(Permission::None);
    }

    // Otherwise, take the strongest permission (Write > Read > None)
    perms.iter().max().copied()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::{AuthedUser, Role};
    use crate::db::Db;
    use crate::models::{PolicyDefaults, Project, ProjectConfig, ProjectPolicy};
    use crate::defaults::default_manifest;
    use std::collections::HashMap;

    fn tmp_db() -> (tempfile::TempDir, Db) {
        let dir = tempfile::tempdir().expect("create tempdir");
        let path = dir.path().join("test.sqlite3");
        let db = Db::new(path.to_string_lossy().as_ref()).expect("create db");
        (dir, db)
    }

    #[test]
    fn test_perm_sufficient() {
        assert!(!perm_sufficient(Permission::None, Action::Read));
        assert!(!perm_sufficient(Permission::None, Action::Write));
        assert!(perm_sufficient(Permission::Read, Action::Read));
        assert!(!perm_sufficient(Permission::Read, Action::Write));
        assert!(perm_sufficient(Permission::Write, Action::Read));
        assert!(perm_sufficient(Permission::Write, Action::Write));
    }

    #[test]
    fn test_resolve_group_permissions() {
        assert_eq!(resolve_group_permissions(&[]), None);
        assert_eq!(resolve_group_permissions(&[Permission::Read]), Some(Permission::Read));
        assert_eq!(
            resolve_group_permissions(&[Permission::Read, Permission::Write]),
            Some(Permission::Write)
        );
        assert_eq!(
            resolve_group_permissions(&[Permission::Read, Permission::None]),
            Some(Permission::None)
        );
    }

    #[test]
    fn test_admin_bypasses_policy_when_no_policy_exists() {
        let (_dir, db) = tmp_db();
        let project_id = "test-project";
        
        // Create admin user
        let admin_user = AuthedUser {
            user_id: "admin-1".to_string(),
            email: "admin@example.local".to_string(),
            role: Role::Admin,
            last_login_at: None,
            session_id: "session-1".to_string(),
        };

        // Admin should have write permission even when no policy exists
        let perm_read = check_permission(&db, project_id, Some(&admin_user), Action::Read).unwrap();
        assert_eq!(perm_read, Permission::Write);
        
        let perm_write = check_permission(&db, project_id, Some(&admin_user), Action::Write).unwrap();
        assert_eq!(perm_write, Permission::Write);

        // can_read and can_write should both return true
        assert!(can_read(&db, project_id, Some(&admin_user)).unwrap());
        assert!(can_write(&db, project_id, Some(&admin_user)).unwrap());
    }

    #[test]
    fn test_admin_bypasses_explicit_deny() {
        let (_dir, db) = tmp_db();
        let project_id = "test-project";
        
        // Create project first (required for foreign key constraint)
        let project = Project {
            id: project_id.to_string(),
            name: "Test Project".to_string(),
            project_key: Some("TEST".to_string()),
            lifecycle_status: Some("ready".to_string()),
            created_at: 1000,
            updated_at: 1000,
            entities: vec![],
            config: ProjectConfig {
                manifest: default_manifest(),
            },
        };
        db.replace_project_state(project).unwrap();
        
        // Create admin user
        let admin_user = AuthedUser {
            user_id: "admin-1".to_string(),
            email: "admin@example.local".to_string(),
            role: Role::Admin,
            last_login_at: None,
            session_id: "session-1".to_string(),
        };

        // Set policy with explicit None (deny) for admin user
        let mut users = HashMap::new();
        users.insert("admin-1".to_string(), Permission::None);
        let policy = ProjectPolicy {
            project_defaults: PolicyDefaults {
                users,
                groups: HashMap::new(),
                anonymous: Permission::None,
            },
        };
        db.set_project_policy(project_id, policy).unwrap();

        // Admin should still have write permission despite explicit deny
        let perm_read = check_permission(&db, project_id, Some(&admin_user), Action::Read).unwrap();
        assert_eq!(perm_read, Permission::Write);
        
        let perm_write = check_permission(&db, project_id, Some(&admin_user), Action::Write).unwrap();
        assert_eq!(perm_write, Permission::Write);

        // can_read and can_write should both return true
        assert!(can_read(&db, project_id, Some(&admin_user)).unwrap());
        assert!(can_write(&db, project_id, Some(&admin_user)).unwrap());
    }
}
