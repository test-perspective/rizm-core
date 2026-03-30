import { describe, it, expect } from 'vitest';
import { getUserDisplayName } from './userDisplay';

describe('getUserDisplayName', () => {
  it('extracts local part from email', () => {
    expect(getUserDisplayName('alice@example.com')).toBe('alice');
    expect(getUserDisplayName('bob.smith@company.org')).toBe('bob.smith');
  });

  it('returns full string if no @ symbol', () => {
    expect(getUserDisplayName('noatsymbol')).toBe('noatsymbol');
  });

  it('handles empty string', () => {
    expect(getUserDisplayName('')).toBe('');
  });

  it('handles email with multiple @ symbols', () => {
    // Takes everything before first @
    expect(getUserDisplayName('test@foo@bar.com')).toBe('test');
  });
});
