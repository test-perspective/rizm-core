//! Delete projects by project_key. Usage:
//!   cargo run --bin keel_delete_project -- TPD TPD1
//! Or with KEEL_DB_PATH:
//!   KEEL_DB_PATH=./data/keel.demo.sqlite3 cargo run --bin keel_delete_project -- TPD TPD1

use keel_backend::api::attachments_api;
use keel_backend::db::Db;

fn main() -> anyhow::Result<()> {
    let db_path =
        std::env::var("KEEL_DB_PATH").unwrap_or_else(|_| "./data/keel.sqlite3".to_string());
    let keys: Vec<String> = std::env::args().skip(1).collect();
    if keys.is_empty() {
        eprintln!("Usage: keel_delete_project <project_key> [project_key ...]");
        eprintln!("Example: keel_delete_project TPD TPD1");
        std::process::exit(1);
    }

    let db = Db::new(&db_path)?;
    for key in &keys {
        let normalized = key.trim().to_uppercase();
        match db.get_project_id_by_key(&normalized) {
            Ok(Some(project_id)) => {
                db.delete_project(&project_id)?;
                if let Err(e) =
                    attachments_api::delete_project_attachments_dir(&db_path, &project_id)
                {
                    eprintln!(
                        "Warning: failed to delete attachments dir for {}: {}",
                        normalized, e
                    );
                }
                println!("Deleted project {} (key={})", project_id, normalized);
            }
            Ok(None) => {
                println!("Project key '{}' not found, skipping", normalized);
            }
            Err(e) => {
                eprintln!("Error for key '{}': {}", normalized, e);
                std::process::exit(1);
            }
        }
    }
    Ok(())
}
