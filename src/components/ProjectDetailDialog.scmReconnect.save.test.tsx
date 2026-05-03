import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ProjectDetailDialog } from './ProjectDetailDialog';
import {
  buildBitbucketOAuthStartUrl,
  fetchBitbucketOAuthStatus,
  fetchProjectScmConfig,
  saveProjectScmConfig,
} from '../api/scm';
import { markReturnToProjectDetailsAfterScmOAuth } from '../workspace/storage';
import { useAppDialog } from './dialogs';
import {
  baseProject,
  baseProjectMeta,
  makeDefaultDialogApi,
} from './ProjectDetailDialog.scmReconnect.test.helpers';

vi.mock('../api/scm', () => ({
  buildBitbucketOAuthStartUrl: vi.fn((returnTo: string) => `https://oauth.example/start?returnTo=${encodeURIComponent(returnTo)}`),
  fetchBitbucketBranches: vi.fn().mockResolvedValue({ branches: ['main'], mainbranch: 'main' }),
  fetchBitbucketOAuthStatus: vi.fn(),
  fetchProjectScmConfig: vi.fn(),
  saveProjectScmConfig: vi.fn(),
}));
vi.mock('./dialogs', () => ({ useAppDialog: vi.fn() }));
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', userId: 'u1', email: 'a@b.c', role: 'admin' } }),
}));
vi.mock('../workspace/storage', () => ({
  markReturnToProjectDetailsAfterScmOAuth: vi.fn(),
}));

describe('ProjectDetailDialog SCM dirty save/reconnect', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.mocked(useAppDialog).mockReturnValue(makeDefaultDialogApi() as ReturnType<typeof useAppDialog>);
    try {
      (window.location as unknown as { assign: (url: string) => void }).assign = () => {};
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAppDialog).mockReturnValue(makeDefaultDialogApi() as ReturnType<typeof useAppDialog>);
    sessionStorage.clear();
    document.body.innerHTML = '';
  });

  it('when SCM is dirty and user confirms, saves config then marks return and assigns OAuth URL', async () => {
    vi.mocked(fetchProjectScmConfig).mockResolvedValue({
      provider: 'bitbucket',
      config: { workspace: 'oldWs', repoSlug: 'oldRepo' },
    });
    vi.mocked(fetchBitbucketOAuthStatus).mockResolvedValue({ provider: 'bitbucket', connected: true });

    const confirmMock = vi.fn().mockResolvedValue(true);
    vi.mocked(useAppDialog).mockReturnValue({
      ...makeDefaultDialogApi(),
      confirm: confirmMock,
    } as ReturnType<typeof useAppDialog>);

    const onClose = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ProjectDetailDialog
          project={baseProject}
          projectMeta={baseProjectMeta}
          open={true}
          onClose={onClose}
          scmIntegrationEnabled={true}
        />
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const workspaceInput = container.querySelector('input[placeholder="your-workspace"]') as HTMLInputElement;
    expect(workspaceInput).toBeTruthy();
    expect(workspaceInput.value).toBe('oldWs');
    const setNativeValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setNativeValue?.call(workspaceInput, 'newWs');
      workspaceInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const reconnectButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Reconnect Bitbucket'
    );
    expect(reconnectButton).toBeTruthy();
    await act(async () => {
      reconnectButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Save and reconnect?',
        confirmText: 'Save and reconnect',
      })
    );
    expect(saveProjectScmConfig).toHaveBeenCalledWith('p1', 'bitbucket', {
      workspace: 'newWs',
      repoSlug: 'oldRepo',
    });
    expect(markReturnToProjectDetailsAfterScmOAuth).toHaveBeenCalled();
    expect(buildBitbucketOAuthStartUrl).toHaveBeenCalledWith(window.location.href);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('when SCM is dirty and user cancels confirm, does not save or assign', async () => {
    vi.mocked(fetchProjectScmConfig).mockResolvedValue({
      provider: 'bitbucket',
      config: { workspace: 'ws', repoSlug: 'repo' },
    });
    vi.mocked(fetchBitbucketOAuthStatus).mockResolvedValue({ provider: 'bitbucket', connected: true });

    const confirmMock = vi.fn().mockResolvedValue(false);
    vi.mocked(useAppDialog).mockReturnValue({
      ...makeDefaultDialogApi(),
      confirm: confirmMock,
    } as ReturnType<typeof useAppDialog>);

    const onClose = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ProjectDetailDialog
          project={baseProject}
          projectMeta={baseProjectMeta}
          open={true}
          onClose={onClose}
          scmIntegrationEnabled={true}
        />
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const workspaceInput = container.querySelector('input[placeholder="your-workspace"]') as HTMLInputElement;
    const setNativeValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setNativeValue?.call(workspaceInput, 'otherWs');
      workspaceInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const reconnectButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Reconnect Bitbucket'
    );
    await act(async () => {
      reconnectButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(confirmMock).toHaveBeenCalled();
    expect(saveProjectScmConfig).not.toHaveBeenCalled();
    expect(markReturnToProjectDetailsAfterScmOAuth).not.toHaveBeenCalled();
    expect(buildBitbucketOAuthStartUrl).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
