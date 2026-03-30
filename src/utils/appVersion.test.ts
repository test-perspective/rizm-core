import { describe, expect, it } from 'vitest';
import { getAppVersion } from './appVersion';

describe('getAppVersion', () => {
  it('returns a non-empty string', () => {
    const v = getAppVersion();
    expect(typeof v).toBe('string');
    expect(v.length).toBeGreaterThan(0);
  });
});

