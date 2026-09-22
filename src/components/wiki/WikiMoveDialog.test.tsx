import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

import type { Entity } from '../../types';
import { WikiMoveDialog } from './WikiMoveDialog';

const fetchWikiPages = vi.fn();
const moveWikiPage = vi.fn();
const fetchProjectState = vi.fn();
const navigate = vi.fn();

vi.mock('../../api/projects', () => ({
  fetchWikiPages: (...args: unknown[]) => fetchWikiPages(...args),
  moveWikiPage: (...args: unknown[]) => moveWikiPage(...args),
  fetchProjectState: (...args: unknown[]) => fetchProjectState(...args),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

// The picker has its own coverage; here it only has to report a destination.
vi.mock('../common/ProjectSelect', () => ({
  ProjectSelect: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" data-testid="pick-destination" onClick={() => onChange('p2')}>
      pick
    </button>
  ),
}));

vi.mock('../../workspace/storage', () => ({
  setLastWikiPageForProjectView: vi.fn(),
}));

const projects = [
  { id: 'p1', name: 'Source', createdAt: 0, updatedAt: 0 },
  { id: 'p2', name: 'Destination', createdAt: 0, updatedAt: 0 },
];

function wikiPage(id: string, parentId?: string): Entity {
  return {
    id,
    entityId: 'wikiPage',
    createdAt: 0,
    updatedAt: 0,
    properties: { title: `Title ${id}`, ...(parentId ? { parentId } : {}) },
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  fetchWikiPages.mockResolvedValue([]);
  fetchProjectState.mockResolvedValue({
    project: { config: { manifest: { views: [{ id: 'v1', type: 'wiki' }] } } },
  });
  moveWikiPage.mockResolvedValue({
    destinationProjectId: 'p2',
    rootPageId: 'page-1',
    movedPageIds: ['page-1', 'page-2'],
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

async function render(calls: string[]) {
  const onMoved = vi.fn(() => {
    calls.push('onMoved');
  });
  const onRefreshProject = vi.fn(() => {
    calls.push('onRefreshProject');
  });
  await act(async () => {
    root.render(
      <WikiMoveDialog
        open
        onClose={() => {}}
        sourceProjectId="p1"
        pageId="page-1"
        pages={[wikiPage('page-1'), wikiPage('page-2', 'page-1')]}
        projects={projects}
        onRefreshProject={onRefreshProject}
        onMoved={onMoved}
      />
    );
  });
  return { onMoved, onRefreshProject };
}

async function click(testId: string) {
  const el = document.body.querySelector(`[data-testid="${testId}"]`);
  if (!el) throw new Error(`missing ${testId}`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('WikiMoveDialog', () => {
  // REQ-319: the caller has to drop cached page bodies (whose attachment URLs still name
  // the source project) before anything refetches or navigates.
  it('reports the moved subtree before refreshing the project', async () => {
    const calls: string[] = [];
    const { onMoved } = await render(calls);

    await click('pick-destination');
    await click('wiki-move-confirm');

    expect(onMoved).toHaveBeenCalledWith({
      movedPageIds: ['page-1', 'page-2'],
      destinationProjectId: 'p2',
      crossProject: true,
    });
    expect(calls).toEqual(['onMoved', 'onRefreshProject']);
  });

  it('reports a same-project move as not crossing projects', async () => {
    moveWikiPage.mockResolvedValue({
      destinationProjectId: 'p1',
      rootPageId: 'page-1',
      movedPageIds: ['page-1', 'page-2'],
    });
    const calls: string[] = [];
    const { onMoved } = await render(calls);

    await click('wiki-move-confirm');

    expect(onMoved).toHaveBeenCalledWith({
      movedPageIds: ['page-1', 'page-2'],
      destinationProjectId: 'p1',
      crossProject: false,
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not report a move that failed', async () => {
    moveWikiPage.mockRejectedValue(new Error('insufficient permissions'));
    const calls: string[] = [];
    const { onMoved, onRefreshProject } = await render(calls);

    await click('pick-destination');
    await click('wiki-move-confirm');

    expect(onMoved).not.toHaveBeenCalled();
    expect(onRefreshProject).not.toHaveBeenCalled();
  });
});
