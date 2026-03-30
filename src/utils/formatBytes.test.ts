import { describe, expect, it } from 'vitest';
import { formatBytes } from './formatBytes';

describe('formatBytes', () => {
  it('returns 0 B for 0', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('returns bytes for small values', () => {
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(512)).toBe('512 B');
  });

  it('returns KiB for values >= 1024', () => {
    expect(formatBytes(1024)).toBe('1.0 KiB');
    expect(formatBytes(1536)).toBe('1.5 KiB');
    expect(formatBytes(950 * 1024)).toBe('950.0 KiB');
  });

  it('returns MiB for values >= 1024*1024', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MiB');
    expect(formatBytes(12.3 * 1024 * 1024)).toBe('12.3 MiB');
  });

  it('returns GiB for large values', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GiB');
  });

  it('handles edge cases', () => {
    expect(formatBytes(-1)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
    expect(formatBytes(Infinity)).toBe('0 B');
  });
});
