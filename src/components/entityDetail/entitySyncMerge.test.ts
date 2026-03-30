import { describe, it, expect } from 'vitest';
import type { PropertyDefinition } from '../../types';
import type { TaskComment } from '../../utils/comments';
import { mergeEntityValues, syncEntityComments } from './entitySyncMerge';

describe('mergeEntityValues', () => {
  it('updates only fields without local edits', () => {
    const props: PropertyDefinition[] = [
      { name: 'title', type: 'text' },
      { name: 'status', type: 'select', options: ['Todo', 'Done'] },
    ];
    const currentValues = { title: 'Local', status: 'Todo' };
    const lastSavedValues = { title: 'Remote', status: 'Todo' };
    const remoteValues = { title: 'Remote', status: 'Done' };

    const result = mergeEntityValues({ currentValues, lastSavedValues, remoteValues, properties: props });
    expect(result.nextValues).toEqual({ title: 'Local', status: 'Done' });
    expect(result.nextLastSavedValues).toEqual({ title: 'Remote', status: 'Done' });
  });

  it('tracks updated richtext props', () => {
    const props: PropertyDefinition[] = [
      { name: 'doc', type: 'richtext' },
      { name: 'title', type: 'text' },
    ];
    const currentValues = { doc: 'A', title: 'Old' };
    const lastSavedValues = { doc: 'A', title: 'Old' };
    const remoteValues = { doc: 'B', title: 'Old' };

    const result = mergeEntityValues({ currentValues, lastSavedValues, remoteValues, properties: props });
    expect(result.nextValues.doc).toBe('B');
    expect(result.updatedRichtextProps).toEqual(['doc']);
  });
});

describe('syncEntityComments', () => {
  const c1: TaskComment = { id: 'c1', createdAt: 1, doc: 'A' };
  const c2: TaskComment = { id: 'c2', createdAt: 2, doc: 'B' };

  it('updates comments when safe and different', () => {
    const result = syncEntityComments({
      currentComments: [],
      remoteComments: [c2, c1],
      hasEditing: false,
      hasDirty: false,
      hasNewDraft: false,
    });
    expect(result.shouldUpdate).toBe(true);
    expect(result.nextComments).toEqual([c2, c1]);
  });

  it('skips updates when editing or dirty', () => {
    const result = syncEntityComments({
      currentComments: [c1],
      remoteComments: [c2, c1],
      hasEditing: true,
      hasDirty: false,
      hasNewDraft: false,
    });
    expect(result.shouldUpdate).toBe(false);
    expect(result.nextComments).toEqual([c1]);
  });

  it('no-ops when comments are equal', () => {
    const result = syncEntityComments({
      currentComments: [c2, c1],
      remoteComments: [c2, c1],
      hasEditing: false,
      hasDirty: false,
      hasNewDraft: false,
    });
    expect(result.shouldUpdate).toBe(false);
    expect(result.nextComments).toEqual([c2, c1]);
  });
});
