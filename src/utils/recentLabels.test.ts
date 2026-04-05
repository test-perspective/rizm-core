import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildLabelOptionsWithRecent,
  DEFAULT_RECENT_LABELS_PINNED_COUNT,
  getRecentLabels,
  labelAutocompletePassthroughFilterOptions,
  recordRecentLabels,
} from './recentLabels';

describe('recentLabels', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('records labels in most-recent-first order without duplicates', () => {
    recordRecentLabels('task', 'labels', ['beta6', 'urgent']);
    recordRecentLabels('task', 'labels', ['urgent', 'frontend', '']);

    expect(getRecentLabels('task', 'labels')).toEqual(['frontend', 'urgent', 'beta6']);
  });

  it('builds options with recent labels pinned first', () => {
    recordRecentLabels('task', 'labels', ['ops', 'frontend', 'backend']);

    const result = buildLabelOptionsWithRecent({
      entityTypeId: 'task',
      propName: 'labels',
      options: ['backend', 'alpha', 'frontend', 'ops', 'qa'],
      inputValue: '',
      pinnedCount: DEFAULT_RECENT_LABELS_PINNED_COUNT,
      maxOptionsDisplay: 5,
    });

    expect(result).toEqual(['backend', 'frontend', 'ops', 'alpha', 'qa']);
  });

  it('applies filtering first, then recent pinning', () => {
    recordRecentLabels('task', 'labels', ['beta6', 'backend', 'build']);

    const result = buildLabelOptionsWithRecent({
      entityTypeId: 'task',
      propName: 'labels',
      options: ['frontend', 'backend', 'beta6', 'build', 'ops'],
      inputValue: 'b',
      pinnedCount: 2,
      maxOptionsDisplay: 5,
    });

    expect(result).toEqual(['build', 'backend', 'beta6']);
  });

  it('filters Japanese label options by substring (REQ-243)', () => {
    const result = buildLabelOptionsWithRecent({
      entityTypeId: 'task',
      propName: 'labels',
      options: ['障害対応', '設計', '要確認'],
      inputValue: '障',
      maxOptionsDisplay: 5,
    });
    expect(result).toEqual(['障害対応']);
  });

  it('trims input when filtering so trailing spaces still match (REQ-243)', () => {
    const result = buildLabelOptionsWithRecent({
      entityTypeId: 'task',
      propName: 'labels',
      options: ['backend', 'frontend'],
      inputValue: 'back ',
      maxOptionsDisplay: 5,
    });
    expect(result).toEqual(['backend']);
  });

  it('matches labels when query and option differ only by Unicode normalization (NFC)', () => {
    const nfc = '\u304c\u304d'; // がき
    const queryNfd = '\u304b\u3099\u304d'; // が + き (が as ka + combining dakuten)
    const result = buildLabelOptionsWithRecent({
      entityTypeId: 'task',
      propName: 'labels',
      options: [nfc, 'other'],
      inputValue: queryNfd,
      maxOptionsDisplay: 5,
    });
    expect(result).toEqual([nfc]);
  });

  it('labelAutocompletePassthroughFilterOptions returns options unchanged for MUI Autocomplete', () => {
    const opts = ['a', 'b'];
    expect(labelAutocompletePassthroughFilterOptions(opts)).toBe(opts);
  });

  it('keeps only up to 20 recent labels', () => {
    const many = Array.from({ length: 25 }, (_, index) => `label-${index + 1}`);
    recordRecentLabels('task', 'labels', many);

    const recent = getRecentLabels('task', 'labels');
    expect(recent).toHaveLength(20);
    expect(recent[0]).toBe('label-25');
    expect(recent[recent.length - 1]).toBe('label-6');
  });

  it('returns safe defaults when storage access throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('disabled');
    });

    const recent = getRecentLabels('task', 'labels');
    expect(recent).toEqual([]);

    const options = buildLabelOptionsWithRecent({
      entityTypeId: 'task',
      propName: 'labels',
      options: ['alpha', 'beta'],
      inputValue: '',
      maxOptionsDisplay: 5,
    });
    expect(options).toEqual(['alpha', 'beta']);
  });
});
