import { describe, expect, it } from 'vitest';
import type { Entity } from '../../types';
import type { WikiPageMeta } from '../../types';
import {
  buildMoveParentOptions,
  collectWikiSubtreeIds,
  listMoveSiblingMetas,
} from './wikiMoveHelpers';

function page(id: string, parentId: string | null): Entity {
  return {
    id,
    entityId: 'wikiPage',
    createdAt: 0,
    updatedAt: 0,
    properties: {
      title: id,
      doc: '',
      ...(parentId ? { parentId } : {}),
      __keelOrder: 0,
    },
  };
}

describe('wikiMoveHelpers', () => {
  it('collectWikiSubtreeIds includes root and descendants', () => {
    const pages = [page('a', null), page('b', 'a'), page('c', 'b'), page('d', null)];
    const set = collectWikiSubtreeIds('a', pages);
    expect([...set].sort()).toEqual(['a', 'b', 'c']);
  });

  it('buildMoveParentOptions skips excluded ids and their descendants', () => {
    const metas: WikiPageMeta[] = [
      { id: 'a', title: 'A', updatedAt: 0, parentId: null, order: 0 },
      { id: 'b', title: 'B', updatedAt: 0, parentId: 'a', order: 0 },
      { id: 'c', title: 'C', updatedAt: 0, parentId: null, order: 1 },
    ];
    const exclude = new Set(['a', 'b']);
    const opts = buildMoveParentOptions(metas, exclude);
    const ids = opts.map((o) => o.id).filter(Boolean);
    expect(ids).toContain('c');
    expect(ids).not.toContain('a');
    expect(ids).not.toContain('b');
  });

  it('listMoveSiblingMetas filters by parent and exclude set', () => {
    const metas: WikiPageMeta[] = [
      { id: 'x', title: 'X', updatedAt: 0, parentId: null, order: 0 },
      { id: 'y', title: 'Y', updatedAt: 0, parentId: null, order: 1 },
    ];
    const s = listMoveSiblingMetas(metas, null, new Set(['y']));
    expect(s.map((m) => m.id)).toEqual(['x']);
  });
});
