import { useEffect, useState } from 'react';
import { ApiError } from '../../auth/api';
import { isBackendEnabled } from '../../utils/storage';
import {
  clearManifestHistory,
  deleteManifestVersion,
  fetchManifestVersions,
  ManifestVersionSummary,
  revertManifestVersion,
} from './api';

type UseManifestHistoryParams = {
  projectId: string;
  onReload: () => Promise<void> | void;
  onCloseCommandBar: () => void;
  dialog: { alert: (opts: { title?: string; message: string }) => Promise<void>; confirm: (opts: { title: string; message: string; confirmText: string; danger?: boolean }) => Promise<boolean> };
};

export function useManifestHistory({
  projectId,
  onReload,
  onCloseCommandBar,
  dialog,
}: UseManifestHistoryParams) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<ManifestVersionSummary[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!historyOpen) return;
    let cancelled = false;
    (async () => {
      setLoadingVersions(true);
      try {
        const data = await fetchManifestVersions(projectId);
        if (!cancelled) setVersions(data);
      } catch (e) {
        console.error('[manifest] failed to load versions', e);
        if (!cancelled) setVersions([]);
      } finally {
        if (!cancelled) setLoadingVersions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [historyOpen, projectId]);

  const handleRevert = async (versionId: string) => {
    if (!isBackendEnabled()) {
      await dialog.alert({ message: 'Backend is disabled (VITE_KEEL_BACKEND_URL).' });
      return;
    }
    const ok = await dialog.confirm({
      title: 'Revert Manifest',
      message: 'Are you sure you want to revert to this manifest version?',
      confirmText: 'Revert',
    });
    if (!ok) return;

    setRevertingId(versionId);
    try {
      await revertManifestVersion(projectId, versionId);
      await onReload();
      setHistoryOpen(false);
      onCloseCommandBar();
    } catch (e) {
      console.error('[manifest] revert failed', e);
      if (e instanceof ApiError && e.status === 403) {
        await dialog.alert({ message: 'Permission denied (viewers cannot revert).' });
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      await dialog.alert({ title: 'Revert Failed', message: msg });
    } finally {
      setRevertingId(null);
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    if (!isBackendEnabled()) {
      await dialog.alert({ message: 'Backend is disabled (VITE_KEEL_BACKEND_URL).' });
      return;
    }
    const ok = await dialog.confirm({
      title: 'Delete Version',
      message: 'Are you sure you want to delete this version?',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;

    setDeletingId(versionId);
    try {
      await deleteManifestVersion(projectId, versionId);
      const data = await fetchManifestVersions(projectId);
      setVersions(data);
    } catch (e) {
      console.error('[manifest] delete version failed', e);
      if (e instanceof ApiError && e.status === 403) {
        await dialog.alert({ message: 'Permission denied (viewers cannot delete).' });
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      await dialog.alert({ title: 'Delete Failed', message: msg });
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearHistory = async () => {
    if (!isBackendEnabled()) {
      await dialog.alert({ message: 'Backend is disabled (VITE_KEEL_BACKEND_URL).' });
      return;
    }
    const ok = await dialog.confirm({
      title: 'Clear History',
      message: 'Are you sure you want to delete all history?',
      confirmText: 'Delete All',
      danger: true,
    });
    if (!ok) return;

    try {
      await clearManifestHistory(projectId);
      const data = await fetchManifestVersions(projectId);
      setVersions(data);
    } catch (e) {
      console.error('[manifest] clear history failed', e);
      if (e instanceof ApiError && e.status === 403) {
        await dialog.alert({ message: 'Permission denied (viewers cannot delete).' });
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      await dialog.alert({ title: 'Delete Failed', message: msg });
    }
  };

  return {
    historyOpen,
    setHistoryOpen,
    versions,
    loadingVersions,
    revertingId,
    deletingId,
    handleRevert,
    handleDeleteVersion,
    handleClearHistory,
  };
}

