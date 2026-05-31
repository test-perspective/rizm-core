use std::env;
use std::path::Path;

use anyhow::Context;
use keel_backend::db::Db;

#[path = "keel_seed_demo/args.rs"]
mod args;
#[path = "keel_seed_demo/content.rs"]
mod content;
#[path = "keel_seed_demo/generators.rs"]
mod generators;

use args::parse_args;
use generators::{
    assign_users_to_groups, generate_groups, generate_projects, generate_tasks, generate_users,
    generate_wiki_pages, poisson_approx, set_project_policy,
};

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = env::args().collect();
    let config = parse_args(&args)?;

    println!("Generating demo data:");
    println!("  DB path: {}", config.db_path);
    println!("  Projects: {}", config.projects);
    println!("  Users: {}", config.users);
    println!("  Groups: {}", config.groups);
    println!("  Avg tasks per project: {}", config.avg_tasks_per_project);
    println!(
        "  Avg wiki pages per project: {}",
        config.avg_wiki_pages_per_project
    );

    if config.wipe && Path::new(&config.db_path).exists() {
        std::fs::remove_file(&config.db_path)
            .with_context(|| format!("Failed to remove existing DB: {}", config.db_path))?;
        println!("Removed existing DB file");
    }

    let db = Db::new(&config.db_path)
        .with_context(|| format!("Failed to initialize DB: {}", config.db_path))?;

    let user_ids = generate_users(&db, config.users)?;
    println!("Generated {} users", user_ids.len());

    let group_ids = generate_groups(&db, config.groups)?;
    println!("Generated {} groups", group_ids.len());

    assign_users_to_groups(&db, &user_ids, &group_ids)?;
    if !group_ids.is_empty() {
        println!("Assigned users to groups");
    }

    let project_ids = generate_projects(&db, config.projects)?;
    println!("Generated {} projects", project_ids.len());

    for project_id in &project_ids {
        set_project_policy(&db, project_id, &user_ids)?;
    }
    println!("Set project policies");

    for (idx, project_id) in project_ids.iter().enumerate() {
        let project_key = format!("PRJ{:03}", idx + 1);
        let task_count = poisson_approx(config.avg_tasks_per_project);
        generate_tasks(&db, project_id, &project_key, task_count, &user_ids)?;

        let wiki_count = poisson_approx(config.avg_wiki_pages_per_project);
        generate_wiki_pages(
            &db,
            project_id,
            &project_key,
            wiki_count,
            task_count,
            &user_ids,
        )?;

        println!(
            "  Project {}: {} tasks, {} wiki pages",
            project_key, task_count, wiki_count
        );
    }

    println!("Demo data generation complete!");
    Ok(())
}
