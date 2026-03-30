import { describe, expect, test } from 'vitest';
import type { PropertyDefinition, ViewConfig } from '../types';
import { getInitialGroupByValueForNewEntity, getVisibleBoardColumns } from './boardColumns';

const statusProp: PropertyDefinition = {
  name: 'status',
  type: 'select',
  options: ['Todo', 'Backlog', 'Done', 'In Progress'],
};

const otherProp: PropertyDefinition = {
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

describe('boardColumns', () => {
  test('filters hiddenColumns from ordered columns', () => {
    const view = boardView({
      hiddenColumns: ['Todo', 'Done', 'In Progress'],
    });

    const cols = getVisibleBoardColumns(view, [statusProp, otherProp]);
    expect(cols).toEqual(['Backlog']);
    expect(getInitialGroupByValueForNewEntity(view, [statusProp, otherProp])).toBe('Backlog');
  });

  test('respects columnOrder when determining leftmost visible column', () => {
    const view = boardView({
      columnOrder: ['Done', 'Backlog'],
      hiddenColumns: ['Done'],
    });

    const cols = getVisibleBoardColumns(view, [statusProp]);
    // Done is ordered first but hidden, so next visible should be Backlog.
    expect(cols[0]).toBe('Backlog');
    expect(getInitialGroupByValueForNewEntity(view, [statusProp])).toBe('Backlog');
  });

  test('returns empty when groupBy options are missing', () => {
    const view = boardView();
    const cols = getVisibleBoardColumns(view, [otherProp]);
    expect(cols).toEqual([]);
    expect(getInitialGroupByValueForNewEntity(view, [otherProp])).toBeUndefined();
  });
});

