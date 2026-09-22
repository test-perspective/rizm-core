import { describe, expect, it } from 'vitest';
import type { Entity } from '../../types';
import {
  collectTaskMoveSet,
  formatMoveSummary,
  planDetachedRelations,
} from './taskMoveHelpers';

function task(id: string, taskKey: string, properties: Record<string, unknown> = {}): Entity {
  return {
    id,
    entityId: 'task',
    createdAt: 0,
    updatedAt: 0,
    properties: { taskKey, title: id, ...properties },
  };
}

describe('collectTaskMoveSet', () => {
  it('pulls in descendants through parentTaskKey', () => {
    const entities = [
      task('t1', 'AAA-1'),
      task('t2', 'AAA-2', { parentTaskKey: 'AAA-1' }),
      task('t3', 'AAA-3', { parentTaskKey: 'AAA-2' }),
      task('t4', 'AAA-4'),
    ];
    const set = collectTaskMoveSet(['t1'], entities);
    expect(set.rootIds).toEqual(['t1']);
    expect(set.descendantIds).toEqual(['t2', 't3']);
    expect(set.ids).toEqual(['t1', 't2', 't3']);
  });

  it('does not duplicate a descendant that was also picked explicitly', () => {
    const entities = [task('t1', 'AAA-1'), task('t2', 'AAA-2', { parentTaskKey: 'AAA-1' })];
    const set = collectTaskMoveSet(['t1', 't2'], entities);
    expect(set.ids).toEqual(['t1', 't2']);
    // It is counted once, as the subtask it is.
    expect(set.rootIds).toEqual(['t1']);
    expect(set.descendantIds).toEqual(['t2']);
  });

  it('terminates on a parent cycle in broken data', () => {
    const entities = [
      task('t1', 'AAA-1', { parentTaskKey: 'AAA-2' }),
      task('t2', 'AAA-2', { parentTaskKey: 'AAA-1' }),
    ];
    const set = collectTaskMoveSet(['t1'], entities);
    expect(set.ids.sort()).toEqual(['t1', 't2']);
  });

  it('ignores ids that are not tasks in this project', () => {
    const entities = [
      task('t1', 'AAA-1'),
      { id: 'w1', entityId: 'wikiPage', createdAt: 0, updatedAt: 0, properties: {} } as Entity,
    ];
    expect(collectTaskMoveSet(['w1', 'nope'], entities).ids).toEqual([]);
    expect(collectTaskMoveSet(['t1'], entities).ids).toEqual(['t1']);
  });

  it('reads parentTaskKey stored as a single-element array', () => {
    const entities = [task('t1', 'AAA-1'), task('t2', 'AAA-2', { parentTaskKey: ['AAA-1'] })];
    expect(collectTaskMoveSet(['t1'], entities).ids).toEqual(['t1', 't2']);
  });
});

describe('planDetachedRelations', () => {
  it('reports references cut on both sides of the move', () => {
    const entities = [
      task('t1', 'AAA-1', { blockedBy: ['AAA-2'] }),
      task('t2', 'AAA-2', { blockedBy: ['AAA-1'], link: ['AAA-1'] }),
    ];
    const detached = planDetachedRelations(['t1'], entities);
    expect(
      detached.map((d) => `${d.taskKey}.${d.property}=${d.removedKeys.join(',')}`).sort()
    ).toEqual(['AAA-1.blockedBy=AAA-2', 'AAA-2.blockedBy=AAA-1', 'AAA-2.link=AAA-1']);
  });

  it('reports a parent that stays behind', () => {
    const entities = [task('t1', 'AAA-1'), task('t2', 'AAA-2', { parentTaskKey: 'AAA-1' })];
    const detached = planDetachedRelations(['t2'], entities);
    expect(detached).toEqual([
      { taskKey: 'AAA-2', projectId: '', property: 'parentTaskKey', removedKeys: ['AAA-1'] },
    ]);
  });

  it('reports every parent key that stays behind, not just the first', () => {
    const entities = [
      task('t1', 'AAA-1'),
      task('t2', 'AAA-2'),
      task('t3', 'AAA-3', { parentTaskKey: ['AAA-1', 'AAA-2'] }),
    ];
    const detached = planDetachedRelations(['t1', 't3'], entities);
    expect(detached).toEqual([
      { taskKey: 'AAA-3', projectId: '', property: 'parentTaskKey', removedKeys: ['AAA-2'] },
    ]);
  });

  it('reports nothing when the whole subtree moves together', () => {
    const entities = [
      task('t1', 'AAA-1'),
      task('t2', 'AAA-2', { parentTaskKey: 'AAA-1', blockedBy: ['AAA-1'] }),
    ];
    expect(planDetachedRelations(['t1', 't2'], entities)).toEqual([]);
  });
});

describe('formatMoveSummary', () => {
  it('counts roots and subtasks separately', () => {
    expect(formatMoveSummary({ rootIds: ['a'], descendantIds: [], ids: ['a'] })).toBe(
      'Moving 1 task.'
    );
    expect(
      formatMoveSummary({ rootIds: ['a', 'b'], descendantIds: ['c'], ids: ['a', 'b', 'c'] })
    ).toBe('Moving 2 tasks and 1 subtask (3 total).');
  });
});
