import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ProjectDetailDialog } from './ProjectDetailDialog';
import { fetchBitbucketOAuthStatus, fetchProjectScmConfig } from '../api/scm';
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

describe('ProjectDetailDialog close / Escape / backdrop behavior', () => {
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

  async function mountDirty(root: ReturnType<typeof createRoot>, onClose: () => void) {
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
  }

  async function makeDirty(container: HTMLElement) {
    const workspaceInput = container.querySelector('input[placeholder="your-workspace"]') as HTMLInputElement;
    const setNativeValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setNativeValue?.call(workspaceInput, 'changed');
      workspaceInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

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
    await mountDirty(root, onClose);
    await makeDirty(container);

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
    await mountDirty(root, onClose);

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
    await mountDirty(root, onClose);
    await makeDirty(container);

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
    await mountDirty(root, onClose);
    await makeDirty(container);

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
    await mountDirty(root, onClose);

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
    await mountDirty(root, onClose);
    await makeDirty(container);

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
