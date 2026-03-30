import { describe, expect, it } from 'vitest';
import type { Entity } from '../../types';
import { parseDropTarget } from './wikiDndTarget';
import { computeTreeMove } from './wikiTreeOrder';

const mk = (id: string, parentId: string | null, order: number): Entity => ({
  id,
  entityId: 'wikiPage',
  createdAt: 0,
  updatedAt: 0,
  properties: {
    title: id,
    nodeType: 'page',
    parentId,
    __keelOrder: order,
  },
});

describe('wikiDndTarget', () => {
  it('parses inside, before, and after drop ids', () => {
    expect(parseDropTarget('inside:p1')).toEqual({ type: 'inside', parentId: 'p1' });
    expect(parseDropTarget('before:p2')).toEqual({ type: 'before', siblingId: 'p2' });
    expect(parseDropTarget('after:p3')).toEqual({ type: 'after', siblingId: 'p3' });
  });

  it('falls back to inside for legacy plain ids', () => {
    expect(parseDropTarget('legacy-row-id')).toEqual({ type: 'inside', parentId: 'legacy-row-id' });
  });
});

describe('computeTreeMove guards invalid tree targets', () => {
  it('keeps current position when moving inside descendant', () => {
    const a = mk('a', null, 0);
    const b = mk('b', 'a', 1000);
    const c = mk('c', 'b', 2000);
    const entityById = { a, b, c };

    const result = computeTreeMove('a', { type: 'inside', parentId: 'c' }, entityById);
    expect(result.parentId).toBeNull();
    expect(result.order).toBe(0);
    expect(result.reindex).toEqual([]);
  });

  it('keeps current position when before-target sibling is itself', () => {
    const a = mk('a', null, 0);
    const b = mk('b', null, 1000);
    const entityById = { a, b };

    const result = computeTreeMove('a', { type: 'before', siblingId: 'a' }, entityById);
    expect(result.parentId).toBeNull();
    expect(result.order).toBe(0);
    expect(result.reindex).toEqual([]);
  });
});
