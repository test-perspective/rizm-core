import { vi } from 'vitest';
import type { Project } from '../../types';

export function createProject(): Project {
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

/**
 * Create a fresh set of dependencies for `modifyEntityAction`:
 * - a mutable project pointer + a setActiveProject that both reads through
 *   it (so tests can inspect the "current" project after updates)
 * - a starting etag ref of `"1"` for entity `e1`
 * - a vi.fn refreshActiveProject mocked to resolve
 */
export function createModifyEntityHarness() {
  let currentProject: Project | null = createProject();
  const setActiveProject = vi.fn((next: Project | null | ((prev: Project | null) => Project | null)) => {
    currentProject = typeof next === 'function' ? next(currentProject) : next;
  });
  const entityEtagByIdRef = { current: { e1: '"1"' } };
  const refreshActiveProject = vi.fn().mockResolvedValue(undefined);

  return {
    get currentProject() {
      return currentProject;
    },
    setActiveProject,
    entityEtagByIdRef,
    refreshActiveProject,
  };
}
