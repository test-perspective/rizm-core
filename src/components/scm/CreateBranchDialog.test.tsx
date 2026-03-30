import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CreateBranchDialog } from './CreateBranchDialog';
import { createBitbucketBranch, fetchBitbucketBranches } from '../../api/scm';

vi.mock('../../api/scm', () => ({
  fetchBitbucketBranches: vi.fn(),
  createBitbucketBranch: vi.fn(),
}));

describe('CreateBranchDialog', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('keeps dialog open and shows error when card update fails', async () => {
    const fetchBranchesMock = vi.mocked(fetchBitbucketBranches);
    const createBranchMock = vi.mocked(createBitbucketBranch);
    fetchBranchesMock.mockResolvedValue({ branches: ['main', 'develop'] });
    createBranchMock.mockResolvedValue({ name: 'feature/PROJ-1-task-title', url: 'https://example.local/branch' });

    const onClose = vi.fn();
    const onCreated = vi.fn().mockResolvedValue(false);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CreateBranchDialog
          open={true}
          onClose={onClose}
          projectId="p1"
          entity={{
            id: 'e1',
            entityId: 'task',
            createdAt: 1,
            updatedAt: 1,
            properties: { taskKey: 'PROJ-1', title: 'Task title' },
          }}
          scmConfig={{ provider: 'bitbucket', config: { workspace: 'ws', repoSlug: 'repo' } }}
          onCreated={onCreated}
        />
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const createButton = Array.from(document.body.querySelectorAll('button')).find((btn) => btn.textContent?.trim() === 'Create');
    expect(createButton).not.toBeUndefined();

    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Branch was created, but failed to update the card. Please reload and try again.');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('stays open on success, shows Branch created. and git fetch/checkout commands', async () => {
    const fetchBranchesMock = vi.mocked(fetchBitbucketBranches);
    const createBranchMock = vi.mocked(createBitbucketBranch);
    fetchBranchesMock.mockResolvedValue({ branches: ['main', 'develop'] });
    createBranchMock.mockResolvedValue({
      name: 'feature/PROJ-1-task-title',
      url: 'https://example.local/repo/branch/feature/PROJ-1-task-title',
    });

    const onClose = vi.fn();
    const onCreated = vi.fn().mockResolvedValue(true);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CreateBranchDialog
          open={true}
          onClose={onClose}
          projectId="p1"
          entity={{
            id: 'e1',
            entityId: 'task',
            createdAt: 1,
            updatedAt: 1,
            properties: { taskKey: 'PROJ-1', title: 'Task title' },
          }}
          scmConfig={{ provider: 'bitbucket', config: { workspace: 'ws', repoSlug: 'repo' } }}
          onCreated={onCreated}
        />
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const createButton = Array.from(document.body.querySelectorAll('button')).find((btn) => btn.textContent?.trim() === 'Create');
    expect(createButton).not.toBeUndefined();

    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Branch created.');
    expect(document.body.textContent).toContain('git fetch origin');
    expect(document.body.textContent).toContain('git checkout -b feature/PROJ-1-task-title --track origin/feature/PROJ-1-task-title');
    expect(document.body.textContent).toContain('Bash / Zsh');
    expect(document.body.textContent).toContain('PowerShell');
    expect(document.body.textContent).toContain('cmd.exe');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
