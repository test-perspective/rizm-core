use std::path::{Path as FsPath, PathBuf};

use anyhow::Context;
use uuid::Uuid;

use super::meta::AttachmentMeta;

pub(crate) fn attachments_root_from_db_path(db_path: &str) -> PathBuf {
    let p = FsPath::new(db_path);
    let parent = p.parent().filter(|pp| !pp.as_os_str().is_empty());
    match parent {
        Some(dir) => dir.join("attachments"),
        None => FsPath::new(".").join("attachments"),
    }
}

pub(super) fn shard_dir(attachment_id: &str) -> String {
    attachment_id
        .chars()
        .take(2)
        .collect::<String>()
        .to_lowercase()
}

pub(crate) fn attachment_path(root: &FsPath, project_id: &str, attachment_id: &str) -> PathBuf {
    root.join(project_id)
        .join(shard_dir(attachment_id))
        .join(attachment_id)
}

/// Remove all attachment files for a project from disk. Best-effort; returns Ok if dir does not exist.
pub fn delete_project_attachments_dir(db_path: &str, project_id: &str) -> anyhow::Result<()> {
    let root = attachments_root_from_db_path(db_path);
    let dir = root.join(project_id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).context("remove project attachments dir")?;
    }
    Ok(())
}

/// Minimal header-safety: strip quote / CR / LF from filenames.
pub(super) fn sanitize_filename(name: &str) -> String {
    name.replace('"', "_").replace('\r', "_").replace('\n', "_")
}

/// Same on-disk layout as multipart upload (`attachments/{projectId}/...`).
pub(crate) fn write_import_attachment_bytes(
    db_path: &str,
    project_id: &str,
    file_name: &str,
    mime_type: Option<String>,
    bytes: &[u8],
) -> Result<AttachmentMeta, std::io::Error> {
    let file_name = sanitize_filename(file_name);
    if bytes.is_empty() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "empty attachment",
        ));
    }
    let attachment_id = Uuid::new_v4().to_string();
    let root = attachments_root_from_db_path(db_path);
    let path = attachment_path(&root, project_id, &attachment_id);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, bytes)?;
    let size = bytes.len() as i64;
    Ok(AttachmentMeta {
        id: attachment_id,
        file_name,
        mime_type,
        size,
        created_at: crate::time::now_ms(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delete_project_attachments_dir_removes_dir() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("keel.sqlite3");
        let root = attachments_root_from_db_path(db_path.to_str().unwrap());
        let project_dir = root.join("proj-123").join("ab");
        std::fs::create_dir_all(&project_dir).expect("create dir");
        let file_path = project_dir.join("attachment-uuid");
        std::fs::write(&file_path, b"content").expect("write file");
        assert!(file_path.exists());

        delete_project_attachments_dir(db_path.to_str().unwrap(), "proj-123").expect("delete");
        assert!(!root.join("proj-123").exists());
    }

    #[test]
    fn delete_project_attachments_dir_ok_when_dir_missing() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("keel.sqlite3");
        let result = delete_project_attachments_dir(db_path.to_str().unwrap(), "nonexistent");
        assert!(result.is_ok());
    }
}
