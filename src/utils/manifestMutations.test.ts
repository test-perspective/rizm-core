import { describe, expect, it } from 'vitest';
import type { ProjectManifest } from '../types';
import { parseProjectManifest } from './manifestValidation';
import {
  addPropertyToEntity,
  removePropertyFromEntity,
  reorderPropertiesInEntity,
  reorderViews,
} from './manifestMutations';

describe('manifestMutations', () => {
  const base = parseProjectManifest({
    name: 'Test',
    entities: [
      {
        id: 'task',
        name: 'Task',
        namePlural: 'Tasks',
        properties: [
          { name: 'title', type: 'text', visible: true },
          { name: 'status', type: 'select', options: ['Todo', 'Done'], visible: true },
          { name: 'stage', type: 'select', options: ['A', 'B'], visible: true },
        ],
      },
    ],
    views: [
      {
        id: 'table',
        name: 'Table',
        type: 'table',
        entityId: 'task',
        visibleProperties: ['title', 'status'],
        sortBy: 'status',
        sortOrder: 'asc',
      },
      {
        id: 'board',
        name: 'Board',
        type: 'board',
        entityId: 'task',
        groupBy: 'status',
        visibleProperties: ['title', 'status'],
      },
    ],
    defaultView: 'table',
  });

  it('adds a property definition to the entity and current view visibleProperties', () => {
    const next = addPropertyToEntity(base, 'task', 'table', { name: 'owner', type: 'text', visible: true });
    const validated = parseProjectManifest(next);

    const entity = validated.entities.find((e) => e.id === 'task')!;
    expect(entity.properties.some((p) => p.name === 'owner')).toBe(true);

    const table = validated.views.find((v) => v.id === 'table')!;
    expect(table.visibleProperties.includes('owner')).toBe(true);
  });

  it('removes a property and cleans up visibleProperties/sortBy/groupBy (board stays board when another select exists)', () => {
    const next = removePropertyFromEntity(base, 'task', 'status');
    const validated = parseProjectManifest(next);

    const entity = validated.entities.find((e) => e.id === 'task')!;
    expect(entity.properties.some((p) => p.name === 'status')).toBe(false);

    const table = validated.views.find((v) => v.id === 'table')!;
    expect(table.visibleProperties.includes('status')).toBe(false);
    expect(table.sortBy).toBe('updatedAt');

    const board = validated.views.find((v) => v.id === 'board')!;
    expect(board.type).toBe('board');
    expect(board.groupBy).toBe('stage');
    expect(board.visibleProperties.includes('status')).toBe(false);
  });

  it('converts board -> table when removing the last select used by groupBy', () => {
    const noOtherSelect = parseProjectManifest({
      name: 'Test',
      entities: [
        {
          id: 'task',
          name: 'Task',
          namePlural: 'Tasks',
          properties: [
            { name: 'title', type: 'text', visible: true },
            { name: 'status', type: 'select', options: ['Todo', 'Done'], visible: true },
          ],
        },
      ],
      views: [
        {
          id: 'board',
          name: 'Board',
          type: 'board',
          entityId: 'task',
          groupBy: 'status',
          visibleProperties: ['status'],
        },
      ],
      defaultView: 'board',
    });

    const next = removePropertyFromEntity(noOtherSelect, 'task', 'status');
    const validated = parseProjectManifest(next);
    const v = validated.views.find((x) => x.id === 'board')!;

    expect(v.type).toBe('table');
    expect(v.groupBy).toBeUndefined();
    // visibleProperties must not reference the removed property
    expect(v.visibleProperties.includes('status')).toBe(false);
  });

  // The 412 retry in putManifestWith412Retries replays the caller's intent on the
  // server's newest manifest, which may already reflect the same change (REQ-322).
  it('treats an already-removed property as done when missingOk is set', () => {
    const removed = removePropertyFromEntity(base, 'task', 'stage');
    expect(() => removePropertyFromEntity(removed, 'task', 'stage')).toThrow();
    expect(removePropertyFromEntity(removed, 'task', 'stage', { missingOk: true })).toBe(removed);
  });

  it('keeps taskKey protected even with missingOk', () => {
    expect(() => removePropertyFromEntity(base, 'task', 'taskKey', { missingOk: true })).toThrow(
      /server-managed/
    );
  });

  it('treats an already-present property as done when existingOk is set', () => {
    const prop = { name: 'owner', type: 'text', visible: true } as const;
    const added = addPropertyToEntity(base, 'task', 'table', prop);
    expect(() => addPropertyToEntity(added, 'task', 'table', prop)).toThrow();
    const again = addPropertyToEntity(added, 'task', 'table', prop, { existingOk: true });
    const names = again.entities[0].properties.map((p) => p.name);
    expect(names.filter((n) => n === 'owner')).toHaveLength(1);
  });

  it('reorders non-list views while keeping list views at their positions', () => {
    const manifest: ProjectManifest = {
      name: 'Test',
      entities: [
        {
          id: 'task',
          name: 'Task',
          namePlural: 'Tasks',
          properties: [{ name: 'title', type: 'text', visible: true }],
        },
      ],
      views: [
        { id: 'list1', name: 'List 1', type: 'list', entityId: 'task', visibleProperties: ['title'] },
        { id: 'board', name: 'Board', type: 'board', entityId: 'task', visibleProperties: ['title'] },
        { id: 'table', name: 'Table', type: 'table', entityId: 'task', visibleProperties: ['title'] },
        { id: 'list2', name: 'List 2', type: 'list', entityId: 'task', visibleProperties: ['title'] },
        { id: 'wiki', name: 'Wiki', type: 'wiki', entityId: 'task', visibleProperties: ['title'] },
      ],
      defaultView: 'list1',
    };

    const reordered = reorderViews(manifest, ['table', 'wiki', 'board']);
    const ids = reordered.views.map((v) => v.id);

    expect(ids).toEqual(['list1', 'table', 'wiki', 'list2', 'board']);
  });

  it('throws when ordered ids do not match non-list views', () => {
    const manifest: ProjectManifest = {
      name: 'Test',
      entities: [
        {
          id: 'task',
          name: 'Task',
          namePlural: 'Tasks',
          properties: [{ name: 'title', type: 'text', visible: true }],
        },
      ],
      views: [
        { id: 'list1', name: 'List 1', type: 'list', entityId: 'task', visibleProperties: ['title'] },
        { id: 'board', name: 'Board', type: 'board', entityId: 'task', visibleProperties: ['title'] },
        { id: 'table', name: 'Table', type: 'table', entityId: 'task', visibleProperties: ['title'] },
      ],
      defaultView: 'list1',
    };

    // length mismatch
    expect(() => reorderViews(manifest, ['board'])).toThrow();
    // missing id
    expect(() => reorderViews(manifest, ['board', 'unknown'])).toThrow();
    // duplicate id
    expect(() => reorderViews(manifest, ['board', 'board'])).toThrow();
  });

  describe('reorderPropertiesInEntity', () => {
    it('reorders properties according to orderedPropNames', () => {
      const next = reorderPropertiesInEntity(base, 'task', ['stage', 'title', 'status']);
      const entity = next.entities.find((e) => e.id === 'task')!;
      expect(entity.properties.map((p) => p.name)).toEqual(['stage', 'title', 'status']);
    });

    it('preserves property definitions (type, options, etc)', () => {
      const next = reorderPropertiesInEntity(base, 'task', ['status', 'stage', 'title']);
      const entity = next.entities.find((e) => e.id === 'task')!;
      const status = entity.properties.find((p) => p.name === 'status')!;
      expect(status.type).toBe('select');
      expect(status.options).toEqual(['Todo', 'Done']);
    });

    it('leaves other entities unchanged', () => {
      const multi = parseProjectManifest({
        name: 'Test',
        entities: [
          {
            id: 'task',
            name: 'Task',
            namePlural: 'Tasks',
            properties: [
              { name: 'a', type: 'text', visible: true },
              { name: 'b', type: 'text', visible: true },
            ],
          },
          {
            id: 'other',
            name: 'Other',
            namePlural: 'Others',
            properties: [{ name: 'x', type: 'text', visible: true }],
          },
        ],
        views: [{ id: 'v1', name: 'V1', type: 'table', entityId: 'task', visibleProperties: ['a', 'b'] }],
        defaultView: 'v1',
      });
      const next = reorderPropertiesInEntity(multi, 'task', ['b', 'a']);
      const other = next.entities.find((e) => e.id === 'other')!;
      expect(other.properties.map((p) => p.name)).toEqual(['x']);
    });

    it('throws when entity not found', () => {
      expect(() => reorderPropertiesInEntity(base, 'unknown', ['title', 'status', 'stage'])).toThrow(
        "Entity 'unknown' not found"
      );
    });

    it('throws when orderedPropNames length mismatch', () => {
      expect(() => reorderPropertiesInEntity(base, 'task', ['title', 'status'])).toThrow(
        'reorderPropertiesInEntity: expected 3 property names, got 2'
      );
    });

    it('throws when orderedPropNames missing a property', () => {
      expect(() => reorderPropertiesInEntity(base, 'task', ['title', 'status', 'extra'])).toThrow(
        "reorderPropertiesInEntity: missing property 'stage' in orderedPropNames"
      );
    });
  });
});

