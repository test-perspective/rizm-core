import { describe, it, expect } from 'vitest';
import { compareTaskKeyForSort } from './taskKeySort';

describe('compareTaskKeyForSort', () => {
  it('sorts by numeric sequence within the same project key', () => {
    expect(compareTaskKeyForSort('REQ-2', 'REQ-10')).toBeLessThan(0);
    expect(compareTaskKeyForSort('REQ-10', 'REQ-2')).toBeGreaterThan(0);
    expect(compareTaskKeyForSort('REQ-10', 'REQ-10')).toBe(0);
  });

  it('sorts by project key prefix before sequence', () => {
    expect(compareTaskKeyForSort('AAA-9', 'BBB-1')).toBeLessThan(0);
    expect(compareTaskKeyForSort('BBB-1', 'AAA-9')).toBeGreaterThan(0);
  });

  it('places empty values after non-empty (ascending blanks at end)', () => {
    expect(compareTaskKeyForSort('', 'REQ-1')).toBeGreaterThan(0);
    expect(compareTaskKeyForSort('REQ-1', '')).toBeLessThan(0);
    expect(compareTaskKeyForSort(null, 'REQ-1')).toBeGreaterThan(0);
    expect(compareTaskKeyForSort(undefined, 'REQ-1')).toBeGreaterThan(0);
    expect(compareTaskKeyForSort('', '')).toBe(0);
  });

  it('trims string values', () => {
    expect(compareTaskKeyForSort('  REQ-2  ', 'REQ-10')).toBeLessThan(0);
  });

  it('falls back to string compare when trailing segment is not numeric', () => {
    expect(compareTaskKeyForSort('REQ-abc', 'REQ-def')).toBeLessThan(0);
    // REQ-10 is standard; REQ-abc is raw — full string localeCompare
    const c = compareTaskKeyForSort('REQ-10', 'REQ-abc');
    expect(typeof c).toBe('number');
    expect(c).not.toBeNaN();
  });

  it('handles keys without a hyphen as raw string compare', () => {
    expect(compareTaskKeyForSort('REQ', 'REQA')).toBeLessThan(0);
  });

  it('does not throw on odd inputs', () => {
    expect(() => compareTaskKeyForSort(123 as unknown as string, 'REQ-1')).not.toThrow();
    expect(compareTaskKeyForSort(123 as unknown as string, 'REQ-1')).toBeLessThan(0);
  });
});
