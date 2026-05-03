import { afterEach, describe, expect, it, vi } from 'vitest';
import { patchEntityApi } from '../../api/entities';
import { modifyEntityAction } from './entityManifestActions';
import type { Entity } from '../../types';
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

describe('modifyEntityAction - queueing & serialization', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('queues a second patch for the same entity until the first completes (no overlapping PATCH requests)', async () => {
    const h = createModifyEntityHarness();
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
      setActiveProject: h.setActiveProject,
      entityEtagByIdRef: h.entityEtagByIdRef,
      refreshActiveProject: h.refreshActiveProject,
    });
    const p2 = modifyEntityAction({
      activeProjectId: 'p1',
      id: 'e1',
      properties: { status: 'Done' },
      setActiveProject: h.setActiveProject,
      entityEtagByIdRef: h.entityEtagByIdRef,
      refreshActiveProject: h.refreshActiveProject,
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
    expect(h.currentProject?.entities[0]?.properties).toEqual({ title: 'First', status: 'Done' });
  });

  it('serializes patches for the same entity so a second patch uses the etag from the first response', async () => {
    const h = createModifyEntityHarness();
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
      setActiveProject: h.setActiveProject,
      entityEtagByIdRef: h.entityEtagByIdRef,
      refreshActiveProject: h.refreshActiveProject,
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
      setActiveProject: h.setActiveProject,
      entityEtagByIdRef: h.entityEtagByIdRef,
      refreshActiveProject: h.refreshActiveProject,
    });

    expect(patchEntityApiMock).toHaveBeenCalledTimes(2);
    expect(patchEntityApiMock.mock.calls[1]?.[3]).toBe('"2"');
    expect(h.currentProject?.entities[0]?.properties.title).toBe('Second');
  });
});
