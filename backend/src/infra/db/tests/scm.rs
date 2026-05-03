use super::{manifest_named, tmp_db_path};
use crate::infra::db::Db;
use crate::models::{Project, ProjectConfig};

#[test]
fn scm_config_and_credentials_round_trip() {
    let (_dir, db_path) = tmp_db_path();
    let db = Db::new(&db_path).expect("create db");

    let project_id = "psc1";
    let p = Project {
        id: project_id.to_string(),
        name: "Project SCM".to_string(),
        project_key: Some("PSC".to_string()),
        lifecycle_status: Some("ready".to_string()),
        created_at: 1,
        updated_at: 1,
        entities: vec![],
        config: ProjectConfig {
            manifest: manifest_named("Manifest SCM"),
        },
    };
    db.replace_project_state(p).expect("insert project");

    let config_json = serde_json::json!({
        "workspace": "example",
        "repo_slug": "demo",
    })
    .to_string();

    db.set_project_scm_config(project_id, "bitbucket", &config_json)
        .expect("set project scm config");
    let cfg = db
        .get_project_scm_config(project_id, "bitbucket")
        .expect("get project scm config")
        .expect("config exists");
    assert_eq!(cfg.project_id, project_id);
    assert_eq!(cfg.provider, "bitbucket");
    assert_eq!(cfg.config_json, config_json);
    let user = db
        .create_local_user("user1@test.local", "editor", "dummy_hash")
        .expect("create user");
    let token_json = serde_json::json!({
        "accessToken": "token-123",
        "obtainedAt": 123
    })
    .to_string();
    db.set_user_scm_credential(&user.id, "bitbucket", &token_json)
        .expect("set user scm credential");
    let cred = db
        .get_user_scm_credential(&user.id, "bitbucket")
        .expect("get user scm credential")
        .expect("credential exists");
    assert_eq!(cred.user_id, user.id);
    assert_eq!(cred.provider, "bitbucket");
    assert_eq!(cred.token_json, token_json);
}
