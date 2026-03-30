import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CreatePullRequestDialog } from './CreatePullRequestDialog';
import { createBitbucketPullRequest, fetchBitbucketBranches } from '../../api/scm';

vi.mock('../../api/scm', () => ({
  fetchBitbucketBranches: vi.fn(),
  createBitbucketPullRequest: vi.fn(),
}));

describe('CreatePullRequestDialog', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('keeps dialog open and shows error when card update fails', async () => {
    const fetchBranchesMock = vi.mocked(fetchBitbucketBranches);
    const createPrMock = vi.mocked(createBitbucketPullRequest);
    fetchBranchesMock.mockResolvedValue({ branches: ['main', 'develop'] });
    createPrMock.mockResolvedValue({ id: '1', title: 'PR title', url: 'https://example.local/pr/1' });

    const onClose = vi.fn();
    const onCreated = vi.fn().mockResolvedValue(false);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CreatePullRequestDialog
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
          sourceBranch="feature/PROJ-1-task-title"
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
    expect(document.body.textContent).toContain('Pull request was created, but failed to update the card. Please reload and try again.');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
