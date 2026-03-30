import { describe, expect, it } from 'vitest';
import type { Entity } from '../../types';
import {
  buildWikiTreeRows,
  getNodeType,
  getParentId,
  sortWikiTreeOrder,
} from './wikiTreeHelpers';

const mk = (id: string, parentId: string | null, order: number, nodeType: 'page' | 'folder' = 'page'): Entity => ({
  id,
  entityId: 'wikiPage',
  createdAt: 0,
  updatedAt: 0,
  properties: { title: id, parentId, __keelOrder: order, nodeType },
});

describe('wikiTreeHelpers', () => {
  it('getNodeType returns page for missing nodeType', () => {
    const e: Entity = { id: '1', entityId: 'wikiPage', createdAt: 0, updatedAt: 0, properties: {} };
    expect(getNodeType(e)).toBe('page');
  });

  it('getNodeType returns folder when nodeType is folder', () => {
    const e: Entity = {
      id: '1',
      entityId: 'wikiPage',
      createdAt: 0,
      updatedAt: 0,
      properties: { nodeType: 'folder' },
    };
    expect(getNodeType(e)).toBe('folder');
  });

  it('getParentId returns null for missing parentId', () => {
    const e: Entity = { id: '1', entityId: 'wikiPage', createdAt: 0, updatedAt: 0, properties: {} };
    expect(getParentId(e)).toBeNull();
  });

  it('sortWikiTreeOrder returns depth-first order', () => {
    const pages: Entity[] = [
      mk('c', 'b', 1),
      mk('a', null, 0),
      mk('b', null, 1),
      mk('d', 'b', 0),
    ];
    const ordered = sortWikiTreeOrder(pages);
    const ids = ordered.map((p) => p.id);
    expect(ids).toEqual(['a', 'b', 'd', 'c']);
  });

  it('buildWikiTreeRows shows children when parent is expanded', () => {
    const pages: Entity[] = [
      mk('a', null, 0),
      mk('b', null, 1),
      mk('c', 'b', 0),
    ];
    const rowsCollapsed = buildWikiTreeRows(pages, new Set(), '');
    expect(rowsCollapsed.length).toBe(2);
    expect(rowsCollapsed[0].entity.id).toBe('a');
    expect(rowsCollapsed[1].entity.id).toBe('b');

    const rowsExpanded = buildWikiTreeRows(pages, new Set(['b']), '');
    expect(rowsExpanded.length).toBe(3);
    expect(rowsExpanded[2].entity.id).toBe('c');
    expect(rowsExpanded[2].depth).toBe(1);
  });

  it('buildWikiTreeRows expands folder children when folder is expanded', () => {
    const pages: Entity[] = [
      mk('a', null, 0, 'folder'),
      mk('b', 'a', 0),
    ];
    const rows = buildWikiTreeRows(pages, new Set(['a']), '');
    expect(rows.length).toBe(2);
    expect(rows[1].entity.id).toBe('b');
    expect(rows[1].depth).toBe(1);
  });

  it('buildWikiTreeRows hides folder children when folder is collapsed', () => {
    const pages: Entity[] = [
      mk('a', null, 0, 'folder'),
      mk('b', 'a', 0),
    ];
    const rows = buildWikiTreeRows(pages, new Set(), '');
    expect(rows.length).toBe(1);
    expect(rows[0].entity.id).toBe('a');
  });
});
