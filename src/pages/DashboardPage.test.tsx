import React from 'react';
import { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate,
}));

// Hoisted so the vi.mock factory, which runs before module-level consts, can read it.
const { FakeEntityNotInProjectError } = vi.hoisted(() => ({
  FakeEntityNotInProjectError: class extends Error {},
}));
const navigateToWorkspaceEntity = vi.fn<(args: Record<string, unknown>) => Promise<void>>();
vi.mock('../workspace/entityRouting', () => ({
  navigateToWorkspaceEntity: (args: Record<string, unknown>) => navigateToWorkspaceEntity(args),
  EntityNotInProjectError: FakeEntityNotInProjectError,
}));

const apiJson = vi.fn();
vi.mock('../auth/api', () => ({
  apiJson: (path: string) => apiJson(path),
}));

import { DashboardPage } from './DashboardPage';

const child = (over: Partial<{ id: string; action: string; createdAt: number }> = {}) => ({
  id: 'c1',
  action: 'TASK_UPDATED',
  createdAt: 100,
  actorUserId: 'u2',
  actorUserEmail: 'other@example.local',
  ...over,
});

const feed = (
  items: Array<{
    key: string;
    entityType: string;
    entityId: string;
    entityTitle: string;
    children: ReturnType<typeof child>[];
  }>
) => ({
  sections: [
    {
      id: 'all',
      title: 'Other Updates',
      items: items.map((i) => ({ projectId: 'p1', projectName: 'Project One', ...i })),
    },
  ],
});

function renderInDocument() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<DashboardPage />);
  });
  return { container, root };
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const titleButton = (container: HTMLElement, title: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === title);

describe('DashboardPage', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    navigateToWorkspaceEntity.mockResolvedValue(undefined);
  });

  it('opens a task row as a task', async () => {
    apiJson.mockResolvedValue(
      feed([{ key: 'k1', entityType: 'TASK', entityId: 'e1', entityTitle: 'REQ-321', children: [child()] }])
    );
    const { container } = renderInDocument();
    await flush();

    const btn = titleButton(container, 'REQ-321');
    expect(btn).toBeTruthy();
    await act(async () => {
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(navigateToWorkspaceEntity).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'task', projectId: 'p1', entityPk: 'e1', verifyEntityExists: true })
    );
  });

  it('opens a wiki row as a page', async () => {
    apiJson.mockResolvedValue(
      feed([
        {
          key: 'k2',
          entityType: 'WIKI',
          entityId: 'w1',
          entityTitle: 'Design Notes',
          children: [child({ action: 'WIKI_UPDATED' })],
        },
      ])
    );
    const { container } = renderInDocument();
    await flush();

    await act(async () => {
      titleButton(container, 'Design Notes')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(navigateToWorkspaceEntity).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'page', projectId: 'p1', entityPk: 'w1' })
    );
  });

  it('does not link a row whose latest action is a deletion', async () => {
    apiJson.mockResolvedValue(
      feed([
        {
          key: 'k3',
          entityType: 'TASK',
          entityId: 'e2',
          entityTitle: 'Gone Task',
          children: [child({ id: 'c2', action: 'TASK_DELETED', createdAt: 200 }), child({ createdAt: 100 })],
        },
      ])
    );
    const { container } = renderInDocument();
    await flush();

    expect(titleButton(container, 'Gone Task')).toBeUndefined();
    expect(container.textContent).toContain('Gone Task');
  });

  it('keeps linking when a deletion is not the latest action', async () => {
    apiJson.mockResolvedValue(
      feed([
        {
          key: 'k4',
          entityType: 'TASK',
          entityId: 'e3',
          entityTitle: 'Revived Task',
          children: [child({ createdAt: 300 }), child({ id: 'c2', action: 'TASK_DELETED', createdAt: 200 })],
        },
      ])
    );
    const { container } = renderInDocument();
    await flush();

    expect(titleButton(container, 'Revived Task')).toBeTruthy();
  });

  it('leaves the details row collapsed when the title is clicked', async () => {
    apiJson.mockResolvedValue(
      feed([{ key: 'k5', entityType: 'TASK', entityId: 'e4', entityTitle: 'REQ-1', children: [child()] }])
    );
    const { container } = renderInDocument();
    await flush();

    const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
    await act(async () => {
      titleButton(container, 'REQ-1')!.dispatchEvent(evt);
    });

    expect(evt.defaultPrevented).toBe(true);
    expect(container.querySelector('details')?.open).toBe(false);
  });

  it('surfaces an error when the target cannot be opened', async () => {
    apiJson.mockResolvedValue(
      feed([{ key: 'k6', entityType: 'TASK', entityId: 'e5', entityTitle: 'REQ-2', children: [child()] }])
    );
    navigateToWorkspaceEntity.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = renderInDocument();
    await flush();

    await act(async () => {
      titleButton(container, 'REQ-2')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain('Failed to open "REQ-2"');
  });

  it('explains when the entity is no longer in the project the feed recorded', async () => {
    apiJson.mockResolvedValue(
      feed([{ key: 'k7', entityType: 'WIKI', entityId: 'w9', entityTitle: 'Moved Page', children: [child({ action: 'WIKI_UPDATED' })] }])
    );
    navigateToWorkspaceEntity.mockRejectedValue(new FakeEntityNotInProjectError('moved'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = renderInDocument();
    await flush();

    await act(async () => {
      titleButton(container, 'Moved Page')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain('"Moved Page" is no longer in Project One');
  });
});
