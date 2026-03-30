import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../auth/api';
import { putManifestApi } from '../../api/manifest';
import { fetchProjectState } from '../../api/projects';
import type { Project, ProjectManifest, ViewConfig } from '../../types';
import { putViewConfigManifestWith412Retries } from './putViewConfigManifest';

vi.mock('../../api/manifest', () => ({
  putManifestApi: vi.fn(),
}));

vi.mock('../../api/projects', () => ({
  fetchProjectState: vi.fn(),
}));

function view(id: string, patch: Partial<ViewConfig> = {}): ViewConfig {
  return {
    id,
    name: 'Board',
    type: 'board',
    entityId: 'task',
    visibleProperties: [],
    ...patch,
  };
}

function manifestWithView(v: ViewConfig): ProjectManifest {
  return {
    name: 'M',
    defaultView: v.id,
    entities: [],
    views: [v],
  };
}

describe('putViewConfigManifestWith412Retries', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('succeeds after two 412s by refetching and reapplying the updater', async () => {
    const putManifestApiMock = vi.mocked(putManifestApi);
    const fetchProjectStateMock = vi.mocked(fetchProjectState);

    let currentProject: Project | null = {
      id: 'p1',
      name: 'P',
      createdAt: 1,
      updatedAt: 1,
      entities: [],
      config: { manifest: manifestWithView(view('v1', { name: 'A' })) },
    };
    const setActiveProject = vi.fn((next: Project | null | ((prev: Project | null) => Project | null)) => {
      currentProject = typeof next === 'function' ? next(currentProject) : next;
    });
    const manifestEtagRef = { current: 'etag-0' };

    const mAfterFirstFetch = manifestWithView(view('v1', { name: 'Server-A' }));
    const mAfterSecondFetch = manifestWithView(view('v1', { name: 'Server-B' }));

    putManifestApiMock
      .mockRejectedValueOnce(new ApiError(412, 'conflict'))
      .mockRejectedValueOnce(new ApiError(412, 'conflict'))
      .mockResolvedValueOnce('"etag-final"');

    fetchProjectStateMock
      .mockResolvedValueOnce({
        project: { ...currentProject!, config: { manifest: mAfterFirstFetch } },
        manifestEtag: 'etag-1',
      })
      .mockResolvedValueOnce({
        project: { ...currentProject!, config: { manifest: mAfterSecondFetch } },
        manifestEtag: 'etag-2',
      });

    const updater = (v: ViewConfig) => ({ ...v, name: 'User' });

    await putViewConfigManifestWith412Retries({
      activeProjectId: 'p1',
      viewId: 'v1',
      updater,
      initialManifest: manifestWithView(view('v1', { name: 'User' })),
      manifestEtagRef,
      setActiveProject,
    });

    expect(putManifestApiMock).toHaveBeenCalledTimes(3);
    expect(putManifestApiMock.mock.calls[0]?.[2]).toBe('etag-0');
    expect(putManifestApiMock.mock.calls[1]?.[2]).toBe('etag-1');
    expect(putManifestApiMock.mock.calls[2]?.[2]).toBe('etag-2');
    expect(fetchProjectStateMock).toHaveBeenCalledTimes(2);
    expect(manifestEtagRef.current).toBe('etag-final');
    expect(currentProject?.config.manifest.views[0]?.name).toBe('User');
  });
});
