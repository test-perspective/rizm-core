import { describe, it, expect } from 'vitest';
import { blockNoteToPlainText, richTextPreview, formatDateTime } from './richtextPreview';

describe('table richtextPreview helpers', () => {
  describe('blockNoteToPlainText', () => {
    it('returns empty string for nullish or blank inputs', () => {
      expect(blockNoteToPlainText(null)).toBe('');
      expect(blockNoteToPlainText(undefined)).toBe('');
      expect(blockNoteToPlainText('   ')).toBe('');
    });

    it('returns original string when JSON parsing fails', () => {
      expect(blockNoteToPlainText('not json')).toBe('not json');
    });

    it('extracts text from BlockNote-like JSON string', () => {
      const json = JSON.stringify([
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'World' }] },
      ]);
      expect(blockNoteToPlainText(json)).toBe('Hello\nWorld');
    });

    it('handles nested record content', () => {
      const raw = { content: [{ text: 'First' }, { content: [{ text: 'Second' }] }] };
      expect(blockNoteToPlainText(raw)).toBe('First\nSecond');
    });
  });

  describe('richTextPreview', () => {
    it('returns empty string for blank inputs', () => {
      expect(richTextPreview('')).toBe('');
      expect(richTextPreview('   ')).toBe('');
    });

    it('condenses whitespace to single line', () => {
      const input = 'Hello\n  World\tfrom \n\nRizm';
      expect(richTextPreview(input)).toBe('Hello World from Rizm');
    });

    it('truncates to maxChars with ellipsis', () => {
      const longText = 'a'.repeat(10);
      expect(richTextPreview(longText, 6)).toBe('aaaaaa...');
    });
  });

  describe('formatDateTime', () => {
    it('formats valid timestamps', () => {
      const result = formatDateTime(1700000000000);
      expect(result).toBeTypeOf('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
