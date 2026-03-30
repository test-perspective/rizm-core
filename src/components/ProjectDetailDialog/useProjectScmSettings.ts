import { useCallback, useEffect, useState } from 'react';
import {
  fetchBitbucketBranches,
  fetchBitbucketOAuthStatus,
  fetchProjectScmConfig,
  saveProjectScmConfig,
} from '../../api/scm';
import { markReturnToProjectDetailsAfterScmOAuth } from '../../workspace/storage';
import { buildBitbucketOAuthStartUrl } from '../../api/scm';
import { useAppDialog } from '../dialogs';
import type { Project } from '../../types';

export type ScmRepoVerifyState = 'idle' | 'checking' | 'ok' | 'error';

export function useProjectScmSettings(
  project: Project | null,
  open: boolean,
  scmIntegrationEnabled: boolean
) {
  const dialog = useAppDialog();
  const [scmWorkspace, setScmWorkspace] = useState('');
  const [scmRepoSlug, setScmRepoSlug] = useState('');
  const [scmConnected, setScmConnected] = useState(false);
  const [scmSaving, setScmSaving] = useState(false);
  const [scmLoading, setScmLoading] = useState(false);
  const [scmConnecting, setScmConnecting] = useState(false);
  const [scmError, setScmError] = useState<string | null>(null);
  const [lastSavedScmWorkspace, setLastSavedScmWorkspace] = useState('');
  const [lastSavedScmRepoSlug, setLastSavedScmRepoSlug] = useState('');
  const [scmRepoVerify, setScmRepoVerify] = useState<ScmRepoVerifyState>('idle');
  const [scmRepoVerifyError, setScmRepoVerifyError] = useState<string | null>(null);

  const runRepoVerification = useCallback(
    async (projectId: string, workspace: string, repoSlug: string, oauthLinked: boolean) => {
      const ws = workspace.trim();
      const slug = repoSlug.trim();
      if (!oauthLinked || !ws || !slug) {
        setScmRepoVerify('idle');
        setScmRepoVerifyError(null);
        return;
      }
      setScmRepoVerify('checking');
      setScmRepoVerifyError(null);
      try {
        await fetchBitbucketBranches(projectId);
        setScmRepoVerify('ok');
      } catch (e) {
        setScmRepoVerify('error');
        const msg = e instanceof Error ? e.message : String(e);
        setScmRepoVerifyError(msg.length > 220 ? `${msg.slice(0, 220)}…` : msg);
      }
    },
    []
  );

  // Depend on project id only — parent often passes a new `project` object reference on each render;
  // re-fetching would overwrite in-progress workspace/repo inputs with server values (REQ-277).
  useEffect(() => {
    if (!open || !project || !scmIntegrationEnabled) return;
    setScmLoading(true);
    setScmError(null);
    Promise.all([fetchProjectScmConfig(project.id), fetchBitbucketOAuthStatus()])
      .then(([config, status]) => {
        const ws = config?.config.workspace ?? '';
        const slug = config?.config.repoSlug ?? '';
        setScmWorkspace(ws);
        setScmRepoSlug(slug);
        setLastSavedScmWorkspace(ws);
        setLastSavedScmRepoSlug(slug);
        setScmConnected(status.connected);
      })
      .catch((e) => {
        console.error('Failed to load SCM settings:', e);
        const msg = e instanceof Error ? e.message : String(e);
        setScmError(`Failed to load SCM settings: ${msg}`);
      })
      .finally(() => setScmLoading(false));
  }, [open, project?.id, scmIntegrationEnabled]);

  useEffect(() => {
    if (!open) {
      setScmRepoVerify('idle');
      setScmRepoVerifyError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !scmIntegrationEnabled || scmLoading) return;
    const pid = project?.id;
    if (!pid) return;
    void runRepoVerification(pid, lastSavedScmWorkspace, lastSavedScmRepoSlug, scmConnected);
  }, [
    open,
    project?.id,
    scmIntegrationEnabled,
    scmLoading,
    lastSavedScmWorkspace,
    lastSavedScmRepoSlug,
    scmConnected,
    runRepoVerification,
  ]);

  const scmDirty =
    open &&
    (scmWorkspace.trim() !== lastSavedScmWorkspace || scmRepoSlug.trim() !== lastSavedScmRepoSlug);

  const handleSaveScmConfig = async () => {
    if (!project) return;
    if (!scmWorkspace.trim() || !scmRepoSlug.trim()) {
      setScmError('Workspace and repo slug are required.');
      return;
    }
    setScmSaving(true);
    setScmError(null);
    try {
      const workspace = scmWorkspace.trim();
      const repoSlug = scmRepoSlug.trim();
      await saveProjectScmConfig(project.id, 'bitbucket', { workspace, repoSlug });
      setLastSavedScmWorkspace(workspace);
      setLastSavedScmRepoSlug(repoSlug);
      await runRepoVerification(project.id, workspace, repoSlug, scmConnected);
    } catch (e) {
      console.error('Failed to save SCM config:', e);
      const msg = e instanceof Error ? e.message : String(e);
      setScmError(`Failed to save SCM config: ${msg}`);
    } finally {
      setScmSaving(false);
    }
  };

  const handleConnectBitbucket = async () => {
    if (!project) return;
    if (!scmWorkspace.trim() || !scmRepoSlug.trim()) {
      setScmError('Workspace and repo slug are required.');
      return;
    }
    const persistedConfig =
      lastSavedScmWorkspace.trim() !== '' && lastSavedScmRepoSlug.trim() !== '';
    const reconnectFlow = scmConnected && persistedConfig;
    if (scmDirty) {
      const confirmed = await dialog.confirm({
        title: reconnectFlow ? 'Save and reconnect?' : 'Save configuration?',
        message: reconnectFlow
          ? 'SCM settings have changed. Save them and continue to Bitbucket?'
          : 'SCM settings have changed. Save workspace and repo, then continue to Bitbucket?',
        confirmText: reconnectFlow ? 'Save and reconnect' : 'Save and continue',
        cancelText: 'Keep editing',
      });
      if (!confirmed) return;
      setScmConnecting(true);
      setScmError(null);
      try {
        const workspace = scmWorkspace.trim();
        const repoSlug = scmRepoSlug.trim();
        await saveProjectScmConfig(project.id, 'bitbucket', { workspace, repoSlug });
        setLastSavedScmWorkspace(workspace);
        setLastSavedScmRepoSlug(repoSlug);
        await runRepoVerification(project.id, workspace, repoSlug, scmConnected);
      } catch (e) {
        console.error('Failed to save SCM config:', e);
        const msg = e instanceof Error ? e.message : String(e);
        setScmError(`Failed to save SCM config: ${msg}`);
        setScmConnecting(false);
        return;
      }
      setScmConnecting(false);
    }
    markReturnToProjectDetailsAfterScmOAuth();
    const returnTo = window.location.href;
    const url = buildBitbucketOAuthStartUrl(returnTo);
    window.location.assign(url);
  };

  const hasSavedRepoConfig =
    lastSavedScmWorkspace.trim() !== '' && lastSavedScmRepoSlug.trim() !== '';

  return {
    scmWorkspace,
    setScmWorkspace,
    scmRepoSlug,
    setScmRepoSlug,
    scmConnected,
    scmSaving,
    scmLoading,
    scmConnecting,
    scmError,
    lastSavedScmWorkspace,
    lastSavedScmRepoSlug,
    hasSavedRepoConfig,
    scmRepoVerify,
    scmRepoVerifyError,
    handleSaveScmConfig,
    handleConnectBitbucket,
  };
}
