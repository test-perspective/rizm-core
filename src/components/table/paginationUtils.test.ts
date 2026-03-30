import { describe, expect, it } from 'vitest';
import { clampPage, getMaxPage, getPageAfterFilterChange } from './paginationUtils';

describe('paginationUtils', () => {
  it('getMaxPage returns 0 when no rows', () => {
    expect(getMaxPage(0, 20)).toBe(0);
  });

  it('getMaxPage rounds up correctly', () => {
    expect(getMaxPage(1, 20)).toBe(0);
    expect(getMaxPage(20, 20)).toBe(0);
    expect(getMaxPage(21, 20)).toBe(1);
  });

  it('clampPage clamps to range', () => {
    expect(clampPage(-1, 100, 20)).toBe(0);
    expect(clampPage(0, 100, 20)).toBe(0);
    expect(clampPage(4, 100, 20)).toBe(4);
    expect(clampPage(5, 100, 20)).toBe(4);
  });

  it('getPageAfterFilterChange always resets to first page', () => {
    expect(getPageAfterFilterChange(100, 20)).toBe(0);
    expect(getPageAfterFilterChange(1, 20)).toBe(0);
  });
});
