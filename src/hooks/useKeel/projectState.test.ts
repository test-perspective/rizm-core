import { describe, expect, it } from 'vitest';
import type { Entity, Project } from '../../types';
import { applyProjectState, mergePendingCreatedEntities } from './projectState';

function entity(id: string, updatedAt = 1): Entity {
  return {
    id,
    entityId: 'task',
    createdAt: 1,
    updatedAt,
    properties: { title: id },
  };
}

function project(entities: Entity[]): Project {
  return {
    id: 'p1',
    name: 'Project',
    createdAt: 1,
    updatedAt: 1,
    entities,
    config: {
      manifest: {
        name: 'Project',
        defaultView: 'board',
        entities: [],
        views: [],
      },
    },
  };
}

describe('mergePendingCreatedEntities', () => {
  it('keeps an entity while its create request is pending', () => {
    const pendingEntity = entity('pending');
    const pending = new Map([
      [
        pendingEntity.id,
        {
          projectId: 'p1',
          entity: pendingEntity,
          status: 'creating' as const,
        },
      ],
    ]);

    expect(mergePendingCreatedEntities(project([]), 'p1', pending).project.entities).toEqual([pendingEntity]);
  });

  it('stops merging after the server returns the entity', () => {
    const serverEntity = entity('created', 2);
    const pending = new Map([
      [
        serverEntity.id,
        {
          projectId: 'p1',
          entity: entity('created'),
          status: 'confirmed' as const,
          etag: '"created-etag"',
          confirmedAt: 1_000,
        },
      ],
    ]);

    const result = mergePendingCreatedEntities(project([serverEntity]), 'p1', pending, 2_000);

    expect(result.project.entities).toEqual([serverEntity]);
    expect(result.pendingCreatedEntities.has(serverEntity.id)).toBe(false);
    expect(result.etagOverrides).toEqual({});
  });

  it('drops a confirmed entity missing from refreshes after the grace period', () => {
    const confirmedEntity = entity('confirmed');
    const pending = new Map([
      [
        confirmedEntity.id,
        {
          projectId: 'p1',
          entity: confirmedEntity,
          status: 'confirmed' as const,
          etag: '"created-etag"',
          confirmedAt: 1_000,
        },
      ],
    ]);

    const result = mergePendingCreatedEntities(project([]), 'p1', pending, 31_001);

    expect(result.project.entities).toEqual([]);
    expect(result.pendingCreatedEntities.has(confirmedEntity.id)).toBe(false);
  });

  it('retains entries for another project without merging them', () => {
    const otherEntity = entity('other');
    const pending = new Map([
      [
        otherEntity.id,
        {
          projectId: 'p2',
          entity: otherEntity,
          status: 'creating' as const,
        },
      ],
    ]);

    const result = mergePendingCreatedEntities(project([]), 'p1', pending);

    expect(result.project.entities).toEqual([]);
    expect(result.pendingCreatedEntities.has(otherEntity.id)).toBe(true);
  });

  it('keeps the create response etag when applying a stale refresh', () => {
    const confirmedEntity = entity('confirmed', 2);
    const pendingCreatedEntitiesRef = {
      current: new Map([
        [
          confirmedEntity.id,
          {
            projectId: 'p1',
            entity: confirmedEntity,
            status: 'confirmed' as const,
            etag: '"created-etag"',
            confirmedAt: Date.now(),
          },
        ],
      ]),
    };
    const entityEtagByIdRef = { current: {} as Record<string, string> };
    const appliedProjects: Array<Project | null> = [];

    applyProjectState({
      project: project([]),
      manifestEtag: '"manifest"',
      projectId: 'p1',
      setActiveProject: (next) => {
        appliedProjects.push(next);
      },
      setActiveProjectId: () => undefined,
      manifestEtagRef: { current: '0' },
      entityEtagByIdRef,
      pendingCreatedEntitiesRef,
    });

    expect(appliedProjects[0]?.entities).toEqual([confirmedEntity]);
    expect(entityEtagByIdRef.current[confirmedEntity.id]).toBe('"created-etag"');
  });
});
