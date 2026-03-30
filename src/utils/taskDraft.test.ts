import { describe, it, expect } from 'vitest';
import { isBlankTitle, shouldDiscardTask } from './taskDraft';

describe('taskDraft', () => {
  describe('isBlankTitle', () => {
    it('should return true for empty string', () => {
      expect(isBlankTitle('')).toBe(true);
    });

    it('should return true for whitespace-only string', () => {
      expect(isBlankTitle('   ')).toBe(true);
      expect(isBlankTitle('\t\n')).toBe(true);
    });

    it('should return false for non-empty string', () => {
      expect(isBlankTitle('Task Title')).toBe(false);
      expect(isBlankTitle('  Task  ')).toBe(false);
    });

    it('should return true for non-string values', () => {
      expect(isBlankTitle(null)).toBe(true);
      expect(isBlankTitle(undefined)).toBe(true);
      expect(isBlankTitle(123)).toBe(true);
      expect(isBlankTitle({})).toBe(true);
      expect(isBlankTitle([])).toBe(true);
    });
  });

  describe('shouldDiscardTask', () => {
    it('should return true for blank title', () => {
      expect(shouldDiscardTask('')).toBe(true);
      expect(shouldDiscardTask('   ')).toBe(true);
    });

    it('should return false for non-blank title', () => {
      expect(shouldDiscardTask('Task Title')).toBe(false);
      expect(shouldDiscardTask('  Task  ')).toBe(false);
    });
  });
});
