import { describe, it, expect } from 'vitest';
import type { Entity } from '../../types';
import { ORDER_GAP, ORDER_KEY } from '../board/boardOrder';
import { computeWikiOrderMigration } from './wikiOrderMigration';

const makePage = (id: string, updatedAt: number, order?: number): Entity => ({
  id,
  entityId: 'wiki',
  createdAt: updatedAt - 1000,
  updatedAt,
  properties: order === undefined ? {} : { [ORDER_KEY]: order },
});

describe('computeWikiOrderMigration', () => {
  it('returns empty updates when nothing to migrate', () => {
    const pages = [makePage('a', 10, 0), makePage('b', 20, 1000)];
    const result = computeWikiOrderMigration(pages, new Set());
    expect(result.updates).toEqual([]);
    expect(result.migratedIds).toEqual([]);
  });

  it('skips pages already migrated', () => {
    const pages = [makePage('a', 10), makePage('b', 20)];
    const result = computeWikiOrderMigration(pages, new Set(['b']));
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].id).toBe('a');
  });

  it('orders updates by updatedAt desc and appends after max order', () => {
    const pages = [
      makePage('existing', 5, 2000),
      makePage('newest', 30),
      makePage('middle', 20),
      makePage('oldest', 10),
    ];
    const result = computeWikiOrderMigration(pages, new Set());
    expect(result.updates.map((u) => u.id)).toEqual(['newest', 'middle', 'oldest']);
    expect(result.updates.map((u) => u.order)).toEqual([
      2000 + ORDER_GAP,
      2000 + ORDER_GAP * 2,
      2000 + ORDER_GAP * 3,
    ]);
  });

  it('uses -ORDER_GAP when no existing orders', () => {
    const pages = [makePage('a', 10), makePage('b', 20)];
    const result = computeWikiOrderMigration(pages, new Set());
    expect(result.updates.map((u) => u.order)).toEqual([0, ORDER_GAP]);
  });
});
