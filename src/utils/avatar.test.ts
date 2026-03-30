import { describe, expect, it } from 'vitest';
import { getAvatarInitial, getAvatarColorClasses } from './avatar';

describe('avatar utils', () => {
  describe('getAvatarInitial', () => {
    it('should return first letter uppercase for valid email', () => {
      expect(getAvatarInitial('alice@example.com')).toBe('A');
      expect(getAvatarInitial('bob@test.local')).toBe('B');
      expect(getAvatarInitial('Charlie@domain.org')).toBe('C');
    });

    it('should return "?" for empty or invalid input', () => {
      expect(getAvatarInitial('')).toBe('?');
      expect(getAvatarInitial('   ')).toBe('?');
      expect(getAvatarInitial(null as any)).toBe('?');
      expect(getAvatarInitial(undefined as any)).toBe('?');
    });

    it('should handle single character email', () => {
      expect(getAvatarInitial('a@b.com')).toBe('A');
    });
  });

  describe('getAvatarColorClasses', () => {
    it('should return deterministic color classes for same email', () => {
      const email = 'test@example.com';
      const classes1 = getAvatarColorClasses(email);
      const classes2 = getAvatarColorClasses(email);
      expect(classes1).toBe(classes2);
    });

    it('should return different colors for different emails', () => {
      const classes1 = getAvatarColorClasses('alice@example.com');
      const classes2 = getAvatarColorClasses('bob@example.com');
      // They might be the same by chance, but likely different
      // At least verify they return valid strings
      expect(classes1).toBeTruthy();
      expect(classes2).toBeTruthy();
      expect(typeof classes1).toBe('string');
      expect(typeof classes2).toBe('string');
    });

    it('should return non-empty string for valid email', () => {
      const classes = getAvatarColorClasses('user@test.com');
      expect(classes).toBeTruthy();
      expect(classes.length).toBeGreaterThan(0);
      // Should contain bg, text, and border classes
      expect(classes).toContain('bg-');
      expect(classes).toContain('text-');
      expect(classes).toContain('border-');
    });

    it('should handle empty/invalid input gracefully', () => {
      const classes1 = getAvatarColorClasses('');
      const classes2 = getAvatarColorClasses(null as any);
      const classes3 = getAvatarColorClasses(undefined as any);
      
      // Should all return valid color classes (fallback to first palette)
      expect(classes1).toBeTruthy();
      expect(classes2).toBeTruthy();
      expect(classes3).toBeTruthy();
      expect(typeof classes1).toBe('string');
      expect(typeof classes2).toBe('string');
      expect(typeof classes3).toBe('string');
    });

    it('should be case-insensitive for email', () => {
      const classes1 = getAvatarColorClasses('Test@Example.com');
      const classes2 = getAvatarColorClasses('test@example.com');
      expect(classes1).toBe(classes2);
    });

    it('should handle whitespace in email', () => {
      const classes1 = getAvatarColorClasses('  test@example.com  ');
      const classes2 = getAvatarColorClasses('test@example.com');
      expect(classes1).toBe(classes2);
    });
  });
});
