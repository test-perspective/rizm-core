import { describe, it, expect } from 'vitest';
import {
  computeWikiUnsavedUpdateForPage,
  computeWikiUnsavedUpdates,
  hasAnyWikiUnsavedChanges,
} from './wikiAutosaveUtils';

describe('wikiAutosaveUtils', () => {
  it('detects changes for a page', () => {
    const update = computeWikiUnsavedUpdateForPage(
      'p1',
      { p1: 'doc' },
      { p1: 'old' },
      { p1: 'title' },
      { p1: 'title' }
    );
    expect(update).toEqual({ pageId: 'p1', patch: { doc: 'doc' } });
  });

  it('returns null when no changes', () => {
    const update = computeWikiUnsavedUpdateForPage(
      'p1',
      { p1: 'doc' },
      { p1: 'doc' },
      { p1: 'title' },
      { p1: 'title' }
    );
    expect(update).toBeNull();
  });

  it('detects title-only changes', () => {
    const update = computeWikiUnsavedUpdateForPage(
      'p1',
      { p1: 'doc' },
      { p1: 'doc' },
      { p1: 'new title' },
      { p1: 'old title' }
    );
    expect(update).toEqual({ pageId: 'p1', patch: { title: 'new title' } });
  });

  it('aggregates updates for multiple pages', () => {
    const updates = computeWikiUnsavedUpdates(
      ['p1', 'p2'],
      { p1: 'doc', p2: 'doc2' },
      { p1: 'old', p2: 'doc2' },
      { p1: 't1', p2: 't2' },
      { p1: 't1', p2: 't2' }
    );
    expect(updates).toEqual([{ pageId: 'p1', patch: { doc: 'doc' } }]);
  });

  it('detects any unsaved changes', () => {
    const hasChanges = hasAnyWikiUnsavedChanges(
      ['p1'],
      { p1: 'doc' },
      { p1: 'old' },
      { p1: 't1' },
      { p1: 't1' }
    );
    expect(hasChanges).toBe(true);
  });
});
