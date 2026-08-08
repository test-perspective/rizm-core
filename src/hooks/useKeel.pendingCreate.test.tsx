import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as entitiesApi from '../api/entities';
import * as projectsApi from '../api/projects';
import type { Entity, Project, ProjectMeta } from '../types';
import { useKeel } from './useKeel';

vi.mock('../api/entities', () => ({
  createEntityApi: vi.fn(),
  deleteEntityApi: vi.fn(),
  patchEntityApi: vi.fn(),
}));

vi.mock('../api/projects', () => ({
  fetchProjectsIndex: vi.fn(),
  fetchProjectState: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function meta(id = 'p1'): ProjectMeta {
  return { id, name: id, projectKey: id.toUpperCase(), createdAt: 1, updatedAt: 1 };
}

function project(id = 'p1', entities: Entity[] = []): Project {
  return {
    id,
    name: id,
    createdAt: 1,
    updatedAt: 1,
    entities,
    config: {
      manifest: {
        name: id,
        defaultView: 'board',
        entities: [],
        views: [],
      },
    },
  };
}

function confirmedEntity(placeholder: Entity): Entity {
  return {
    ...placeholder,
    updatedAt: placeholder.updatedAt + 1,
    properties: { ...placeholder.properties, title: 'Server title' },
  };
}

let keelApi: ReturnType<typeof useKeel> | null = null;

function KeelProbe() {
  keelApi = useKeel();
  return null;
}

async function waitUntil(condition: () => boolean, timeoutMs = 5_000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitUntil timed out');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

describe('useKeel pending entity creation', () => {
  let root: Root;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(projectsApi.fetchProjectsIndex).mockResolvedValue({
      projects: [meta()],
      activeProjectId: 'p1',
    });
    vi.mocked(projectsApi.fetchProjectState).mockResolvedValue({
      project: project(),
      manifestEtag: '"manifest"',
    });
    vi.mocked(entitiesApi.deleteEntityApi).mockResolvedValue(undefined);
    keelApi = null;
    document.body.innerHTML = '<div id="test-root"></div>';
    root = createRoot(document.getElementById('test-root')!);
    await act(async () => {
      root.render(<KeelProbe />);
    });
    await waitUntil(() => Boolean(keelApi && !keelApi.loading));
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    vi.restoreAllMocks();
  });

  it('keeps the optimistic entity when a refresh finishes before creation', async () => {
    const create = deferred<{ entity: Entity; etag: string }>();
    vi.mocked(entitiesApi.createEntityApi).mockReturnValue(create.promise);
    let placeholder!: Entity;

    act(() => {
      placeholder = keelApi!.addEntity('task', { title: 'Draft' });
    });
    await act(async () => {
      await keelApi!.refreshActiveProject();
    });

    expect(keelApi!.entities.map((entity) => entity.id)).toContain(placeholder.id);

    const serverEntity = confirmedEntity(placeholder);
    await act(async () => {
      create.resolve({ entity: serverEntity, etag: '"created-etag"' });
      await create.promise;
    });
    await waitUntil(() => keelApi!.entities[0]?.properties.title === 'Server title');
    expect(keelApi!.entities).toEqual([serverEntity]);
  });

  it('keeps the confirmed entity when an older refresh finishes after creation', async () => {
    const create = deferred<{ entity: Entity; etag: string }>();
    const staleRefresh = deferred<{ project: Project; manifestEtag: string }>();
    vi.mocked(entitiesApi.createEntityApi).mockReturnValue(create.promise);
    vi.mocked(projectsApi.fetchProjectState).mockReturnValueOnce(staleRefresh.promise);
    let placeholder!: Entity;
    let refreshPromise!: Promise<Project | null>;

    act(() => {
      placeholder = keelApi!.addEntity('task', { title: 'Draft' });
      refreshPromise = keelApi!.refreshActiveProject();
    });

    const serverEntity = confirmedEntity(placeholder);
    await act(async () => {
      create.resolve({ entity: serverEntity, etag: '"created-etag"' });
      await create.promise;
    });
    staleRefresh.resolve({ project: project(), manifestEtag: '"stale"' });
    await act(async () => {
      await refreshPromise;
    });

    expect(keelApi!.entities).toEqual([serverEntity]);
  });

  it('removes the optimistic entity when creation fails', async () => {
    const create = deferred<{ entity: Entity; etag: string }>();
    vi.mocked(entitiesApi.createEntityApi).mockReturnValue(create.promise);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let placeholder!: Entity;

    act(() => {
      placeholder = keelApi!.addEntity('task', { title: 'Draft' });
    });
    await act(async () => {
      create.reject(new Error('create failed'));
      await create.promise.catch(() => undefined);
    });
    await waitUntil(() => !keelApi!.entities.some((entity) => entity.id === placeholder.id));

    expect(keelApi!.entities).toEqual([]);
  });

  it('does not insert a create response into a newly selected project', async () => {
    const create = deferred<{ entity: Entity; etag: string }>();
    vi.mocked(entitiesApi.createEntityApi).mockReturnValue(create.promise);
    let placeholder!: Entity;

    act(() => {
      placeholder = keelApi!.addEntity('task', { title: 'Draft' });
    });
    vi.mocked(projectsApi.fetchProjectState).mockResolvedValueOnce({
      project: project('p2'),
      manifestEtag: '"p2-manifest"',
    });
    act(() => {
      keelApi!.setActiveProjectId('p2');
    });
    await waitUntil(() => keelApi!.activeProject?.id === 'p2');

    await act(async () => {
      create.resolve({ entity: confirmedEntity(placeholder), etag: '"created-etag"' });
      await create.promise;
    });

    expect(keelApi!.activeProject?.id).toBe('p2');
    expect(keelApi!.entities).toEqual([]);
  });

  it('does not restore an entity removed before its create response arrives', async () => {
    const create = deferred<{ entity: Entity; etag: string }>();
    vi.mocked(entitiesApi.createEntityApi).mockReturnValue(create.promise);
    let placeholder!: Entity;

    act(() => {
      placeholder = keelApi!.addEntity('task', { title: 'Draft' });
      keelApi!.removeEntity(placeholder.id);
    });
    await act(async () => {
      create.resolve({ entity: confirmedEntity(placeholder), etag: '"created-etag"' });
      await create.promise;
    });

    expect(keelApi!.entities).toEqual([]);
  });
});
