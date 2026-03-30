use thiserror::Error;

// --- Errors for optimistic locking ---

#[derive(Debug, Error)]
pub enum EntityWriteError {
    #[error("not found")]
    NotFound,
    #[error("conflict")]
    Conflict { current_updated_at: i64 },
    /// Pool timeout / DB temporarily unavailable — must not be mapped to HTTP 404.
    #[error("service unavailable")]
    ServiceUnavailable,
}

#[derive(Debug, Error)]
pub enum ManifestWriteError {
    #[error("not found")]
    NotFound,
    #[error("conflict")]
    Conflict { current_etag: String },
}

#[derive(Debug, Clone)]
pub struct UserRecord {
    pub id: String,
    pub email: String,
    pub password_hash: Option<String>,
    pub role: String,
    pub is_disabled: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub last_login_at: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct UserMcpApiKeyRecord {
    pub user_id: String,
    pub token_hash: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub last_used_at: Option<i64>,
    pub revoked_at: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct SessionRecord {
    pub id: String,
    pub user_id: String,
    pub created_at: i64,
    pub expires_at: i64,
    pub last_seen_at: i64,
    pub user_agent: Option<String>,
    pub ip: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AuditLogRecord {
    pub id: String,
    pub actor_user_id: Option<String>,
    pub action: String,
    pub target_user_id: Option<String>,
    pub meta_json: Option<String>,
    pub created_at: i64,
    pub is_activity: bool,
}

#[derive(Debug, Clone)]
pub struct ProjectMeta {
    pub id: String,
    pub name: String,
    pub project_key: String,
    pub lifecycle_status: String,
}

#[derive(Debug, Clone)]
pub struct ProjectScmConfigRecord {
    pub project_id: String,
    pub provider: String,
    pub config_json: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone)]
pub struct UserScmCredentialRecord {
    pub id: String,
    pub user_id: String,
    pub provider: String,
    pub token_json: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone)]
pub struct ScmOAuthStateRecord {
    pub id: String,
    pub user_id: String,
    pub provider: String,
    pub state: String,
    pub code_verifier: String,
    pub return_to: String,
    pub expires_at: i64,
}

#[derive(Debug, Clone)]
pub struct GroupRecord {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

