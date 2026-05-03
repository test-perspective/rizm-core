import type { Entity, PropertyDefinition, ViewConfig } from '../../../types';

export const makeEntity = (id: string, taskKey?: string): Entity => ({
  id,
  entityId: 'task',
  createdAt: 0,
  updatedAt: 0,
  properties: taskKey ? { taskKey } : {},
});

export const baseView: ViewConfig = {
  id: 'view-1',
  name: 'Tasks',
  type: 'table',
  entityId: 'task',
  visibleProperties: ['taskKey', 'title'],
  sortBy: 'updatedAt',
  sortOrder: 'asc',
};

export const orderedProps: PropertyDefinition[] = [
  { name: 'taskKey', type: 'text' },
  { name: 'title', type: 'text' },
];
