import { describe, expect, it } from 'vitest';
import {
  parseLabelsValue,
  formatLabelsValue,
  getLabelsGroupingValue,
  isEmptyLabelToken,
  EMPTY_LABEL_GROUP_VALUE,
} from './buildColumnsLabelsUtils';

describe('buildColumnsLabelsUtils', () => {
  describe('parseLabelsValue', () => {
    it('returns empty array for null/undefined', () => {
      expect(parseLabelsValue(null)).toEqual([]);
      expect(parseLabelsValue(undefined)).toEqual([]);
    });
    it('parses array of strings', () => {
      expect(parseLabelsValue(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    });
    it('splits comma-separated string', () => {
      expect(parseLabelsValue('a, b, c')).toEqual(['a', 'b', 'c']);
    });
    it('filters empty and trims', () => {
      expect(parseLabelsValue(['  a  ', '', 'b'])).toEqual(['a', 'b']);
    });
  });

  describe('formatLabelsValue', () => {
    it('joins labels with comma', () => {
      expect(formatLabelsValue(['a', 'b'])).toBe('a, b');
    });
    it('returns empty string for empty array', () => {
      expect(formatLabelsValue([])).toBe('');
    });
  });

  describe('getLabelsGroupingValue', () => {
    it('returns EMPTY_LABEL_GROUP_VALUE for empty', () => {
      expect(getLabelsGroupingValue([])).toBe(EMPTY_LABEL_GROUP_VALUE);
    });
    it('returns formatted value for non-empty', () => {
      expect(getLabelsGroupingValue(['a', 'b'])).toBe('a, b');
    });
  });

  describe('isEmptyLabelToken', () => {
    it('returns true for empty string and dash', () => {
      expect(isEmptyLabelToken('')).toBe(true);
      expect(isEmptyLabelToken('-')).toBe(true);
      expect(isEmptyLabelToken(EMPTY_LABEL_GROUP_VALUE)).toBe(true);
    });
    it('returns false for non-empty', () => {
      expect(isEmptyLabelToken('a')).toBe(false);
    });
  });
});
