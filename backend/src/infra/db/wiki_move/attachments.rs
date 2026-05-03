//! Cross-project attachment file copy / delete used during a wiki subtree move.

use anyhow::Context;
use std::collections::HashMap;

use crate::api::attachments_api::{
    attachment_path, attachments_root_from_db_path, read_attachments_from_entity,
};
use crate::models::Entity;

pub(super) fn copy_attachment_files_for_wiki_subtree(
    db_path: &str,
    from_project: &str,
    to_project: &str,
    wiki_by_id: &HashMap<String, Entity>,
    subtree_ids: &[String],
) -> anyhow::Result<()> {
    if from_project == to_project {
        return Ok(());
    }
    let root = attachments_root_from_db_path(db_path);
    for page_id in subtree_ids {
        let Some(e) = wiki_by_id.get(page_id) else {
            continue;
        };
        for meta in read_attachments_from_entity(e) {
            let src = attachment_path(&root, from_project, &meta.id);
            let dst = attachment_path(&root, to_project, &meta.id);
            if !src.exists() {
                continue;
            }
            if let Some(parent) = dst.parent() {
                std::fs::create_dir_all(parent).with_context(|| format!("create {:?}", parent))?;
            }
            if dst.exists() {
                anyhow::bail!("attachment destination already exists");
            }
            std::fs::copy(&src, &dst).with_context(|| format!("copy {:?} -> {:?}", src, dst))?;
        }
    }
    Ok(())
}

pub(super) fn delete_attachment_files_for_project(
    db_path: &str,
    project_id: &str,
    wiki_by_id: &HashMap<String, Entity>,
    subtree_ids: &[String],
) {
    let root = attachments_root_from_db_path(db_path);
    for page_id in subtree_ids {
        let Some(e) = wiki_by_id.get(page_id) else {
            continue;
        };
        for meta in read_attachments_from_entity(e) {
            let src = attachment_path(&root, project_id, &meta.id);
            let _ = std::fs::remove_file(src);
        }
    }
}
