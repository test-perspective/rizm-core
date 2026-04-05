import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../auth/api';
import { getEntityApi, patchEntityApi } from '../../api/entities';
import { modifyEntityAction } from './entityManifestActions';
import type { Entity, Project } from '../../types';

vi.mock('../../api/entities', () => ({
  createEntityApi: vi.fn(),
  deleteEntityApi: vi.fn(),
  getEntityApi: vi.fn(),
  patchEntityApi: vi.fn(),
}));

vi.mock('../../api/manifest', () => ({
  putManifestApi: vi.fn(),
}));

vi.mock('../../api/projects', () => ({
  fetchProjectState: vi.fn(),
}));

function createProject(): Project {
  return {
    id: 'p1',
    name: 'Project 1',
    createdAt: 1,
    updatedAt: 1,
    entities: [
      {
        id: 'e1',
        entityId: 'task',
        createdAt: 1,
        updatedAt: 1,
        properties: { title: 'Before' },
      },
    ],
    config: {
      manifest: {
        name: 'Manifest',
        defaultView: 'v1',
        entities: [],
        views: [],
      },
    },
  };
}

describe('modifyEntityAction', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('returns true after 412 retry succeeds', async () => {
    let currentProject: Project | null = createProject();
    const setActiveProject = vi.fn((next: Project | null | ((prev: Project | null) => Project | null)) => {
      currentProject = typeof next === 'function' ? next(currentProject) : next;
    });
    const entityEtagByIdRef = { current: { e1: '"1"' } };
    const refreshActiveProject = vi.fn().mockResolvedValue(undefined);
    const patchEntityApiMock = vi.mocked(patchEntityApi);

    patchEntityApiMock
      .mockRejectedValueOnce(new ApiError(412, 'conflict'))
      .mockResolvedValueOnce({
        entity: {
          id: 'e1',
          entityId: 'task',
          createdAt: 1,
          updatedAt: 2,
          properties: { title: 'After' },
        },
        etag: '"2"',
      });

    const ok = await modifyEntityAction({
      activeProjectId: 'p1',
      id: 'e1',
      properties: { title: 'After' },
      setActiveProject,
      entityEtagByIdRef,
      refreshActiveProject,
    });

    expect(ok).toBe(true);
    expect(patchEntityApiMock).toHaveBeenCalledTimes(2);
    expect(refreshActiveProject).toHaveBeenCalledTimes(1);
    expect(entityEtagByIdRef.current.e1).toBe('"2"');
    expect(currentProject?.entities[0]?.properties.title).toBe('After');
  });

  it('does not refresh project on 404 (avoids clobbering concurrent patches)', async () => {
    let currentProject: Project | null = createProject();
    const setActiveProject = vi.fn((next: Project | null | ((prev: Project | null) => Project | null)) => {
      currentProject = typeof next === 'function' ? next(currentProject) : next;
    });
    const entityEtagByIdRef = { current: { e1: '"1"' } };
    const refreshActiveProject = vi.fn().mockResolvedValue(undefined);
    const patchEntityApiMock = vi.mocked(patchEntityApi);

    patchEntityApiMock.mockRejectedValueOnce(new ApiError(404, 'not found'));

    const ok = await modifyEntityAction({
      activeProjectId: 'p1',
      id: 'e1',
      properties: { title: 'After' },
      setActiveProject,
      entityEtagByIdRef,
      refreshActiveProject,
    });

    expect(ok).toBe(false);
    expect(refreshActiveProject).not.toHaveBeenCalled();
    expect(patchEntityApiMock).toHaveBeenCalledTimes(1);
  });

  it('retries PATCH after 503 with backoff then succeeds', async () => {
    vi.useFakeTimers();
    let currentProject: Project | null = createProject();
    const setActiveProject = vi.fn((next: Project | null | ((prev: Project | null) => Project | null)) => {
      currentProject = typeof next === 'function' ? next(currentProject) : next;
    });
    const entityEtagByIdRef = { current: { e1: '"1"' } };
    const refreshActiveProject = vi.fn().mockResolvedValue(undefined);
    const patchEntityApiMock = vi.mocked(patchEntityApi);

    patchEntityApiMock
      .mockRejectedValueOnce(new ApiError(503, 'unavailable'))
      .mockResolvedValueOnce({
        entity: {
          id: 'e1',
          entityId: 'task',
          createdAt: 1,
          updatedAt: 2,
          properties: { title: 'After' },
        },
        etag: '"2"',
      });

    const op = modifyEntityAction({
      activeProjectId: 'p1',
      id: 'e1',
      properties: { title: 'After' },
      setActiveProject,
      entityEtagByIdRef,
      refreshActiveProject,
    });
    await vi.advanceTimersByTimeAsync(100);
    const ok = await op;

    expect(ok).toBe(true);
    expect(patchEntityApiMock).toHaveBeenCalledTimes(2);
    expect(refreshActiveProject).not.toHaveBeenCalled();
    expect(entityEtagByIdRef.current.e1).toBe('"2"');
  });

  it('gives up after repeated 503 and then refreshes', async () => {
    vi.useFakeTimers();
    let currentProject: Project | null = createProject();
    const setActiveProject = vi.fn((next: Project | null | ((prev: Project | null) => Project | null)) => {
      currentProject = typeof next === 'function' ? next(currentProject) : next;
    });
    const entityEtagByIdRef = { current: { e1: '"1"' } };
    const refreshActiveProject = vi.fn().mockResolvedValue(undefined);
    const patchEntityApiMock = vi.mocked(patchEntityApi);

    patchEntityApiMock.mockRejectedValue(new ApiError(503, 'unavailable'));

    const op = modifyEntityAction({
      activeProjectId: 'p1',
      id: 'e1',
      properties: { title: 'After' },
      setActiveProject,
      entityEtagByIdRef,
      refreshActiveProject,
    });
    await vi.advanceTimersByTimeAsync(5000);
    const ok = await op;

    expect(ok).toBe(false);
    expect(patchEntityApiMock).toHaveBeenCalledTimes(4);
    expect(refreshActiveProject).toHaveBeenCalledTimes(1);
  });

  it('returns false when retry also fails', async () => {
    let currentProject: Project | null = createProject();
    const setActiveProject = vi.fn((next: Project | null | ((prev: Project | null) => Project | null)) => {
      currentProject = typeof next === 'function' ? next(currentProject) : next;
    });
    const entityEtagByIdRef = { current: { e1: '"1"' } };
    const refreshActiveProject = vi.fn().mockResolvedValue(undefined);
    const patchEntityApiMock = vi.mocked(patchEntityApi);
    const getEntityApiMock = vi.mocked(getEntityApi);
    getEntityApiMock.mockRejectedValue(new Error('GET recovery unavailable'));

    patchEntityApiMock
      .mockRejectedValueOnce(new ApiError(412, 'conflict'))
      .mockRejectedValueOnce(new ApiError(412, 'still conflict'));

    const ok = await modifyEntityAction({
      activeProjectId: 'p1',
      id: 'e1',
      properties: { title: 'After' },
      setActiveProject,
      entityEtagByIdRef,
      refreshActiveProject,
    });

    expect(ok).toBe(false);
    expect(patchEntityApiMock).toHaveBeenCalledTimes(2);
    expect(refreshActiveProject).toHaveBeenCalledTimes(2);
    expect(getEntityApiMock).toHaveBeenCalledWith('p1', 'e1');
    expect(entityEtagByIdRef.current.e1).toBe('"1"');
    // optimistic value is refreshed back on failure path
    expect(setActiveProject).toHaveBeenCalled();
  });

  it('recovers via GET entity when refresh retry still returns 412', async () => {
    let currentProject: Project | null = createProject();
    const setActiveProject = vi.fn((next: Project | null | ((prev: Project | null) => Project | null)) => {
      currentProject = typeof next === 'function' ? next(currentProject) : next;
    });
    const entityEtagByIdRef = { current: { e1: '"1"' } };
    const refreshActiveProject = vi.fn().mockResolvedValue(undefined);
    const patchEntityApiMock = vi.mocked(patchEntityApi);
    const getEntityApiMock = vi.mocked(getEntityApi);

    getEntityApiMock.mockResolvedValue({
      entity: {
        id: 'e1',
        entityId: 'task',
        createdAt: 1,
        updatedAt: 9,
        properties: { title: 'Server' },
      },
      etag: '"9"',
    });

    patchEntityApiMock
      .mockRejectedValueOnce(new ApiError(412, 'conflict'))
      .mockRejectedValueOnce(new ApiError(412, 'still conflict'))
      .mockResolvedValueOnce({
        entity: {
          id: 'e1',
          entityId: 'task',
          createdAt: 1,
          updatedAt: 10,
          properties: { title: 'After' },
        },
        etag: '"10"',
      });

    const ok = await modifyEntityAction({
      activeProjectId: 'p1',
      id: 'e1',
      properties: { title: 'After' },
      setActiveProject,
      entityEtagByIdRef,
      refreshActiveProject,
    });

    expect(ok).toBe(true);
    expect(patchEntityApiMock).toHaveBeenCalledTimes(3);
    expect(patchEntityApiMock.mock.calls[2]?.[3]).toBe('"9"');
    expect(refreshActiveProject).toHaveBeenCalledTimes(1);
    expect(getEntityApiMock).toHaveBeenCalledWith('p1', 'e1');
    expect(entityEtagByIdRef.current.e1).toBe('"10"');
    expect(currentProject?.entities[0]?.properties.title).toBe('After');
  });

  it('recovers via GET entity after non-conflict failure and project refresh', async () => {
    let currentProject: Project | null = createProject();
    const setActiveProject = vi.fn((next: Project | null | ((prev: Project | null) => Project | null)) => {
      currentProject = typeof next === 'function' ? next(currentProject) : next;
    });
    const entityEtagByIdRef = { current: { e1: '"1"' } };
    const refreshActiveProject = vi.fn().mockResolvedValue(undefined);
    const patchEntityApiMock = vi.mocked(patchEntityApi);
    const getEntityApiMock = vi.mocked(getEntityApi);

    getEntityApiMock.mockResolvedValue({
      entity: {
        id: 'e1',
        entityId: 'task',
        createdAt: 1,
        updatedAt: 9,
        properties: { title: 'Server' },
      },
      etag: '"9"',
    });

    patchEntityApiMock
      .mockRejectedValueOnce(new ApiError(500, 'server error'))
      .mockResolvedValueOnce({
        entity: {
          id: 'e1',
          entityId: 'task',
          createdAt: 1,
          updatedAt: 10,
          properties: { title: 'After' },
        },
        etag: '"10"',
      });

    const ok = await modifyEntityAction({
      activeProjectId: 'p1',
      id: 'e1',
      properties: { title: 'After' },
      setActiveProject,
      entityEtagByIdRef,
      refreshActiveProject,
    });

    expect(ok).toBe(true);
    expect(patchEntityApiMock).toHaveBeenCalledTimes(2);
    expect(patchEntityApiMock.mock.calls[1]?.[3]).toBe('"9"');
    expect(refreshActiveProject).toHaveBeenCalledTimes(1);
    expect(getEntityApiMock).toHaveBeenCalledWith('p1', 'e1');
    expect(entityEtagByIdRef.current.e1).toBe('"10"');
  });

  it('returns false when GET recovery patch still fails', async () => {
    let currentProject: Project | null = createProject();
    const setActiveProject = vi.fn((next: Project | null | ((prev: Project | null) => Project | null)) => {
      currentProject = typeof next === 'function' ? next(currentProject) : next;
    });
    const entityEtagByIdRef = { current: { e1: '"1"' } };
    const refreshActiveProject = vi.fn().mockResolvedValue(undefined);
    const patchEntityApiMock = vi.mocked(patchEntityApi);
    const getEntityApiMock = vi.mocked(getEntityApi);

    getEntityApiMock.mockResolvedValue({
      entity: {
        id: 'e1',
        entityId: 'task',
        createdAt: 1,
        updatedAt: 9,
        properties: { title: 'Server' },
      },
      etag: '"9"',
    });

    patchEntityApiMock
      .mockRejectedValueOnce(new ApiError(412, 'conflict'))
      .mockRejectedValueOnce(new ApiError(412, 'still conflict'))
      .mockRejectedValueOnce(new ApiError(412, 'after get'));

    const ok = await modifyEntityAction({
      activeProjectId: 'p1',
      id: 'e1',
      properties: { title: 'After' },
      setActiveProject,
      entityEtagByIdRef,
      refreshActiveProject,
    });

    expect(ok).toBe(false);
    expect(patchEntityApiMock).toHaveBeenCalledTimes(3);
    expect(refreshActiveProject).toHaveBeenCalledTimes(2);
    expect(getEntityApiMock).toHaveBeenCalledTimes(1);
  });

  it('queues a second patch for the same entity until the first completes (no overlapping PATCH requests)', async () => {
    let currentProject: Project | null = createProject();
    const setActiveProject = vi.fn((next: Project | null | ((prev: Project | null) => Project | null)) => {
      currentProject = typeof next === 'function' ? next(currentProject) : next;
    });
    const entityEtagByIdRef = { current: { e1: '"1"' } };
    const refreshActiveProject = vi.fn().mockResolvedValue(undefined);
    const patchEntityApiMock = vi.mocked(patchEntityApi);

    let releaseFirst!: (value: { entity: Entity; etag: string }) => void;
    const firstPatch = new Promise<{ entity: Entity; etag: string }>((resolve) => {
      releaseFirst = resolve;
    });

    patchEntityApiMock.mockImplementationOnce(() => firstPatch);
    patchEntityApiMock.mockResolvedValueOnce({
      entity: {
        id: 'e1',
        entityId: 'task',
        createdAt: 1,
        updatedAt: 4,
        properties: { title: 'First', status: 'Done' },
      },
      etag: '"3"',
    });

    const p1 = modifyEntityAction({
      activeProjectId: 'p1',
      id: 'e1',
      properties: { title: 'First' },
      setActiveProject,
      entityEtagByIdRef,
      refreshActiveProject,
    });
    const p2 = modifyEntityAction({
      activeProjectId: 'p1',
      id: 'e1',
      properties: { status: 'Done' },
      setActiveProject,
      entityEtagByIdRef,
      refreshActiveProject,
    });

    expect(patchEntityApiMock).toHaveBeenCalledTimes(1);

    releaseFirst({
      entity: {
        id: 'e1',
        entityId: 'task',
        createdAt: 1,
        updatedAt: 2,
        properties: { title: 'First', status: 'Open' },
      },
      etag: '"2"',
    });

    const [ok1, ok2] = await Promise.all([p1, p2]);

    expect(ok1).toBe(true);
    expect(ok2).toBe(true);
    expect(patchEntityApiMock).toHaveBeenCalledTimes(2);
    expect(patchEntityApiMock.mock.calls[0]?.slice(0, 3)).toEqual(['p1', 'e1', { title: 'First' }]);
    expect(patchEntityApiMock.mock.calls[1]?.slice(0, 3)).toEqual(['p1', 'e1', { status: 'Done' }]);
    expect(patchEntityApiMock.mock.calls[1]?.[3]).toBe('"2"');
    expect(currentProject?.entities[0]?.properties).toEqual({ title: 'First', status: 'Done' });
  });

  it('serializes patches for the same entity so a second patch uses the etag from the first response', async () => {
    let currentProject: Project | null = createProject();
    const setActiveProject = vi.fn((next: Project | null | ((prev: Project | null) => Project | null)) => {
      currentProject = typeof next === 'function' ? next(currentProject) : next;
    });
    const entityEtagByIdRef = { current: { e1: '"1"' } };
    const refreshActiveProject = vi.fn().mockResolvedValue(undefined);
    const patchEntityApiMock = vi.mocked(patchEntityApi);

    let releaseFirst!: (value: { entity: Entity; etag: string }) => void;
    const firstPatch = new Promise<{ entity: Entity; etag: string }>((resolve) => {
      releaseFirst = resolve;
    });
    patchEntityApiMock.mockImplementationOnce(() => firstPatch);
    patchEntityApiMock.mockResolvedValueOnce({
      entity: {
        id: 'e1',
        entityId: 'task',
        createdAt: 1,
        updatedAt: 4,
        properties: { title: 'Second', status: 'Open' },
      },
      etag: '"3"',
    });

    const p1 = modifyEntityAction({
      activeProjectId: 'p1',
      id: 'e1',
      properties: { title: 'First' },
      setActiveProject,
      entityEtagByIdRef,
      refreshActiveProject,
    });

    releaseFirst({
      entity: {
        id: 'e1',
        entityId: 'task',
        createdAt: 1,
        updatedAt: 2,
        properties: { title: 'First', status: 'Open' },
      },
      etag: '"2"',
    });

    await p1;

    await modifyEntityAction({
      activeProjectId: 'p1',
      id: 'e1',
      properties: { title: 'Second' },
      setActiveProject,
      entityEtagByIdRef,
      refreshActiveProject,
    });

    expect(patchEntityApiMock).toHaveBeenCalledTimes(2);
    expect(patchEntityApiMock.mock.calls[1]?.[3]).toBe('"2"');
    expect(currentProject?.entities[0]?.properties.title).toBe('Second');
  });
});
