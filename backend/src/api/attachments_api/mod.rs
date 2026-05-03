//! Attachment upload / download / delete endpoints.
//!
//! Split across submodules:
//!   - `meta`     : `AttachmentMeta`, entity-attachment helpers
//!   - `storage`  : on-disk layout helpers + bulk operations
//!   - `handlers` : Axum route handlers
//!
//! Re-exports keep the historical `crate::api::attachments_api::X` paths stable.

use axum::{
    extract::DefaultBodyLimit,
    routing::{get, post},
    Router,
};

use crate::app_state::AppState;

mod handlers;
mod meta;
mod storage;

pub use meta::AttachmentMeta;
pub(crate) use meta::read_attachments_from_entity;
pub use storage::delete_project_attachments_dir;
pub(crate) use storage::{
    attachment_path, attachments_root_from_db_path, write_import_attachment_bytes,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/projects/:project_id/entities/:entity_pk/attachments",
            post(handlers::upload_attachments).get(handlers::list_attachments),
        )
        .route(
            "/api/projects/:project_id/entities/:entity_pk/attachments/:attachment_id",
            get(handlers::get_attachment).delete(handlers::delete_attachment),
        )
        // Allow larger uploads (videos, PDFs, etc). Stored streaming to disk.
        .layer(DefaultBodyLimit::max(512 * 1024 * 1024))
}
