use super::{manifest_named, tmp_db_path};
use crate::infra::db::Db;
use crate::models::{Project, ProjectConfig};

#[test]
fn project_key_lookup_resolves_project_id_and_meta() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    let p = Project {
        id: "pkey".to_string(),
        name: "Project Key".to_string(),
        project_key: Some("ABC".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![],
        config: ProjectConfig {
            manifest: manifest_named("Manifest Key"),
        },
    };
    db.replace_project_state(p).expect("insert project");

    let pid = db
        .get_project_id_by_key("abc")
        .expect("lookup by key")
        .expect("found project id");
    assert_eq!(pid, "pkey");

    let meta = db
        .get_project_meta_by_key("AbC")
        .expect("lookup meta by key")
        .expect("found meta");
    assert_eq!(meta.id, "pkey");
    assert_eq!(meta.name, "Project Key");
    assert_eq!(meta.project_key, "ABC");
}
