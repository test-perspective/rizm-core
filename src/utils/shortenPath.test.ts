import { describe, expect, it } from 'vitest';
import { shortenPath } from './shortenPath';

describe('shortenPath', () => {
  it('returns last two segments for long paths', () => {
    expect(shortenPath('C:/data/db/keel.sqlite3')).toBe('db/keel.sqlite3');
    expect(shortenPath('/var/lib/keel/data/keel.sqlite3')).toBe('data/keel.sqlite3');
  });

  it('handles backslash separators', () => {
    expect(shortenPath('C:\\Users\\me\\data\\keel.sqlite3')).toBe('data/keel.sqlite3');
  });

  it('returns full path when 2 or fewer segments', () => {
    expect(shortenPath('keel.sqlite3')).toBe('keel.sqlite3');
    expect(shortenPath('data/keel.sqlite3')).toBe('data/keel.sqlite3');
  });

  it('handles empty or invalid input', () => {
    expect(shortenPath('')).toBe('');
  });
});
