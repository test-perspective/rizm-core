import { describe, expect, it } from 'vitest';
import type { Entity } from '../types';
import { parseProjectManifest } from './manifestValidation';
import { reconcileManifestWithData } from './manifestReconcile';

describe('manifestReconcile', () => {
  it('adds a legacy entity/view when data entityId is missing in the new manifest, and switches defaultView when default would be empty', () => {
    const oldManifest = parseProjectManifest({
      name: 'Old',
      entities: [
        {
          id: 'task',
          name: 'Task',
          namePlural: 'Tasks',
          properties: [{ name: 'title', type: 'text', visible: true }],
        },
      ],
      views: [
        {
          id: 'table',
          name: 'Table',
          type: 'table',
          entityId: 'task',
          visibleProperties: ['title'],
          sortBy: 'updatedAt',
          sortOrder: 'desc',
        },
      ],
      defaultView: 'table',
    });

    const newManifest = parseProjectManifest({
      name: 'CRM',
      entities: [
        {
          id: 'contact',
          name: 'Contact',
          namePlural: 'Contacts',
          properties: [{ name: 'name', type: 'text', visible: true }],
        },
      ],
      views: [
        {
          id: 'table',
          name: 'All Contacts',
          type: 'table',
          entityId: 'contact',
          visibleProperties: ['name'],
          sortBy: 'updatedAt',
          sortOrder: 'desc',
        },
      ],
      defaultView: 'table',
    });

    const entities: Entity[] = [
      {
        id: 'e1',
        entityId: 'task',
        createdAt: 1,
        updatedAt: 2,
        properties: { title: 'Keep me' },
      },
    ];

    const res = reconcileManifestWithData(oldManifest, newManifest, entities);

    // Should be valid manifest shape.
    const validated = parseProjectManifest(res.manifest);

    const legacyView = validated.views.find((v) => v.id.startsWith('legacy-task'));
    expect(legacyView).toBeTruthy();
    expect(legacyView!.entityId).toBe('task');

    // Default view should switch because default entityId has 0 rows.
    expect(validated.defaultView).toBe(legacyView!.id);
  });

  it('merges missing property definitions for same entityId (prevents hiding old fields)', () => {
    const oldManifest = parseProjectManifest({
      name: 'Old',
      entities: [
        {
          id: 'task',
          name: 'Task',
          namePlural: 'Tasks',
          properties: [
            { name: 'title', type: 'text', visible: true },
            { name: 'priority', type: 'select', options: ['Low', 'High'], visible: true },
          ],
        },
      ],
      views: [
        {
          id: 'table',
          name: 'Table',
          type: 'table',
          entityId: 'task',
          visibleProperties: ['title', 'priority'],
        },
      ],
      defaultView: 'table',
    });

    const newManifest = parseProjectManifest({
      name: 'New',
      entities: [
        {
          id: 'task',
          name: 'Task',
          namePlural: 'Tasks',
          properties: [{ name: 'title', type: 'text', visible: true }],
        },
      ],
      views: [
        {
          id: 'table',
          name: 'Table',
          type: 'table',
          entityId: 'task',
          visibleProperties: ['title'],
        },
      ],
      defaultView: 'table',
    });

    const res = reconcileManifestWithData(oldManifest, newManifest, []);
    const validated = parseProjectManifest(res.manifest);
    const task = validated.entities.find((e) => e.id === 'task')!;
    expect(task.properties.some((p) => p.name === 'priority')).toBe(true);
  });

  it('avoids view id collisions when generating legacy views', () => {
    const oldManifest = parseProjectManifest({
      name: 'Old',
      entities: [
        {
          id: 'task',
          name: 'Task',
          namePlural: 'Tasks',
          properties: [{ name: 'title', type: 'text', visible: true }],
        },
      ],
      views: [
        {
          id: 'table',
          name: 'Table',
          type: 'table',
          entityId: 'task',
          visibleProperties: ['title'],
        },
      ],
      defaultView: 'table',
    });

    const newManifest = parseProjectManifest({
      name: 'New',
      entities: [
        {
          id: 'contact',
          name: 'Contact',
          namePlural: 'Contacts',
          properties: [{ name: 'name', type: 'text', visible: true }],
        },
      ],
      views: [
        {
          id: 'legacy-task',
          name: 'Already taken',
          type: 'table',
          entityId: 'contact',
          visibleProperties: ['name'],
        },
      ],
      defaultView: 'legacy-task',
    });

    const entities: Entity[] = [
      {
        id: 'e1',
        entityId: 'task',
        createdAt: 1,
        updatedAt: 2,
        properties: { title: 'Keep me' },
      },
    ];

    const res = reconcileManifestWithData(oldManifest, newManifest, entities);
    const validated = parseProjectManifest(res.manifest);

    expect(validated.views.some((v) => v.id === 'legacy-task-1' && v.entityId === 'task')).toBe(true);
  });
});

