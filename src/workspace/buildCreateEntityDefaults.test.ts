import { describe, expect, test } from 'vitest';
import type { Entity, PropertyDefinition, ViewConfig } from '../types';
import { ORDER_KEY } from '../components/board/boardOrder';
import { buildDefaultPropertiesForNewEntity } from './buildCreateEntityDefaults';

const statusProp: PropertyDefinition = {
  name: 'status',
  type: 'select',
  options: ['Todo', 'Backlog', 'Done', 'In Progress'],
};

const titleProp: PropertyDefinition = {
  name: 'title',
  type: 'text',
};

function boardView(overrides: Partial<ViewConfig> = {}): ViewConfig {
  return {
    id: 'board',
    name: 'Board',
    type: 'board',
    entityId: 'task',
    groupBy: 'status',
    visibleProperties: ['title'],
    ...overrides,
  };
}

function taskEntity(id: string, status: string, order?: number): Entity {
  return {
    id,
    entityId: 'task',
    createdAt: 1000,
    updatedAt: 1000,
    properties: {
      title: `Task ${id}`,
      status,
      ...(order !== undefined ? { [ORDER_KEY]: order } : {}),
    },
  };
}

describe('buildDefaultPropertiesForNewEntity', () => {
  test('uses leftmost visible lane when groupByValue is not specified', () => {
    const view = boardView({ hiddenColumns: ['Todo', 'Done', 'In Progress'] });
    const props = buildDefaultPropertiesForNewEntity({
      currentView: view,
      properties: [statusProp, titleProp],
      currentEntities: [],
    });

    expect(props.status).toBe('Backlog');
    expect(props.title).toBe('');
    expect(props[ORDER_KEY]).toBe(0);
  });

  test('uses specified lane when groupByValue is provided', () => {
    const view = boardView({ hiddenColumns: ['Todo', 'Done', 'In Progress'] });
    const props = buildDefaultPropertiesForNewEntity({
      currentView: view,
      properties: [statusProp, titleProp],
      currentEntities: [taskEntity('1', 'Done', 1000)],
      groupByValue: 'Done',
    });

    expect(props.status).toBe('Done');
    expect(props[ORDER_KEY]).toBe(2000);
  });

  test('computes order at bottom of the specified lane', () => {
    const view = boardView();
    const props = buildDefaultPropertiesForNewEntity({
      currentView: view,
      properties: [statusProp, titleProp],
      currentEntities: [
        taskEntity('1', 'In Progress', 2000),
        taskEntity('2', 'In Progress', 5000),
        taskEntity('3', 'Todo', 1000),
      ],
      groupByValue: 'In Progress',
    });

    expect(props.status).toBe('In Progress');
    expect(props[ORDER_KEY]).toBe(6000);
  });

  test('uses an explicit order instead of appending to the lane', () => {
    const view = boardView();
    const props = buildDefaultPropertiesForNewEntity({
      currentView: view,
      properties: [statusProp, titleProp],
      currentEntities: [
        taskEntity('1', 'In Progress', 2000),
        taskEntity('2', 'In Progress', 5000),
      ],
      groupByValue: 'In Progress',
      order: 3500,
    });

    expect(props.status).toBe('In Progress');
    expect(props[ORDER_KEY]).toBe(3500);
  });

  test('omits order when lane peers have no __keelOrder so new entity sorts last by createdAt', () => {
    const view = boardView();
    const props = buildDefaultPropertiesForNewEntity({
      currentView: view,
      properties: [statusProp, titleProp],
      currentEntities: [taskEntity('1', 'Done'), taskEntity('2', 'Done')],
      groupByValue: 'Done',
    });

    expect(props.status).toBe('Done');
    expect(props[ORDER_KEY]).toBeUndefined();
  });
});
