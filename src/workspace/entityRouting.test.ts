import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, ProjectManifest, ProjectStateResponse } from '../types';

const fetchProjectState = vi.fn<(projectId: string) => Promise<ProjectStateResponse>>();
vi.mock('../api/projects', () => ({
  fetchProjectState: (projectId: string) => fetchProjectState(projectId),
}));

const setLastWikiPageForProjectView = vi.fn();
vi.mock('./storage', () => ({
  setLastWikiPageForProjectView: (...args: unknown[]) => setLastWikiPageForProjectView(...args),
}));

import {
  buildWorkspacePath,
  EntityNotInProjectError,
  navigateToWorkspaceEntity,
  resolveViewIdForEntityKind,
} from './entityRouting';

const manifest: ProjectManifest = {
  name: 'M',
  entities: [],
  views: [
    { id: 'v-table', name: 'Table', type: 'table', entityId: 'task', visibleProperties: [] },
    { id: 'v-board', name: 'Board', type: 'board', entityId: 'task', visibleProperties: [] },
    { id: 'v-wiki', name: 'Wiki', type: 'wiki', entityId: 'wikiPage', visibleProperties: [] },
  ],
  defaultView: 'v-table',
};

const projectState = (m: ProjectManifest, entityIds: string[] = []): ProjectStateResponse => ({
  project: {
    id: 'p1',
    name: 'P',
    createdAt: 0,
    updatedAt: 0,
    entities: entityIds.map((id) => ({ id })),
    config: { manifest: m },
  } as Project,
  manifestEtag: 'etag',
});

beforeEach(() => {
  fetchProjectState.mockReset();
  setLastWikiPageForProjectView.mockReset();
});

describe('buildWorkspacePath', () => {
  it('builds a view path when no entity is given', () => {
    expect(buildWorkspacePath({ projectId: 'p1', viewId: 'v1' })).toBe('/p/p1/v/v1');
    expect(buildWorkspacePath({ projectId: 'p1', viewId: 'v1', entityId: null })).toBe('/p/p1/v/v1');
  });

  it('appends and encodes the entity id', () => {
    expect(buildWorkspacePath({ projectId: 'p 1', viewId: 'v/1', entityId: 'e#1' })).toBe('/p/p%201/v/v%2F1/e/e%231');
  });
});

describe('resolveViewIdForEntityKind', () => {
  it('prefers the task board over the default view', () => {
    expect(resolveViewIdForEntityKind(manifest, 'task')).toBe('v-board');
  });

  it('picks the wiki view for pages', () => {
    expect(resolveViewIdForEntityKind(manifest, 'page')).toBe('v-wiki');
  });

  it('falls back to the default view, then to the first view', () => {
    const noBoard: ProjectManifest = { ...manifest, views: [manifest.views[0]] };
    expect(resolveViewIdForEntityKind(noBoard, 'task')).toBe('v-table');
    expect(resolveViewIdForEntityKind({ ...noBoard, defaultView: '' }, 'page')).toBe('v-table');
  });
});

describe('navigateToWorkspaceEntity', () => {
  it('loads the project and navigates to the task board', async () => {
    fetchProjectState.mockResolvedValue(projectState(manifest));
    const navigate = vi.fn();

    await navigateToWorkspaceEntity({ kind: 'task', projectId: 'p1', entityPk: 'e1', navigate });

    expect(fetchProjectState).toHaveBeenCalledWith('p1');
    expect(navigate).toHaveBeenCalledWith('/p/p1/v/v-board/e/e1', { replace: false });
    expect(setLastWikiPageForProjectView).not.toHaveBeenCalled();
  });

  it('reuses the active manifest without fetching when the project is already open', async () => {
    const navigate = vi.fn();

    await navigateToWorkspaceEntity({
      kind: 'task',
      projectId: 'p1',
      entityPk: 'e1',
      activeProjectId: 'p1',
      activeManifest: manifest,
      navigate,
    });

    expect(fetchProjectState).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/p/p1/v/v-board/e/e1', { replace: false });
  });

  it('remembers the wiki page before navigating', async () => {
    fetchProjectState.mockResolvedValue(projectState(manifest));
    const calls: string[] = [];
    setLastWikiPageForProjectView.mockImplementation(() => calls.push('remember'));
    const navigate = vi.fn(() => {
      calls.push('navigate');
    });

    await navigateToWorkspaceEntity({ kind: 'page', projectId: 'p1', entityPk: 'w1', navigate });

    expect(setLastWikiPageForProjectView).toHaveBeenCalledWith('p1', 'v-wiki', 'w1');
    expect(calls).toEqual(['remember', 'navigate']);
    expect(navigate).toHaveBeenCalledWith('/p/p1/v/v-wiki/e/w1', { replace: false });
  });

  it('passes navigation state through when given', async () => {
    fetchProjectState.mockResolvedValue(projectState(manifest));
    const navigate = vi.fn();

    await navigateToWorkspaceEntity({
      kind: 'page',
      projectId: 'p1',
      entityPk: 'w1',
      navigate,
      navigateState: { searchQuery: 'hit' },
    });

    expect(navigate).toHaveBeenCalledWith('/p/p1/v/v-wiki/e/w1', {
      replace: false,
      state: { searchQuery: 'hit' },
    });
  });

  it('throws when the project cannot be loaded', async () => {
    fetchProjectState.mockRejectedValue(new Error('boom'));
    const navigate = vi.fn();

    await expect(
      navigateToWorkspaceEntity({ kind: 'task', projectId: 'p1', entityPk: 'e1', navigate })
    ).rejects.toThrow('boom');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('throws EntityNotInProjectError when the loaded project does not hold the entity', async () => {
    fetchProjectState.mockResolvedValue(projectState(manifest, ['other']));
    const navigate = vi.fn();

    await expect(
      navigateToWorkspaceEntity({
        kind: 'page',
        projectId: 'p1',
        entityPk: 'moved-away',
        navigate,
        verifyEntityExists: true,
      })
    ).rejects.toBeInstanceOf(EntityNotInProjectError);
    expect(navigate).not.toHaveBeenCalled();
    expect(setLastWikiPageForProjectView).not.toHaveBeenCalled();
  });

  it('navigates when the entity is present and verification is on', async () => {
    fetchProjectState.mockResolvedValue(projectState(manifest, ['other', 'e1']));
    const navigate = vi.fn();

    await navigateToWorkspaceEntity({
      kind: 'task',
      projectId: 'p1',
      entityPk: 'e1',
      navigate,
      verifyEntityExists: true,
    });

    expect(navigate).toHaveBeenCalledWith('/p/p1/v/v-board/e/e1', { replace: false });
  });

  it('does not verify entity existence unless asked', async () => {
    fetchProjectState.mockResolvedValue(projectState(manifest, ['other']));
    const navigate = vi.fn();

    await navigateToWorkspaceEntity({ kind: 'task', projectId: 'p1', entityPk: 'gone', navigate });

    expect(navigate).toHaveBeenCalledWith('/p/p1/v/v-board/e/gone', { replace: false });
  });

  it('throws when the manifest has no usable view', async () => {
    fetchProjectState.mockResolvedValue(projectState({ ...manifest, views: [], defaultView: '' }));
    const navigate = vi.fn();

    await expect(
      navigateToWorkspaceEntity({ kind: 'task', projectId: 'p1', entityPk: 'e1', navigate })
    ).rejects.toThrow(/No view/);
    expect(navigate).not.toHaveBeenCalled();
  });
});
