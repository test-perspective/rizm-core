import { describe, it, expect } from 'vitest';
import type { Entity } from '../../../types';
import { normalizeTaskKeys, filterLinkableEntities, buildLinkedEntities } from './linkUtils';

const makeEntity = (id: string, taskKey?: string, title?: string): Entity => ({
  id,
  entityId: 'task',
  createdAt: 0,
  updatedAt: 0,
  properties: {
    ...(taskKey ? { taskKey } : {}),
    ...(title ? { title } : {}),
  },
});

describe('linkUtils', () => {
  it('normalizes task keys from string or array', () => {
    expect(normalizeTaskKeys(' ABC ')).toEqual(['ABC']);
    expect(normalizeTaskKeys(['A', '  ', 'B'])).toEqual(['A', 'B']);
    expect(normalizeTaskKeys(null)).toEqual([]);
  });

  it('builds linked entities from task keys', () => {
    const entities = [makeEntity('1', 'T-1'), makeEntity('2', 'T-2')];
    const result = buildLinkedEntities(['T-2', 'T-3'], entities);
    expect(result).toEqual([
      { taskKey: 'T-2', entity: entities[1] },
      { taskKey: 'T-3', entity: null },
    ]);
  });

  it('filters entities by query and excludes current entity', () => {
    const entities = [
      makeEntity('1', 'ABC-1', 'Alpha'),
      makeEntity('2', 'XYZ-2', 'Beta'),
    ];
    const result = filterLinkableEntities(entities, '1', 'be');
    expect(result.map((e) => e.id)).toEqual(['2']);
  });
});
