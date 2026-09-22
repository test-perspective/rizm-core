mod audit;
mod core;
mod db_backup_settings;
mod entities;
mod entity_move_common;
mod groups;
mod import;
mod instance_banner;
mod manifests;
mod mcp_api_keys;
mod policies;
mod projects;
mod scm;
mod sessions;
mod state;
mod system_info;
mod task_move;
mod types;
mod users;
mod wiki_move;
mod wiki_write;

pub use core::Db;
pub use task_move::{DetachedRelation, MoveTasksOutcome, MovedTask};
pub use types::{
    AuditLogRecord, EntityWriteError, GroupRecord, ManifestWriteError, ProjectMeta,
    ProjectScmConfigRecord, ScmOAuthStateRecord, SessionRecord, UserMcpApiKeyRecord, UserRecord,
    UserScmCredentialRecord,
};

#[cfg(test)]
pub(crate) use core::DEFAULT_PROJECT_ID;

#[cfg(test)]
mod tests;
