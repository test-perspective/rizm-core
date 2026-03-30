import { describe, expect, it } from 'vitest';
import { parseProjectManifest } from './manifestValidation';

describe('parseProjectManifest', () => {
  const base = {
    name: 'Test App',
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
        id: 'table',
        name: 'Table',
        type: 'table',
        entityId: 'task',
        visibleProperties: ['title', 'status'],
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      },
      {
        id: 'kanban',
        name: 'Kanban',
        type: 'board',
        entityId: 'task',
        groupBy: 'status',
        visibleProperties: ['title'],
      },
    ],
    defaultView: 'table',
  };

  it('accepts a valid manifest', () => {
    const m = parseProjectManifest(base);
    expect(m.entities[0]?.name).toBe('Task');
    expect(m.views.find((v) => v.id === 'kanban')?.type).toBe('board');
  });

  it('rejects when defaultView is not an existing view id', () => {
    expect(() => parseProjectManifest({ ...base, defaultView: 'missing' })).toThrow(/defaultView/i);
  });

  it('rejects select property without options', () => {
    const bad = {
      ...base,
      entities: [{ id: 'task', name: 'Task', namePlural: 'Tasks', properties: [{ name: 'status', type: 'select' }] }],
      views: [{ id: 'table', name: 'Table', type: 'table', entityId: 'task', visibleProperties: ['status'] }],
      defaultView: 'table',
    };
    expect(() => parseProjectManifest(bad)).toThrow(/options/i);
  });

  it('accepts labels property without options', () => {
    const ok = {
      ...base,
      entities: [
        {
          id: 'task',
          name: 'Task',
          namePlural: 'Tasks',
          properties: [
            { name: 'title', type: 'text', visible: true },
            { name: 'labels', type: 'labels', visible: true },
          ],
        },
      ],
      views: [{ id: 'table', name: 'Table', type: 'table', entityId: 'task', visibleProperties: ['title', 'labels'] }],
      defaultView: 'table',
    };
    expect(() => parseProjectManifest(ok)).not.toThrow();
  });

  it('rejects labels options with empty strings', () => {
    const bad = {
      ...base,
      entities: [
        {
          id: 'task',
          name: 'Task',
          namePlural: 'Tasks',
          properties: [
            { name: 'title', type: 'text', visible: true },
            { name: 'labels', type: 'labels', options: ['bug', ''], visible: true },
          ],
        },
      ],
      views: [{ id: 'table', name: 'Table', type: 'table', entityId: 'task', visibleProperties: ['title', 'labels'] }],
      defaultView: 'table',
    };
    expect(() => parseProjectManifest(bad)).toThrow(/options/i);
  });

  it('rejects board view without groupBy', () => {
    const bad = {
      ...base,
      views: [
        { id: 'board', name: 'Board', type: 'board', entityId: 'task', visibleProperties: ['title'] },
        ...base.views,
      ],
    };
    expect(() => parseProjectManifest(bad)).toThrow(/groupBy/i);
  });

  it('rejects visibleProperties that reference unknown properties', () => {
    const bad = {
      ...base,
      views: [{ id: 'table', name: 'Table', type: 'table', entityId: 'task', visibleProperties: ['nope'] }],
      defaultView: 'table',
    };
    expect(() => parseProjectManifest(bad)).toThrow(/unknown property/i);
  });

  it('rejects board groupBy that is not select', () => {
    const bad = {
      ...base,
      entities: [
        {
          id: 'task',
          name: 'Task',
          namePlural: 'Tasks',
          properties: [
            { name: 'title', type: 'text' },
            { name: 'status', type: 'text' }, // not select
          ],
        },
      ],
    };
    expect(() => parseProjectManifest(bad)).toThrow(/must be select/i);
  });

  it('accepts entity with valid titleLikeProperty', () => {
    const withTitleLike = {
      ...base,
      entities: [
        {
          id: 'task',
          name: 'Task',
          namePlural: 'Tasks',
          properties: [
            { name: 'title', type: 'text', visible: true },
            { name: 'status', type: 'select', options: ['Todo', 'Done'], visible: true },
          ],
          titleLikeProperty: 'title',
        },
      ],
    };
    const m = parseProjectManifest(withTitleLike);
    expect(m.entities[0]?.titleLikeProperty).toBe('title');
  });

  it('accepts entity with titleLikeProperty "name" when property exists', () => {
    const withName = {
      ...base,
      entities: [
        {
          id: 'contact',
          name: 'Contact',
          namePlural: 'Contacts',
          properties: [
            { name: 'name', type: 'text', visible: true },
            { name: 'status', type: 'select', options: ['Lead', 'Done'], visible: true },
          ],
          titleLikeProperty: 'name',
        },
      ],
      views: [
        { id: 'table', name: 'Table', type: 'table', entityId: 'contact', visibleProperties: ['name', 'status'] },
        { id: 'board', name: 'Board', type: 'board', entityId: 'contact', groupBy: 'status', visibleProperties: ['name'] },
      ],
      defaultView: 'table',
    };
    const m = parseProjectManifest(withName);
    expect(m.entities[0]?.titleLikeProperty).toBe('name');
  });

  it('rejects entity when titleLikeProperty references non-existing property', () => {
    const bad = {
      ...base,
      entities: [
        {
          id: 'task',
          name: 'Task',
          namePlural: 'Tasks',
          properties: [
            { name: 'title', type: 'text', visible: true },
            { name: 'status', type: 'select', options: ['Todo', 'Done'], visible: true },
          ],
          titleLikeProperty: 'missingProp',
        },
      ],
    };
    expect(() => parseProjectManifest(bad)).toThrow(/titleLikeProperty.*must reference an existing property/i);
  });
});

