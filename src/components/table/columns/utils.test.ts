import { describe, it, expect } from 'vitest';
import { normalizeLinkTaskKeys } from './utils';

describe('normalizeLinkTaskKeys', () => {
  it('normalizes string and array values', () => {
    expect(normalizeLinkTaskKeys(' ABC ')).toEqual(['ABC']);
    expect(normalizeLinkTaskKeys(['A', ' ', 'B'])).toEqual(['A', 'B']);
  });

  it('returns empty array for invalid values', () => {
    expect(normalizeLinkTaskKeys(null)).toEqual([]);
    expect(normalizeLinkTaskKeys(undefined)).toEqual([]);
  });
});
