import { describe, expect, it } from 'vitest';
import type { Entity } from '../../types';
import { resolveRowActionTargets } from './tableMoveSelection';

function task(id: string): Entity {
  return { id, entityId: 'task', createdAt: 0, updatedAt: 0, properties: { taskKey: id } };
}

const entities = [task('t1'), task('t2'), task('t3')];

describe('resolveRowActionTargets', () => {
  it('acts on every row the cell selection covers', () => {
    const cells = [
      { id: 't1', field: 'title' },
      { id: 't1', field: 'status' },
      { id: 't2', field: 'title' },
    ];
    const targets = resolveRowActionTargets(cells, task('t1'), entities);
    expect(targets.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('acts on the clicked row alone when it is outside the selection', () => {
    const cells = [{ id: 't1', field: 'title' }];
    const targets = resolveRowActionTargets(cells, task('t3'), entities);
    expect(targets.map((t) => t.id)).toEqual(['t3']);
  });

  it('acts on the clicked row alone when nothing is selected', () => {
    expect(resolveRowActionTargets([], task('t2'), entities).map((t) => t.id)).toEqual(['t2']);
  });

  it('returns nothing without a clicked row', () => {
    expect(resolveRowActionTargets([{ id: 't1', field: 'title' }], null, entities)).toEqual([]);
  });
});
