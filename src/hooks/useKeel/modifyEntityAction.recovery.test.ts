import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../auth/api';
import { getEntityApi, patchEntityApi } from '../../api/entities';
import { modifyEntityAction } from './entityManifestActions';
import { createModifyEntityHarness } from './entityManifestActions.test.helpers';

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

describe('modifyEntityAction - conflict / retry / GET recovery', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('returns true after 412 retry succeeds', async () => {
    const h = createModifyEntityHarness();
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
      setActiveProject: h.setActiveProject,
      entityEtagByIdRef: h.entityEtagByIdRef,
      refreshActiveProject: h.refreshActiveProject,
    });

    expect(ok).toBe(true);
    expect(patchEntityApiMock).toHaveBeenCalledTimes(2);
    expect(h.refreshActiveProject).toHaveBeenCalledTimes(1);
    expect(h.entityEtagByIdRef.current.e1).toBe('"2"');
    expect(h.currentProject?.entities[0]?.properties.title).toBe('After');
  });

  it('recovers via GET entity when PATCH returns a spurious 404 (REQ-276 safety net)', async () => {
    // A 404 on PATCH can be spurious — e.g. the backend historically masked
    // SQLITE_BUSY_SNAPSHOT as NotFound. In that case the entity still exists
    // and a GET-based recovery should re-sync the etag and retry the PATCH
    // without wiping the optimistic UI.
    const h = createModifyEntityHarness();
    const patchEntityApiMock = vi.mocked(patchEntityApi);
    const getEntityApiMock = vi.mocked(getEntityApi);

    patchEntityApiMock
      .mockRejectedValueOnce(new ApiError(404, 'not found'))
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

    const ok = await modifyEntityAction({
      activeProjectId: 'p1',
      id: 'e1',
      properties: { title: 'After' },
      setActiveProject: h.setActiveProject,
      entityEtagByIdRef: h.entityEtagByIdRef,
      refreshActiveProject: h.refreshActiveProject,
    });

    expect(ok).toBe(true);
    expect(patchEntityApiMock).toHaveBeenCalledTimes(2);
    expect(patchEntityApiMock.mock.calls[1]?.[3]).toBe('"9"');
    expect(getEntityApiMock).toHaveBeenCalledWith('p1', 'e1');
    expect(h.refreshActiveProject).not.toHaveBeenCalled();
    expect(h.entityEtagByIdRef.current.e1).toBe('"10"');
    expect(h.currentProject?.entities[0]?.properties.title).toBe('After');
  });

  it('refreshes project when PATCH returns 404 and GET also 404 (entity really gone)', async () => {
    // When the entity really was deleted, GET returns 404 too. We must refresh
    // the project so the optimistic UI stops showing a value the server never
    // persisted; otherwise REQ-276 "visible changes that silently revert on
    // reload" resurfaces under a different root cause.
    const h = createModifyEntityHarness();
    const patchEntityApiMock = vi.mocked(patchEntityApi);
    const getEntityApiMock = vi.mocked(getEntityApi);

    patchEntityApiMock.mockRejectedValueOnce(new ApiError(404, 'not found'));
    getEntityApiMock.mockRejectedValue(new ApiError(404, 'not found'));

    const ok = await modifyEntityAction({
      activeProjectId: 'p1',
      id: 'e1',
      properties: { title: 'After' },
      setActiveProject: h.setActiveProject,
      entityEtagByIdRef: h.entityEtagByIdRef,
      refreshActiveProject: h.refreshActiveProject,
    });

    expect(ok).toBe(false);
    expect(patchEntityApiMock).toHaveBeenCalledTimes(1);
    expect(getEntityApiMock).toHaveBeenCalledWith('p1', 'e1');
    expect(h.refreshActiveProject).toHaveBeenCalledTimes(1);
  });

  it('retries PATCH after 503 with backoff then succeeds', async () => {
    vi.useFakeTimers();
    const h = createModifyEntityHarness();
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
      setActiveProject: h.setActiveProject,
      entityEtagByIdRef: h.entityEtagByIdRef,
      refreshActiveProject: h.refreshActiveProject,
    });
    await vi.advanceTimersByTimeAsync(100);
    const ok = await op;

    expect(ok).toBe(true);
    expect(patchEntityApiMock).toHaveBeenCalledTimes(2);
    expect(h.refreshActiveProject).not.toHaveBeenCalled();
    expect(h.entityEtagByIdRef.current.e1).toBe('"2"');
  });

  it('gives up after repeated 503 and then refreshes', async () => {
    vi.useFakeTimers();
    const h = createModifyEntityHarness();
    const patchEntityApiMock = vi.mocked(patchEntityApi);

    patchEntityApiMock.mockRejectedValue(new ApiError(503, 'unavailable'));

    const op = modifyEntityAction({
      activeProjectId: 'p1',
      id: 'e1',
      properties: { title: 'After' },
      setActiveProject: h.setActiveProject,
      entityEtagByIdRef: h.entityEtagByIdRef,
      refreshActiveProject: h.refreshActiveProject,
    });
    await vi.advanceTimersByTimeAsync(5000);
    const ok = await op;

    expect(ok).toBe(false);
    expect(patchEntityApiMock).toHaveBeenCalledTimes(4);
    expect(h.refreshActiveProject).toHaveBeenCalledTimes(1);
  });

  it('returns false when retry also fails', async () => {
    const h = createModifyEntityHarness();
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
      setActiveProject: h.setActiveProject,
      entityEtagByIdRef: h.entityEtagByIdRef,
      refreshActiveProject: h.refreshActiveProject,
    });

    expect(ok).toBe(false);
    expect(patchEntityApiMock).toHaveBeenCalledTimes(2);
    expect(h.refreshActiveProject).toHaveBeenCalledTimes(2);
    expect(getEntityApiMock).toHaveBeenCalledWith('p1', 'e1');
    expect(h.entityEtagByIdRef.current.e1).toBe('"1"');
    // optimistic value is refreshed back on failure path
    expect(h.setActiveProject).toHaveBeenCalled();
  });

  it('recovers via GET entity when refresh retry still returns 412', async () => {
    const h = createModifyEntityHarness();
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
      setActiveProject: h.setActiveProject,
      entityEtagByIdRef: h.entityEtagByIdRef,
      refreshActiveProject: h.refreshActiveProject,
    });

    expect(ok).toBe(true);
    expect(patchEntityApiMock).toHaveBeenCalledTimes(3);
    expect(patchEntityApiMock.mock.calls[2]?.[3]).toBe('"9"');
    expect(h.refreshActiveProject).toHaveBeenCalledTimes(1);
    expect(getEntityApiMock).toHaveBeenCalledWith('p1', 'e1');
    expect(h.entityEtagByIdRef.current.e1).toBe('"10"');
    expect(h.currentProject?.entities[0]?.properties.title).toBe('After');
  });

  it('recovers via GET entity after non-conflict failure and project refresh', async () => {
    const h = createModifyEntityHarness();
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
      setActiveProject: h.setActiveProject,
      entityEtagByIdRef: h.entityEtagByIdRef,
      refreshActiveProject: h.refreshActiveProject,
    });

    expect(ok).toBe(true);
    expect(patchEntityApiMock).toHaveBeenCalledTimes(2);
    expect(patchEntityApiMock.mock.calls[1]?.[3]).toBe('"9"');
    expect(h.refreshActiveProject).toHaveBeenCalledTimes(1);
    expect(getEntityApiMock).toHaveBeenCalledWith('p1', 'e1');
    expect(h.entityEtagByIdRef.current.e1).toBe('"10"');
  });

  it('returns false when GET recovery patch still fails', async () => {
    const h = createModifyEntityHarness();
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
      setActiveProject: h.setActiveProject,
      entityEtagByIdRef: h.entityEtagByIdRef,
      refreshActiveProject: h.refreshActiveProject,
    });

    expect(ok).toBe(false);
    expect(patchEntityApiMock).toHaveBeenCalledTimes(3);
    expect(h.refreshActiveProject).toHaveBeenCalledTimes(2);
    expect(getEntityApiMock).toHaveBeenCalledTimes(1);
  });
});
