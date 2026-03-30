import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeel } from './useKeel';
import * as projectsApi from '../api/projects';
import type { Project, ProjectMeta } from '../types';

vi.mock('../api/projects', () => ({
  fetchProjectsIndex: vi.fn(),
  fetchProjectState: vi.fn(),
}));

function meta(): ProjectMeta {
  return { id: 'p1', name: 'P', projectKey: 'pk', createdAt: 1, updatedAt: 1 };
}

function project(): Project {
  return {
    id: 'p1',
    name: 'P',
    createdAt: 1,
    updatedAt: 1,
    entities: [],
    config: {
      manifest: {
        name: 'm',
        defaultView: 'v',
        entities: [],
        views: [],
      },
    },
  };
}

let keelApi: ReturnType<typeof useKeel> | null = null;

function KeelProbe() {
  keelApi = useKeel();
  return null;
}

async function waitUntil(cond: () => boolean, timeoutMs = 5000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitUntil timed out');
    }
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
}

describe('useKeel project refresh block', () => {
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(projectsApi.fetchProjectsIndex).mockResolvedValue({
      projects: [meta()],
      activeProjectId: 'p1',
    });
    vi.mocked(projectsApi.fetchProjectState).mockResolvedValue({
      project: project(),
      manifestEtag: 'e1',
    });
    keelApi = null;
    document.body.innerHTML = '<div id="test-root"></div>';
    root = createRoot(document.getElementById('test-root')!);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
  });

  it('skips refresh while blocked', async () => {
    await act(async () => {
      root.render(<KeelProbe />);
    });
    await waitUntil(() => Boolean(keelApi && !keelApi.loading));

    const fetchMock = vi.mocked(projectsApi.fetchProjectState);
    fetchMock.mockClear();

    keelApi!.setProjectRefreshBlocked(true);
    await act(async () => {
      await keelApi!.refreshActiveProject();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('runs refresh when bypassProjectRefreshBlock is set', async () => {
    await act(async () => {
      root.render(<KeelProbe />);
    });
    await waitUntil(() => Boolean(keelApi && !keelApi.loading));

    const fetchMock = vi.mocked(projectsApi.fetchProjectState);
    fetchMock.mockClear();

    keelApi!.setProjectRefreshBlocked(true);
    await act(async () => {
      await keelApi!.refreshActiveProject({ bypassProjectRefreshBlock: true });
    });
    expect(fetchMock).toHaveBeenCalled();
  });
});
