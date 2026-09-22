import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entity, MoveTasksResponse, Project } from '../../types';
import { moveTasksAction } from './taskMoveAction';

function task(id: string, taskKey: string): Entity {
  return { id, entityId: 'task', createdAt: 0, updatedAt: 0, properties: { taskKey } };
}

function project(entities: Entity[]): Project {
  return {
    id: 'p1',
    name: 'P1',
    projectKey: 'AAA',
    createdAt: 0,
    updatedAt: 0,
    entities,
    config: { manifest: { name: 'M', entities: [], views: [], defaultView: 'table' } },
  } as unknown as Project;
}

type Harness = {
  args: Parameters<typeof moveTasksAction>[0];
  current: () => Project | null;
  etags: Record<string, string>;
  refreshCalls: () => number;
};

function harness(entities: Entity[]): Harness {
  let current: Project | null = project(entities);
  const etags: Record<string, string> = Object.fromEntries(
    entities.map((e) => [e.id, '"1"'])
  );
  let refreshCalls = 0;
  return {
    args: {
      activeProjectId: 'p1',
      destinationProjectId: 'p2',
      taskIds: ['t1'],
      setActiveProject: (next) => {
        current = typeof next === 'function' ? (next as (p: Project | null) => Project | null)(current) : next;
      },
      entityEtagByIdRef: { current: etags },
      pendingCreatedEntitiesRef: { current: new Map() },
      refreshActiveProject: async () => {
        refreshCalls += 1;
      },
    },
    current: () => current,
    etags,
    refreshCalls: () => refreshCalls,
  };
}

const response: MoveTasksResponse = {
  sourceProjectId: 'p1',
  destinationProjectId: 'p2',
  destinationProjectKey: 'BBB',
  moved: [{ id: 't1', previousTaskKey: 'AAA-1', taskKey: 'BBB-1', title: 'A' }],
  detachedRelations: [],
  manifestUpdated: false,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  (globalThis as any).process.env.VITE_KEEL_BACKEND_URL = 'http://backend.test';
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as any).process.env.VITE_KEEL_BACKEND_URL;
});

function ok(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('moveTasksAction', () => {
  it('posts the move and drops the moved tasks from local state', async () => {
    fetchMock.mockResolvedValue(ok(response));
    const h = harness([task('t1', 'AAA-1'), task('t2', 'AAA-2')]);

    const result = await moveTasksAction(h.args);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://backend.test/api/projects/p1/tasks/move');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      destinationProjectId: 'p2',
      taskIds: ['t1'],
    });

    expect(result.moved[0].taskKey).toBe('BBB-1');
    expect(h.current()?.entities.map((e) => e.id)).toEqual(['t2']);
    expect(h.etags).toEqual({ t2: '"1"' });
    expect(h.refreshCalls()).toBe(1);
  });

  it('leaves local state alone when the server refuses', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'insufficient permissions',
    } as unknown as Response);
    const h = harness([task('t1', 'AAA-1'), task('t2', 'AAA-2')]);

    await expect(moveTasksAction(h.args)).rejects.toMatchObject({ status: 403 });

    expect(h.current()?.entities.map((e) => e.id)).toEqual(['t1', 't2']);
    expect(h.etags).toEqual({ t1: '"1"', t2: '"1"' });
    expect(h.refreshCalls()).toBe(0);
  });
});
