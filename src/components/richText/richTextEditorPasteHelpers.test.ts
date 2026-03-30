import { describe, expect, it } from 'vitest';
import {
  isInlineContentEmpty,
  stripFirstTemporaryPasteGuard,
  findBlockById,
  TEMP_PASTE_GUARD_CHAR,
} from './richTextEditorPasteHelpers';

describe('richTextEditorPasteHelpers', () => {
  describe('isInlineContentEmpty', () => {
    it('returns true for non-array', () => {
      expect(isInlineContentEmpty(null)).toBe(true);
      expect(isInlineContentEmpty(undefined)).toBe(true);
    });
    it('returns true for empty array', () => {
      expect(isInlineContentEmpty([])).toBe(true);
    });
    it('returns true when all items are empty text', () => {
      expect(isInlineContentEmpty([{ type: 'text', text: '' }])).toBe(true);
    });
    it('returns false when text has content', () => {
      expect(isInlineContentEmpty([{ type: 'text', text: 'a' }])).toBe(false);
    });
  });

  describe('stripFirstTemporaryPasteGuard', () => {
    it('removes first occurrence of guard char from first text item', () => {
      const content = [{ type: 'text', text: `a${TEMP_PASTE_GUARD_CHAR}b` }];
      const result = stripFirstTemporaryPasteGuard(content);
      expect(result).toEqual([{ type: 'text', text: 'ab' }]);
    });
    it('returns content unchanged when no guard', () => {
      const content = [{ type: 'text', text: 'ab' }];
      expect(stripFirstTemporaryPasteGuard(content)).toBe(content);
    });
  });

  describe('findBlockById', () => {
    it('returns block when id matches', () => {
      const doc = [{ id: 'b1', content: [] }, { id: 'b2', children: [] }];
      expect(findBlockById(doc, 'b2')).toEqual({ id: 'b2', children: [] });
    });
    it('returns null when not found', () => {
      expect(findBlockById([], 'x')).toBeNull();
    });
    it('searches nested children', () => {
      const doc = [{ id: 'b1', children: [{ id: 'b2', children: [] }] }];
      expect(findBlockById(doc, 'b2')).toEqual({ id: 'b2', children: [] });
    });
  });
});
