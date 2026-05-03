import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ProjectDetailDialog } from './ProjectDetailDialog';
import {
  buildBitbucketOAuthStartUrl,
  fetchBitbucketOAuthStatus,
  fetchProjectScmConfig,
} from '../api/scm';
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

describe('ProjectDetailDialog SCM connect UI states', () => {
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

  it('does not refetch SCM config or clear workspace input when project object reference changes (same id)', async () => {
    vi.mocked(fetchProjectScmConfig).mockResolvedValue({
      provider: 'bitbucket',
      config: { workspace: 'savedWs', repoSlug: 'savedRepo' },
    });
    vi.mocked(fetchBitbucketOAuthStatus).mockResolvedValue({ provider: 'bitbucket', connected: false });

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
    expect(workspaceInput.value).toBe('savedWs');
    const setNativeValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setNativeValue?.call(workspaceInput, 'typing-workspace');
      workspaceInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(fetchProjectScmConfig).toHaveBeenCalledTimes(1);

    const projectNewRef = { ...baseProject, updatedAt: 999 };
    await act(async () => {
      root.render(
        <ProjectDetailDialog
          project={projectNewRef}
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

    expect(fetchProjectScmConfig).toHaveBeenCalledTimes(1);
    expect(workspaceInput.value).toBe('typing-workspace');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows Connect Bitbucket when account is linked but no workspace/repo saved on the project', async () => {
    vi.mocked(fetchProjectScmConfig).mockResolvedValue(null);
    vi.mocked(fetchBitbucketOAuthStatus).mockResolvedValue({ provider: 'bitbucket', connected: true });

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

    const connectBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Connect Bitbucket'
    );
    expect(connectBtn).toBeTruthy();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows Reconnect Bitbucket when account is linked and workspace/repo are saved', async () => {
    vi.mocked(fetchProjectScmConfig).mockResolvedValue({
      provider: 'bitbucket',
      config: { workspace: 'w', repoSlug: 'r' },
    });
    vi.mocked(fetchBitbucketOAuthStatus).mockResolvedValue({ provider: 'bitbucket', connected: true });

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

    const reconnectBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Reconnect Bitbucket'
    );
    expect(reconnectBtn).toBeTruthy();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('when SCM workspace and repo are empty, shows error and does not assign', async () => {
    vi.mocked(fetchProjectScmConfig).mockResolvedValue(null);
    vi.mocked(fetchBitbucketOAuthStatus).mockResolvedValue({ provider: 'bitbucket', connected: false });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ProjectDetailDialog
          project={baseProject}
          projectMeta={baseProjectMeta}
          open={true}
          onClose={vi.fn()}
          scmIntegrationEnabled={true}
        />
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const connectButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Connect Bitbucket'
    );
    await act(async () => {
      connectButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Workspace and repo slug are required.');
    expect(buildBitbucketOAuthStartUrl).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
