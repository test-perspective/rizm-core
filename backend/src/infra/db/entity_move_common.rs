//! Helpers shared by cross-project entity moves (wiki subtree move, task move).
//!
//! Both movers have to relocate the attachment blobs that live under
//! `attachments/{projectId}/...` and rewrite the project id embedded in
//! attachment URLs stored inside rich-text documents.

use anyhow::Context;
use std::collections::HashMap;
use std::path::PathBuf;

use crate::api::attachments_api::{
    attachment_path, attachments_root_from_db_path, read_attachments_from_entity,
};
use crate::models::Entity;

/// Rewrite the project id inside attachment URLs embedded in a rich-text document.
///
/// Attachment URLs are stored as `/api/projects/{projectId}/entities/...`, so a
/// cross-project move leaves them pointing at the old project (whose blobs are
/// deleted afterwards) unless they are rewritten.
pub(crate) fn rewrite_project_in_attachment_urls(
    s: &str,
    from_proj: &str,
    to_proj: &str,
) -> String {
    if from_proj == to_proj {
        return s.to_string();
    }
    let from_pat = format!("/api/projects/{}/entities/", from_proj);
    let to_pat = format!("/api/projects/{}/entities/", to_proj);
    s.replace(&from_pat, &to_pat)
}

/// Copy the attachment blobs of `entity_ids` from one project directory to another.
///
/// Returns the destination paths that were created so the caller can roll them
/// back if a later step (the move transaction itself) fails. Partial work is
/// cleaned up before returning an error.
pub(crate) fn copy_attachment_files_for_entities(
    db_path: &str,
    from_project: &str,
    to_project: &str,
    entities_by_id: &HashMap<String, Entity>,
    entity_ids: &[String],
) -> anyhow::Result<Vec<PathBuf>> {
    if from_project == to_project {
        return Ok(vec![]);
    }
    let root = attachments_root_from_db_path(db_path);
    let mut created: Vec<PathBuf> = vec![];

    for entity_id in entity_ids {
        let Some(e) = entities_by_id.get(entity_id) else {
            continue;
        };
        for meta in read_attachments_from_entity(e) {
            let src = attachment_path(&root, from_project, &meta.id);
            let dst = attachment_path(&root, to_project, &meta.id);
            if !src.exists() {
                continue;
            }
            let step = (|| -> anyhow::Result<()> {
                if let Some(parent) = dst.parent() {
                    std::fs::create_dir_all(parent)
                        .with_context(|| format!("create {:?}", parent))?;
                }
                if dst.exists() {
                    anyhow::bail!("attachment destination already exists");
                }
                std::fs::copy(&src, &dst)
                    .with_context(|| format!("copy {:?} -> {:?}", src, dst))?;
                Ok(())
            })();
            match step {
                Ok(()) => created.push(dst),
                Err(e) => {
                    remove_copied_attachment_files(&created);
                    return Err(e);
                }
            }
        }
    }
    Ok(created)
}

/// Best-effort removal of files produced by `copy_attachment_files_for_entities`.
pub(crate) fn remove_copied_attachment_files(paths: &[PathBuf]) {
    for p in paths {
        let _ = std::fs::remove_file(p);
    }
}

/// Best-effort removal of the source-side blobs after a successful move.
pub(crate) fn delete_attachment_files_for_project(
    db_path: &str,
    project_id: &str,
    entities_by_id: &HashMap<String, Entity>,
    entity_ids: &[String],
) {
    let root = attachments_root_from_db_path(db_path);
    for entity_id in entity_ids {
        let Some(e) = entities_by_id.get(entity_id) else {
            continue;
        };
        for meta in read_attachments_from_entity(e) {
            let src = attachment_path(&root, project_id, &meta.id);
            let _ = std::fs::remove_file(src);
        }
    }
}

/// Deletes freshly copied attachment blobs when dropped, unless `disarm` was called.
///
/// Lets a mover use `?` freely between the copy step and the commit without
/// leaking half-copied files into the destination project.
pub(crate) struct CopiedAttachmentsGuard {
    paths: Vec<PathBuf>,
    armed: bool,
}

impl CopiedAttachmentsGuard {
    pub(crate) fn new(paths: Vec<PathBuf>) -> Self {
        Self { paths, armed: true }
    }

    /// Call once the move is committed and the copies must be kept.
    pub(crate) fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for CopiedAttachmentsGuard {
    fn drop(&mut self) {
        if self.armed {
            remove_copied_attachment_files(&self.paths);
        }
    }
}
