//! Backfill Jira-imported tasks: convert raw Markdown `Description` / comment `doc` strings to BlockNote JSON.
//!
//! Usage:
//!   KEEL_DB_PATH=../data/keel.demo.sqlite3 cargo run --bin keel_backfill_jira_markdown -- --project-key MYPROJ --dry-run
//!   (from repo root) same with path data/keel.demo.sqlite3
//!
//! Default DB path matches dev-backend.ps1 when possible: prefers existing ../data/keel.demo.sqlite3 or data/keel.demo.sqlite3.

use std::path::Path;

use keel_backend::db::Db;
use keel_backend::import::jira::compute_jira_markdown_backfill_patch;
use keel_backend::infra::db::EntityWriteError;

/// Resolve DB file: env KEEL_DB_PATH, else first existing candidate (aligns with scripts/dev-backend.ps1).
fn resolve_db_path() -> String {
    if let Ok(p) = std::env::var("KEEL_DB_PATH") {
        let t = p.trim();
        if !t.is_empty() {
            return t.to_string();
        }
    }
    for rel in [
        "../data/keel.demo.sqlite3",
        "data/keel.demo.sqlite3",
        "./data/keel.demo.sqlite3",
        "data/keel.sqlite3",
        "./data/keel.sqlite3",
    ] {
        if Path::new(rel).is_file() {
            return rel.to_string();
        }
    }
    "../data/keel.demo.sqlite3".to_string()
}

fn main() -> anyhow::Result<()> {
    let mut project_key: Option<String> = None;
    let mut dry_run = true;
    let mut list_projects = false;
    let mut all_tasks = false;
    let mut filter_task_key: Option<String> = None;
    let mut args = std::env::args().skip(1);
    while let Some(a) = args.next() {
        match a.as_str() {
            "--project-key" | "-k" => {
                project_key = args.next();
            }
            "--task-key" | "-t" => {
                filter_task_key = args.next();
            }
            "--all-tasks" => all_tasks = true,
            "--list-projects" => list_projects = true,
            "--dry-run" => dry_run = true,
            "--apply" => dry_run = false,
            "-h" | "--help" => {
                eprintln!(
                    "Usage: keel_backfill_jira_markdown [--list-projects] [--project-key <KEY>] [--task-key <TASKKEY>] \\\n\
                     [--all-tasks] [--dry-run | --apply]\n\
                     Default: --dry-run (no writes). Use --apply to persist patches.\n\
                     By default only tasks with a Jira external id are scanned. Use --all-tasks to scan every task in the project.\n\
                     Env: KEEL_DB_PATH (optional; if unset, uses first existing among ../data/keel.demo.sqlite3, data/keel.demo.sqlite3, …)\n\
                     Tip: use the same DB as dev-backend.ps1 (usually <repo>/data/keel.demo.sqlite3)."
                );
                std::process::exit(0);
            }
            _ => {
                eprintln!("Unknown argument: {a}");
                std::process::exit(1);
            }
        }
    }

    let db_path = resolve_db_path();
    let db = Db::new(&db_path)?;

    if list_projects {
        println!("KEEL_DB_PATH (effective): {}", db_path);
        for row in db.list_projects_meta()? {
            let (id, name, pk, lifecycle, _, _) = row;
            println!(
                "  project_key={:?} name={} id={} lifecycle={}",
                pk, name, id, lifecycle
            );
        }
        return Ok(());
    }

    let Some(pk) = project_key.filter(|s| !s.trim().is_empty()) else {
        eprintln!("Missing --project-key <KEY> (or use --list-projects). DB: {}", db_path);
        std::process::exit(1);
    };

    let normalized = pk.trim().to_uppercase();
    let Some(project_id) = db.get_project_id_by_key(&normalized)? else {
        eprintln!(
            "Project key '{}' not found in database.\n\
             Effective KEEL_DB_PATH: {}\n\
             Projects in this file:",
            normalized, db_path
        );
        for row in db.list_projects_meta()? {
            let (_id, name, pk_opt, _lifecycle, _, _) = row;
            eprintln!("  - key={:?} name={}", pk_opt, name);
        }
        eprintln!(
            "Hint: point KEEL_DB_PATH at the same file as dev-backend.ps1 (e.g. ..\\\\data\\\\keel.demo.sqlite3 from backend/)."
        );
        anyhow::bail!("project key not found");
    };

    let entity_ids: Vec<String> = if all_tasks {
        db.list_entities_for_project(&project_id)?
            .into_iter()
            .filter(|e| e.entity_id == "task")
            .map(|e| e.id)
            .collect()
    } else {
        db.list_entity_ids_with_external_provider(&project_id, "jira")?
    };

    let want_key = filter_task_key
        .as_ref()
        .map(|s| s.trim().to_uppercase())
        .filter(|s| !s.is_empty());

    eprintln!(
        "Scan mode: {} ({} task row(s))",
        if all_tasks {
            "all tasks in project"
        } else {
            "Jira-linked tasks only"
        },
        entity_ids.len()
    );

    let mut updated = 0u64;
    let mut examined = 0u64;
    let mut skipped_conflict = 0u64;
    let mut skipped_no_patch = 0u64;

    for entity_pk in entity_ids {
        let Some(entity) = db.get_entity_for_project(&project_id, &entity_pk)? else {
            continue;
        };
        if entity.entity_id != "task" {
            continue;
        }

        let task_key = entity
            .properties
            .get("taskKey")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        if let Some(ref w) = want_key {
            if task_key.to_uppercase() != *w {
                continue;
            }
        }

        examined += 1;
        let Some(patch) = compute_jira_markdown_backfill_patch(&entity.properties) else {
            skipped_no_patch += 1;
            if want_key.is_some() {
                eprintln!(
                    "Task {} ({}): no backfill patch (already BlockNote or no convertible Markdown / comments)",
                    task_key, entity.id
                );
            }
            continue;
        };

        if dry_run {
            println!("[dry-run] would patch task {} ({})", task_key, entity.id);
            updated += 1;
            continue;
        }

        match db.patch_entity_for_project(&project_id, &entity.id, entity.updated_at, patch) {
            Ok(_) => {
                println!("Patched task {} ({})", task_key, entity.id);
                updated += 1;
            }
            Err(EntityWriteError::Conflict { .. }) => {
                eprintln!(
                    "Conflict for task {} ({}); re-fetch and retry manually or re-run",
                    task_key, entity.id
                );
                skipped_conflict += 1;
            }
            Err(e) => {
                anyhow::bail!("patch failed for {}: {:?}", entity.id, e);
            }
        }
    }

    println!(
        "Done. examined_tasks={} patched_or_would_patch={} skipped_no_patch={} conflicts={} dry_run={}",
        examined, updated, skipped_no_patch, skipped_conflict, dry_run
    );
    Ok(())
}
