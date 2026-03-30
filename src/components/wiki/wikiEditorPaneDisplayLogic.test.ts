import { describe, expect, it } from 'vitest';
import type { Entity } from '../../types';
import { getDocForEntity } from './wikiEditorPaneDisplayLogic';

const entity = (id: string, doc?: string): Entity => ({
  id,
  entityId: 'wiki',
  createdAt: 0,
  updatedAt: 0,
  properties: doc != null ? { doc } : {},
});

describe('getDocForEntity', () => {
  it('returns doc from docById when available', () => {
    const e = entity('page-1');
    const docById = { 'page-1': '[{"type":"paragraph","content":[]}]' };
    expect(getDocForEntity(e, docById, e)).toBe(docById['page-1']);
  });

  it('returns doc from selected.properties when docById is empty and entity is selected', () => {
    const e = entity('page-1', '[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]');
    const docById: Record<string, string | undefined> = {};
    expect(getDocForEntity(e, docById, e)).toBe('[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]');
  });

  it('returns undefined when docById empty, no properties.doc, and entity is selected', () => {
    const e = entity('page-1');
    const docById: Record<string, string | undefined> = {};
    expect(getDocForEntity(e, docById, e)).toBeUndefined();
  });

  it('returns undefined when entity is not selected and docById has no entry', () => {
    const e = entity('page-1');
    const selected = entity('page-2');
    const docById: Record<string, string | undefined> = {};
    expect(getDocForEntity(e, docById, selected)).toBeUndefined();
  });

  it('returns doc from docById for non-selected entity (showPrevious case)', () => {
    const prevPage = entity('page-1');
    const selected = entity('page-2');
    const docById = { 'page-1': '[{"type":"paragraph","content":[]}]' };
    expect(getDocForEntity(prevPage, docById, selected)).toBe('[{"type":"paragraph","content":[]}]');
  });

  it('returns "[]" when properties.doc is empty string', () => {
    const e = entity('page-1', '');
    const docById: Record<string, string | undefined> = {};
    expect(getDocForEntity(e, docById, e)).toBe('[]');
  });

  it('returns "[]" when properties.doc is whitespace only', () => {
    const e = entity('page-1', '   ');
    const docById: Record<string, string | undefined> = {};
    expect(getDocForEntity(e, docById, e)).toBe('[]');
  });

  it('returns selected.properties.doc when selected is null but entity has doc in cache', () => {
    const e = entity('page-1');
    const docById = { 'page-1': '[]' };
    expect(getDocForEntity(e, docById, null)).toBe('[]');
  });

  describe('content loss prevention', () => {
    it('never returns page B doc when entity is page A', () => {
      const pageA = entity('page-A');
      const pageB = entity('page-B');
      const docById = {
        'page-A': '[{"id":"a1","type":"paragraph","content":[{"type":"text","text":"Page A content"}]}]',
        'page-B': '[{"id":"b1","type":"paragraph","content":[{"type":"text","text":"Page B content"}]}]',
      };
      expect(getDocForEntity(pageA, docById, pageA)).toBe(docById['page-A']);
      expect(getDocForEntity(pageB, docById, pageB)).toBe(docById['page-B']);
      expect(getDocForEntity(pageA, docById, pageB)).toBe(docById['page-A']);
      expect(getDocForEntity(pageB, docById, pageA)).toBe(docById['page-B']);
    });

    it('never overwrites docById content with empty when entity has content in cache', () => {
      const pageA = entity('page-A');
      const docWithContent = '[{"id":"a1","type":"paragraph","content":[{"type":"text","text":"Important content"}]}]';
      const docById = { 'page-A': docWithContent };
      expect(getDocForEntity(pageA, docById, pageA)).toBe(docWithContent);
      expect(getDocForEntity(pageA, docById, pageA)).not.toBe('[]');
      expect(getDocForEntity(pageA, docById, pageA)).not.toBeUndefined();
    });

  it('keeps unresolved selected page undefined until a real source doc exists', () => {
    const pageA = entity('page-A');
    const docById: Record<string, string | undefined> = {};
    expect(getDocForEntity(pageA, docById, pageA)).toBeUndefined();
  });

    it('showPrevious: returns correct doc for previous page, never selected page doc', () => {
      const prevPage = entity('page-1');
      const selected = entity('page-2');
      const docById = {
        'page-1': '[{"id":"p1","type":"paragraph","content":[{"type":"text","text":"Previous"}]}]',
        'page-2': '[{"id":"p2","type":"paragraph","content":[{"type":"text","text":"Selected"}]}]',
      };
      const result = getDocForEntity(prevPage, docById, selected);
      expect(result).toBe(docById['page-1']);
      expect(result).not.toBe(docById['page-2']);
    });
  });
});
