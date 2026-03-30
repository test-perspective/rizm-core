use anyhow::Context;

pub(super) struct Config {
    pub(super) db_path: String,
    pub(super) projects: usize,
    pub(super) users: usize,
    pub(super) groups: usize,
    pub(super) avg_tasks_per_project: usize,
    pub(super) avg_wiki_pages_per_project: usize,
    pub(super) wipe: bool,
}

pub(super) fn parse_args(args: &[String]) -> anyhow::Result<Config> {
    let mut db_path = None;
    let mut projects = None;
    let mut users = None;
    let mut groups = None;
    let mut avg_tasks = None;
    let mut avg_wiki = None;
    let mut wipe = false;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--db-path" => {
                if i + 1 >= args.len() {
                    anyhow::bail!("--db-path requires a value");
                }
                db_path = Some(args[i + 1].clone());
                i += 2;
            }
            "--projects" => {
                if i + 1 >= args.len() {
                    anyhow::bail!("--projects requires a value");
                }
                projects = Some(
                    args[i + 1]
                        .parse()
                        .with_context(|| format!("Invalid --projects value: {}", args[i + 1]))?,
                );
                i += 2;
            }
            "--users" => {
                if i + 1 >= args.len() {
                    anyhow::bail!("--users requires a value");
                }
                users = Some(
                    args[i + 1]
                        .parse()
                        .with_context(|| format!("Invalid --users value: {}", args[i + 1]))?,
                );
                i += 2;
            }
            "--groups" => {
                if i + 1 >= args.len() {
                    anyhow::bail!("--groups requires a value");
                }
                groups = Some(
                    args[i + 1]
                        .parse()
                        .with_context(|| format!("Invalid --groups value: {}", args[i + 1]))?,
                );
                i += 2;
            }
            "--avg-tasks-per-project" => {
                if i + 1 >= args.len() {
                    anyhow::bail!("--avg-tasks-per-project requires a value");
                }
                avg_tasks = Some(
                    args[i + 1]
                        .parse()
                        .with_context(|| format!("Invalid --avg-tasks-per-project value: {}", args[i + 1]))?,
                );
                i += 2;
            }
            "--avg-wiki-pages-per-project" => {
                if i + 1 >= args.len() {
                    anyhow::bail!("--avg-wiki-pages-per-project requires a value");
                }
                avg_wiki = Some(
                    args[i + 1]
                        .parse()
                        .with_context(|| format!("Invalid --avg-wiki-pages-per-project value: {}", args[i + 1]))?,
                );
                i += 2;
            }
            "--wipe" => {
                wipe = true;
                i += 1;
            }
            _ => {
                anyhow::bail!("Unknown argument: {}", args[i]);
            }
        }
    }

    Ok(Config {
        db_path: db_path.unwrap_or_else(|| "./data/keel.demo.sqlite3".to_string()),
        projects: projects.unwrap_or(5),
        users: users.unwrap_or(10),
        groups: groups.unwrap_or(3),
        avg_tasks_per_project: avg_tasks.unwrap_or(20),
        avg_wiki_pages_per_project: avg_wiki.unwrap_or(5),
        wipe,
    })
}
