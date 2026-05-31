use std::collections::HashMap;

use anyhow::Context;
use keel_backend::db::Db;
use keel_backend::defaults::default_manifest;
use keel_backend::models::{Permission, PolicyDefaults, Project, ProjectConfig, ProjectPolicy};
use keel_backend::time;
use serde_json::json;

use super::content::{
    generate_task_description, generate_task_title, generate_wiki_doc, generate_wiki_title,
};

pub(super) fn generate_users(db: &Db, count: usize) -> anyhow::Result<Vec<String>> {
    let password = "change-this-password";
    let password_hash = hash_password(password);
    let mut user_ids = Vec::new();

    for i in 1..=count {
        let email = if i == 1 {
            "admin@example.local".to_string()
        } else {
            format!("user{}@example.local", i)
        };
        let role = if i == 1 { "admin" } else { "editor" };

        let user = db
            .create_local_user(&email, role, &password_hash)
            .with_context(|| format!("Failed to create user: {}", email))?;
        user_ids.push(user.id);
    }

    Ok(user_ids)
}

pub(super) fn generate_groups(db: &Db, count: usize) -> anyhow::Result<Vec<String>> {
    let mut group_ids = Vec::new();

    for i in 1..=count {
        let name = format!("Team {}", i);
        let description = Some(format!("Demo team {}", i));
        let group_id = db
            .create_user_group(&name, description.as_deref())
            .with_context(|| format!("Failed to create group: {}", name))?;
        group_ids.push(group_id);
    }

    Ok(group_ids)
}

pub(super) fn assign_users_to_groups(
    db: &Db,
    user_ids: &[String],
    group_ids: &[String],
) -> anyhow::Result<()> {
    if group_ids.is_empty() {
        return Ok(());
    }
    use rand::Rng;
    let mut rng = rand::thread_rng();

    for user_id in user_ids {
        // Each user belongs to 1-2 groups randomly
        let num_groups = rng.gen_range(1..=2.min(group_ids.len()));
        let mut assigned = std::collections::HashSet::new();
        for _ in 0..num_groups {
            let group_idx = rng.gen_range(0..group_ids.len());
            if assigned.insert(group_idx) {
                let _ = db.add_user_to_group(user_id, &group_ids[group_idx]);
            }
        }
    }

    Ok(())
}

pub(super) fn generate_projects(db: &Db, count: usize) -> anyhow::Result<Vec<String>> {
    let mut project_ids = Vec::new();
    let now = time::now_ms();

    for i in 1..=count {
        let project_id = format!("project-{}", i);
        let project_key = format!("PRJ{:03}", i);
        let name = format!("Project {}", i);

        let project = Project {
            id: project_id.clone(),
            name,
            project_key: Some(project_key),
            lifecycle_status: Some("ready".to_string()),
            created_at: now - (count as i64 - i as i64) * 86400000,
            updated_at: now,
            entities: vec![],
            config: ProjectConfig {
                manifest: default_manifest(),
            },
        };

        db.replace_project_state(project)
            .with_context(|| format!("Failed to create project: {}", project_id))?;
        project_ids.push(project_id);
    }

    Ok(project_ids)
}

pub(super) fn set_project_policy(
    db: &Db,
    project_id: &str,
    user_ids: &[String],
) -> anyhow::Result<()> {
    let mut users = HashMap::new();
    for user_id in user_ids {
        users.insert(user_id.clone(), Permission::Write);
    }

    let policy = ProjectPolicy {
        project_defaults: PolicyDefaults {
            users,
            groups: HashMap::new(),
            anonymous: Permission::Read,
        },
    };

    db.set_project_policy(project_id, policy)
        .with_context(|| format!("Failed to set policy for project: {}", project_id))?;
    Ok(())
}

pub(super) fn generate_tasks(
    db: &Db,
    project_id: &str,
    project_key: &str,
    count: usize,
    user_ids: &[String],
) -> anyhow::Result<()> {
    use rand::Rng;
    let mut rng = rand::thread_rng();

    let statuses = vec!["Backlog", "Todo", "In Progress", "Done"];
    let priorities = vec!["Low", "Medium", "High"];

    for i in 0..count {
        let title = generate_task_title(&mut rng);
        let status = statuses[rng.gen_range(0..statuses.len())];
        let priority = priorities[rng.gen_range(0..priorities.len())];
        let assignee_id = if user_ids.is_empty() {
            None
        } else {
            Some(user_ids[rng.gen_range(0..user_ids.len())].clone())
        };

        let mut properties = serde_json::Map::new();
        properties.insert("title".to_string(), json!(title));
        properties.insert("status".to_string(), json!(status));
        properties.insert("priority".to_string(), json!(priority));

        if let Some(assignee) = &assignee_id {
            properties.insert("assigneeId".to_string(), json!(assignee));
            properties.insert("createdBy".to_string(), json!(assignee));
            properties.insert("updatedBy".to_string(), json!(assignee));
        }

        let description = generate_task_description(&mut rng, project_key, i + 1);
        properties.insert("Description".to_string(), json!(description));

        let entity = db
            .create_entity_for_project(project_id, None, "task", properties)
            .with_context(|| format!("Failed to create task in project: {}", project_id))?;

        if rng.gen_bool(0.1) {
            let related_seq = rng.gen_range(1..=count.max(1));
            let related_key = format!("{}-{}", project_key, related_seq);
            let mut patch = serde_json::Map::new();
            patch.insert("link".to_string(), json!(related_key));
            let _ = db.patch_entity_for_project(project_id, &entity.id, entity.updated_at, patch);
        }
    }

    Ok(())
}

pub(super) fn generate_wiki_pages(
    db: &Db,
    project_id: &str,
    project_key: &str,
    count: usize,
    max_task_seq: usize,
    user_ids: &[String],
) -> anyhow::Result<()> {
    use rand::Rng;
    let mut rng = rand::thread_rng();

    for i in 0..count {
        let title = generate_wiki_title(&mut rng);
        let doc = generate_wiki_doc(&mut rng, project_key, max_task_seq);

        let mut properties = serde_json::Map::new();
        properties.insert("title".to_string(), json!(title));
        properties.insert("doc".to_string(), json!(doc));
        properties.insert("__keelOrder".to_string(), json!(i as f64));

        if !user_ids.is_empty() {
            let user_id = &user_ids[rng.gen_range(0..user_ids.len())];
            properties.insert("createdBy".to_string(), json!(user_id));
            properties.insert("updatedBy".to_string(), json!(user_id));
        }

        let _ = db
            .create_entity_for_project(project_id, None, "wikiPage", properties)
            .with_context(|| format!("Failed to create wiki page in project: {}", project_id))?;
    }

    Ok(())
}

pub(super) fn poisson_approx(lambda: usize) -> usize {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    if lambda == 0 {
        return 0;
    }
    let lambda_f = lambda as f64;
    let mut k = 0;
    let mut p = (-lambda_f).exp();
    let mut s = p;
    let u: f64 = rng.gen();

    while s < u {
        k += 1;
        p *= lambda_f / k as f64;
        s += p;
    }
    k
}

fn hash_password(password: &str) -> String {
    use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = argon2::Argon2::default();
    argon2
        .hash_password(password.as_bytes(), &salt)
        .expect("hash password")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::poisson_approx;

    #[test]
    fn poisson_zero_returns_zero() {
        assert_eq!(poisson_approx(0), 0);
    }
}
