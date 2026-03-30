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

vi.mock('../api/scm', () => ({
  buildBitbucketOAuthStartUrl: vi.fn((returnTo: string) => `https://oauth.example/start?returnTo=${encodeURIComponent(returnTo)}`),
  fetchBitbucketBranches: vi.fn().mockResolvedValue({ branches: ['main'], mainbranch: 'main' }),
  fetchBitbucketOAuthStatus: vi.fn(),
  fetchProjectScmConfig: vi.fn(),
  saveProjectScmConfig: vi.fn(),
}));

vi.mock('./dialogs', () => ({
  useAppDialog: vi.fn(),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', userId: 'u1', email: 'a@b.c', role: 'admin' } }),
}));

vi.mock('../workspace/storage', () => ({
  markReturnToProjectDetailsAfterScmOAuth: vi.fn(),
}));

const baseProject = {
  id: 'p1',
  name: 'My Project',
  projectKey: 'MP',
  createdAt: 1,
  updatedAt: 2,
  entities: [],
  config: {
    manifest: {
      name: 'My Project',
      entities: [],
      views: [],
      defaultView: 'board',
    },
  },
};
const baseProjectMeta = {
  id: 'p1',
  name: 'My Project',
  projectKey: 'MP',
  createdAt: 1,
  updatedAt: 2,
};

describe('ProjectDetailDialog SCM reconnect and dirty', () => {
  function makeDefaultDialogApi() {
    return {
      confirm: vi.fn().mockResolvedValue(false),
      alert: vi.fn(),
      prompt: vi.fn().mockResolvedValue(null as string | null),
    };
  }

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.mocked(useAppDialog).mockReturnValue(makeDefaultDialogApi() as ReturnType<typeof useAppDialog>);
    try {
      (window.location as unknown as { assign: (url: string) => void }).assign = () => {};
    } catch {
      // ignore if location.assign is read-only
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

  it('when dirty and user clicks X then cancels discard, onClose is not called', async () => {
    vi.mocked(fetchProjectScmConfig).mockResolvedValue({
      provider: 'bitbucket',
      config: { workspace: 'ws', repoSlug: 'repo' },
    });
    vi.mocked(fetchBitbucketOAuthStatus).mockResolvedValue({ provider: 'bitbucket', connected: false });

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
      setNativeValue?.call(workspaceInput, 'changed');
      workspaceInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const closeButton = container.querySelector('button[class*="hover:text-white"]');
    expect(closeButton).toBeTruthy();
    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Discard changes?',
        cancelText: 'Keep editing',
      })
    );
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('calls onClose when user presses Escape and not dirty', async () => {
    vi.mocked(fetchProjectScmConfig).mockResolvedValue({
      provider: 'bitbucket',
      config: { workspace: 'ws', repoSlug: 'repo' },
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

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await Promise.resolve();
    });

    expect(onClose).toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('when dirty and user presses Escape then confirms discard, onClose is called', async () => {
    vi.mocked(fetchProjectScmConfig).mockResolvedValue({
      provider: 'bitbucket',
      config: { workspace: 'ws', repoSlug: 'repo' },
    });
    vi.mocked(fetchBitbucketOAuthStatus).mockResolvedValue({ provider: 'bitbucket', connected: false });

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
    const setNativeValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setNativeValue?.call(workspaceInput, 'changed');
      workspaceInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(confirmMock).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('when dirty and user presses Escape then cancels discard, onClose is not called', async () => {
    vi.mocked(fetchProjectScmConfig).mockResolvedValue({
      provider: 'bitbucket',
      config: { workspace: 'ws', repoSlug: 'repo' },
    });
    vi.mocked(fetchBitbucketOAuthStatus).mockResolvedValue({ provider: 'bitbucket', connected: false });

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
      setNativeValue?.call(workspaceInput, 'changed');
      workspaceInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(confirmMock).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('does not call onClose when user clicks the backdrop (avoids closing during text drag-select)', async () => {
    vi.mocked(fetchProjectScmConfig).mockResolvedValue({
      provider: 'bitbucket',
      config: { workspace: 'ws', repoSlug: 'repo' },
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

    const backdrop = container.querySelector('.fixed.inset-0');
    expect(backdrop).toBeTruthy();
    await act(async () => {
      backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('does not call onClose or discard confirm when dirty user clicks the backdrop', async () => {
    vi.mocked(fetchProjectScmConfig).mockResolvedValue({
      provider: 'bitbucket',
      config: { workspace: 'ws', repoSlug: 'repo' },
    });
    vi.mocked(fetchBitbucketOAuthStatus).mockResolvedValue({ provider: 'bitbucket', connected: false });

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
    const setNativeValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setNativeValue?.call(workspaceInput, 'changed');
      workspaceInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const backdrop = container.querySelector('.fixed.inset-0');
    await act(async () => {
      backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(confirmMock).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
