import { describe, it, expect } from 'vitest';
import type { PropertyDefinition } from '../../types';
import { getDeferredChanges, getDeferredSaveProperties } from './deferredSave';

describe('entityDetail deferredSave helpers', () => {
  it('collects text and richtext property names', () => {
    const props: PropertyDefinition[] = [
      { name: 'title', type: 'text' },
      { name: 'doc', type: 'richtext' },
      { name: 'status', type: 'select', options: ['Todo'] },
    ];
    const result = getDeferredSaveProperties(props);
    expect(Array.from(result)).toEqual(['title', 'doc']);
  });

  it('extracts only changed deferred properties', () => {
    const deferred = new Set(['title', 'doc']);
    const current = { title: 'New', doc: 'A', status: 'Todo' };
    const lastSaved = { title: 'Old', doc: 'A' };
    const changes = getDeferredChanges(current, lastSaved, deferred);
    expect(changes).toEqual({ title: 'New' });
  });

  it('ignores undefined current values', () => {
    const deferred = new Set(['title']);
    const changes = getDeferredChanges({ title: undefined }, { title: 'Old' }, deferred);
    expect(changes).toEqual({});
  });
});
