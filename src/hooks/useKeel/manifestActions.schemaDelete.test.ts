import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../auth/api';
import { putManifestApi } from '../../api/manifest';
import { fetchProjectState } from '../../api/projects';
import type { Project, ProjectManifest } from '../../types';
import { removePropertyFromEntity } from '../../utils/manifestMutations';
import { updateSchemaAction } from './manifestActions';
import { waitForManifestPutQueueDrain } from './manifestPutQueue';

vi.mock('../../api/manifest', () => ({
  putManifestApi: vi.fn(),
}));

vi.mock('../../api/projects', () => ({
  fetchProjectState: vi.fn(),
}));

/**
 * REQ-322: deleting a field in the schema editor did not stick. The manifest PUT
 * lost a race with another manifest write, came back 412, and the error was
 * swallowed -- the follow-up refresh then put the field back with no sign of failure.
 */

function manifestWith(props: string[]): ProjectManifest {
  return {
    name: 'M',
    defaultView: 'table',
    entities: [
      {
        id: 'task',
        name: 'Task',
        namePlural: 'Tasks',
        properties: props.map((name) => ({ name, type: 'text' as const, visible: true })),
      },
    ],
    views: [
      {
        id: 'table',
        name: 'Table',
        type: 'table',
        entityId: 'task',
        visibleProperties: props,
      },
    ],
  };
}

function projectWith(manifest: ProjectManifest): Project {
  return {
    id: 'p1',
    name: 'P',
    createdAt: 1,
    updatedAt: 1,
    entities: [
      {
        id: 'e1',
        entityId: 'task',
        createdAt: 1,
        updatedAt: 1,
        properties: { title: 'a', assigneeId: 'u1' },
      },
    ],
    config: { manifest },
  };
}

function harness(initialManifest: ProjectManifest) {
  let currentProject: Project | null = projectWith(initialManifest);
  const setActiveProject = vi.fn(
    (next: Project | null | ((prev: Project | null) => Project | null)) => {
      currentProject = typeof next === 'function' ? next(currentProject) : next;
    }
  );
  return {
    setActiveProject,
    get project() {
      return currentProject;
    },
  };
}

const taskProps = (m: ProjectManifest) =>
  m.entities.find((e) => e.id === 'task')!.properties.map((p) => p.name);

describe('updateSchemaAction field deletion', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('re-applies the deletion to the server manifest after a 412 instead of losing it', async () => {
    const putManifestApiMock = vi.mocked(putManifestApi);
    const fetchProjectStateMock = vi.mocked(fetchProjectState);

    const before = manifestWith(['title', 'link', 'assigneeId']);
    const afterDelete = removePropertyFromEntity(before, 'task', 'assigneeId');
    // Another client removed `link` in the meantime, so the deletion must be replayed
    // on their manifest rather than re-posting the stale one.
    const serverLatest = manifestWith(['title', 'assigneeId']);

    const h = harness(before);
    const manifestEtagRef = { current: 'etag-stale' };

    putManifestApiMock
      .mockRejectedValueOnce(new ApiError(412, 'conflict'))
      .mockResolvedValueOnce('"etag-final"');
    fetchProjectStateMock.mockResolvedValueOnce({
      project: { ...projectWith(serverLatest) },
      manifestEtag: 'etag-fresh',
    });

    const onError = vi.fn();
    updateSchemaAction({
      activeProjectId: 'p1',
      newManifest: afterDelete,
      options: {
        removeEntityProperty: { entityId: 'task', propName: 'assigneeId' },
        rebuild: (latest) =>
          removePropertyFromEntity(latest, 'task', 'assigneeId', { missingOk: true }),
        onError,
      },
      setActiveProject: h.setActiveProject,
      manifestEtagRef,
      refreshActiveProject: vi.fn(),
    });
    await waitForManifestPutQueueDrain('p1');

    expect(putManifestApiMock).toHaveBeenCalledTimes(2);
    expect(putManifestApiMock.mock.calls[0]?.[2]).toBe('etag-stale');
    expect(putManifestApiMock.mock.calls[1]?.[2]).toBe('etag-fresh');
    expect(taskProps(putManifestApiMock.mock.calls[1]?.[1] as ProjectManifest)).toEqual([
      'title',
    ]);
    expect(manifestEtagRef.current).toBe('etag-final');
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports the failure and refreshes when the write cannot be persisted', async () => {
    const putManifestApiMock = vi.mocked(putManifestApi);
    const fetchProjectStateMock = vi.mocked(fetchProjectState);

    const before = manifestWith(['title', 'assigneeId']);
    const afterDelete = removePropertyFromEntity(before, 'task', 'assigneeId');
    const h = harness(before);
    const manifestEtagRef = { current: 'etag-stale' };

    putManifestApiMock.mockRejectedValue(new ApiError(412, 'conflict'));
    fetchProjectStateMock.mockResolvedValue({
      project: projectWith(before),
      manifestEtag: 'etag-fresh',
    });

    const onError = vi.fn();
    const refreshActiveProject = vi.fn();
    updateSchemaAction({
      activeProjectId: 'p1',
      newManifest: afterDelete,
      options: {
        removeEntityProperty: { entityId: 'task', propName: 'assigneeId' },
        rebuild: (latest) =>
          removePropertyFromEntity(latest, 'task', 'assigneeId', { missingOk: true }),
        onError,
      },
      setActiveProject: h.setActiveProject,
      manifestEtagRef,
      refreshActiveProject,
    });
    await waitForManifestPutQueueDrain('p1');

    expect(onError).toHaveBeenCalledTimes(1);
    expect(refreshActiveProject).toHaveBeenCalledTimes(1);
  });

  it('drops the deleted key from the entities it holds', async () => {
    const putManifestApiMock = vi.mocked(putManifestApi);
    putManifestApiMock.mockResolvedValue('"etag-final"');

    const before = manifestWith(['title', 'assigneeId']);
    const h = harness(before);

    updateSchemaAction({
      activeProjectId: 'p1',
      newManifest: removePropertyFromEntity(before, 'task', 'assigneeId'),
      options: { removeEntityProperty: { entityId: 'task', propName: 'assigneeId' } },
      setActiveProject: h.setActiveProject,
      manifestEtagRef: { current: 'etag-0' },
      refreshActiveProject: vi.fn(),
    });
    await waitForManifestPutQueueDrain('p1');

    expect(h.project?.entities?.[0]?.properties).not.toHaveProperty('assigneeId');
    expect(taskProps(h.project!.config.manifest)).toEqual(['title']);
  });
});
