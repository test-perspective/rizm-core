import { describe, it, expect } from 'vitest';
import type { TaskComment } from '../../utils/comments';
import { syncWikiComments } from './wikiCommentsSync';

describe('syncWikiComments', () => {
  const c1: TaskComment = { id: 'c1', createdAt: 1, doc: 'A' };
  const c2: TaskComment = { id: 'c2', createdAt: 2, doc: 'B' };

  it('updates when safe and different', () => {
    const result = syncWikiComments({
      currentComments: [],
      remoteComments: [c2, c1],
      hasEditing: false,
      hasDirty: false,
      hasNewDraft: false,
    });
    expect(result.shouldUpdate).toBe(true);
    expect(result.nextComments).toEqual([c2, c1]);
  });

  it('skips updates while editing', () => {
    const result = syncWikiComments({
      currentComments: [c1],
      remoteComments: [c2, c1],
      hasEditing: true,
      hasDirty: false,
      hasNewDraft: false,
    });
    expect(result.shouldUpdate).toBe(false);
    expect(result.nextComments).toEqual([c1]);
  });

  it('no-ops when normalized comments match', () => {
    const result = syncWikiComments({
      currentComments: [c2, c1],
      remoteComments: [c2, c1],
      hasEditing: false,
      hasDirty: false,
      hasNewDraft: false,
    });
    expect(result.shouldUpdate).toBe(false);
    expect(result.nextComments).toEqual([c2, c1]);
  });

  it('skips update when remote comments are missing', () => {
    const result = syncWikiComments({
      currentComments: [c2, c1],
      remoteComments: undefined,
      hasEditing: false,
      hasDirty: false,
      hasNewDraft: false,
    });
    expect(result.shouldUpdate).toBe(false);
    expect(result.nextComments).toEqual([c2, c1]);
  });
});
