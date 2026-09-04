mod audit;
mod core;
mod db_backup_settings;
mod entities;
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
mod types;
mod users;
mod wiki_move;
mod wiki_write;

pub use core::Db;
pub use types::{
    AuditLogRecord, EntityWriteError, GroupRecord, ManifestWriteError, ProjectMeta,
    ProjectScmConfigRecord, ScmOAuthStateRecord, SessionRecord, UserMcpApiKeyRecord, UserRecord,
    UserScmCredentialRecord,
};

#[cfg(test)]
pub(crate) use core::DEFAULT_PROJECT_ID;

#[cfg(test)]
mod tests;
