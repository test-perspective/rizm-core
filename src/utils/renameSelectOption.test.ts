import { describe, expect, it } from 'vitest';
import { parseProjectManifest } from './manifestValidation';
import { finalizeSelectOptionRenameInManifest, prepareSelectOptionRenameInManifest } from './renameSelectOption';

const baseManifest = {
  name: 'App',
  entities: [
    {
      id: 'task',
      name: 'Task',
      namePlural: 'Tasks',
      properties: [
        { name: 'title', type: 'text' as const, visible: true },
        {
          name: 'status',
          type: 'select' as const,
          options: ['Todo', 'Done'],
          visible: true,
        },
      ],
    },
  ],
  views: [
    {
      id: 'b',
      name: 'Board',
      type: 'board' as const,
      entityId: 'task',
      groupBy: 'status',
      visibleProperties: ['title'],
      columnOrder: ['Done', 'Todo'],
      hiddenColumns: ['Todo'],
      boardDividers: [
        { id: 'd1', title: 'A', columnId: 'Todo' },
        { id: 'd2', title: 'B', columnId: 'Done' },
      ],
    },
  ],
  defaultView: 'b',
};

describe('prepareSelectOptionRenameInManifest', () => {
  it('inserts new option after old so both labels exist', () => {
    const next = prepareSelectOptionRenameInManifest(baseManifest, 'task', 'status', 'Todo', 'To Do');
    const status = next.entities[0]!.properties.find((p) => p.name === 'status')!;
    expect(status.options).toEqual(['Todo', 'To Do', 'Done']);

    const board = next.views.find((v) => v.id === 'b')!;
    expect(board.columnOrder).toEqual(['Done', 'Todo']);
    expect(board.hiddenColumns).toEqual(['Todo']);
  });

  it('validates parseProjectManifest', () => {
    const prep = prepareSelectOptionRenameInManifest(baseManifest, 'task', 'status', 'Todo', 'To Do');
    expect(() => parseProjectManifest(prep)).not.toThrow();
  });
});

describe('finalizeSelectOptionRenameInManifest', () => {
  it('collapses old into new and updates board refs', () => {
    const prep = prepareSelectOptionRenameInManifest(baseManifest, 'task', 'status', 'Todo', 'To Do');
    const fin = finalizeSelectOptionRenameInManifest(prep, 'task', 'status', 'Todo', 'To Do');
    const status = fin.entities[0]!.properties.find((p) => p.name === 'status')!;
    expect(status.options).toEqual(['To Do', 'Done']);

    const board = fin.views.find((v) => v.id === 'b')!;
    expect(board.columnOrder).toEqual(['Done', 'To Do']);
    expect(board.hiddenColumns).toEqual(['To Do']);
    expect(board.boardDividers).toEqual([
      { id: 'd1', title: 'A', columnId: 'To Do' },
      { id: 'd2', title: 'B', columnId: 'Done' },
    ]);
  });

  it('is idempotent when old option is already gone', () => {
    const alreadyDone = finalizeSelectOptionRenameInManifest(
      prepareSelectOptionRenameInManifest(baseManifest, 'task', 'status', 'Todo', 'To Do'),
      'task',
      'status',
      'Todo',
      'To Do'
    );
    const again = finalizeSelectOptionRenameInManifest(alreadyDone, 'task', 'status', 'Todo', 'To Do');
    expect(again).toBe(alreadyDone);
  });

  it('validates parseProjectManifest after finalize', () => {
    const prep = prepareSelectOptionRenameInManifest(baseManifest, 'task', 'status', 'Todo', 'To Do');
    const fin = finalizeSelectOptionRenameInManifest(prep, 'task', 'status', 'Todo', 'To Do');
    expect(() => parseProjectManifest(fin)).not.toThrow();
  });
});
