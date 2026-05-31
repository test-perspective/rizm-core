import { describe, expect, it } from 'vitest';
import {
  isInlineContentEmpty,
  looksLikeMarkdownPlainText,
  shouldPastePlainTextInsteadOfHtml,
  stripFirstTemporaryPasteGuard,
  findBlockById,
  TEMP_PASTE_GUARD_CHAR,
} from './richTextEditorPasteHelpers';

describe('richTextEditorPasteHelpers', () => {
  describe('looksLikeMarkdownPlainText', () => {
    it('detects asterisk bullet lists copied as plain text', () => {
      expect(looksLikeMarkdownPlainText('* 455\n  * asasa\n  * fdfdf')).toBe(true);
    });

    it('detects common markdown blocks and inline marks', () => {
      expect(looksLikeMarkdownPlainText('# Heading')).toBe(true);
      expect(looksLikeMarkdownPlainText('| A | B |\n|---|---|')).toBe(true);
      expect(looksLikeMarkdownPlainText('Use **bold** text')).toBe(true);
    });

    it('detects markdown tables copied from generated answers', () => {
      expect(
        looksLikeMarkdownPlainText('| Name | Value |\n| --- | --- |\n| alpha | 1 |')
      ).toBe(true);
    });

    it('does not treat tab-separated Confluence table text as markdown', () => {
      expect(looksLikeMarkdownPlainText('Name\tValue\nalpha\t1')).toBe(false);
    });

    it('does not treat ordinary text as markdown', () => {
      expect(looksLikeMarkdownPlainText('plain text\nwith a second line')).toBe(false);
    });
  });

  describe('shouldPastePlainTextInsteadOfHtml', () => {
    it('detects wiki-style BlockNote clipboard HTML that has a plain text fallback', () => {
      expect(
        shouldPastePlainTextInsteadOfHtml(
          'First wiki line\nSecond wiki line',
          '<div data-pm-slice="1 1 []"><p>First wiki line</p><p>Second wiki line</p></div>'
        )
      ).toBe(true);
    });

    it('keeps rich HTML structures on the HTML path', () => {
      expect(
        shouldPastePlainTextInsteadOfHtml(
          'Name\tValue\nalpha\t1',
          '<table><tbody><tr><td>Name</td><td>Value</td></tr></tbody></table>'
        )
      ).toBe(false);
      expect(
        shouldPastePlainTextInsteadOfHtml(
          'image',
          '<p>image</p><img src="data:image/png;base64,abc">'
        )
      ).toBe(false);
    });

    it('keeps ordinary block HTML on the HTML path so formatting can be preserved', () => {
      expect(
        shouldPastePlainTextInsteadOfHtml(
          'Important link',
          '<div><p><strong>Important</strong> <a href="https://example.com">link</a></p></div>'
        )
      ).toBe(false);
    });
  });

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
