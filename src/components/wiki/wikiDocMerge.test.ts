import { describe, it, expect } from 'vitest';
import { mergeWikiDoc } from './wikiDocMerge';

const doc = (blocks: Array<Record<string, any>>) => JSON.stringify(blocks);

describe('wikiDocMerge', () => {
  it('keeps local changes when remote is unchanged', () => {
    const base = doc([{ id: 'a', text: 'base' }]);
    const local = doc([{ id: 'a', text: 'local' }]);
    const remote = doc([{ id: 'a', text: 'base' }]);
    expect(mergeWikiDoc({ baseDocJson: base, localDocJson: local, remoteDocJson: remote })).toBe(local);
  });

  it('prefers remote on conflict', () => {
    const base = doc([{ id: 'a', text: 'base' }]);
    const local = doc([{ id: 'a', text: 'local' }]);
    const remote = doc([{ id: 'a', text: 'remote' }]);
    expect(mergeWikiDoc({ baseDocJson: base, localDocJson: local, remoteDocJson: remote })).toBe(remote);
  });

  it('uses remote order', () => {
    const base = doc([
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
    ]);
    const local = base;
    const remote = doc([
      { id: 'b', text: 'B' },
      { id: 'a', text: 'A' },
    ]);
    expect(mergeWikiDoc({ baseDocJson: base, localDocJson: local, remoteDocJson: remote })).toBe(remote);
  });

  it('appends local-only additions after remote order', () => {
    const base = doc([{ id: 'a', text: 'A' }]);
    const local = doc([
      { id: 'a', text: 'A' },
      { id: 'c', text: 'C' },
    ]);
    const remote = doc([{ id: 'a', text: 'A' }]);
    expect(mergeWikiDoc({ baseDocJson: base, localDocJson: local, remoteDocJson: remote })).toBe(local);
  });

  it('returns remote when parsing fails', () => {
    const base = 'not-json';
    const local = doc([{ id: 'a', text: 'local' }]);
    const remote = doc([{ id: 'a', text: 'remote' }]);
    expect(mergeWikiDoc({ baseDocJson: base, localDocJson: local, remoteDocJson: remote })).toBe(remote);
  });

  describe('content loss prevention', () => {
    it('never returns empty when local has content and base/remote are valid', () => {
      const base = doc([{ id: 'a', text: 'base' }]);
      const local = doc([
        { id: 'a', text: 'local edited' },
        { id: 'b', text: 'new block' },
      ]);
      const remote = doc([{ id: 'a', text: 'base' }]);
      const result = mergeWikiDoc({ baseDocJson: base, localDocJson: local, remoteDocJson: remote });
      expect(result).not.toBe('');
      expect(result).not.toBe('[]');
      const parsed = JSON.parse(result);
      expect(parsed.length).toBeGreaterThan(0);
    });

    it('preserves local-only blocks when remote has no changes', () => {
      const base = doc([{ id: 'a', text: 'A' }]);
      const local = doc([
        { id: 'a', text: 'A' },
        { id: 'local-only', text: 'Local content' },
      ]);
      const remote = doc([{ id: 'a', text: 'A' }]);
      const result = mergeWikiDoc({ baseDocJson: base, localDocJson: local, remoteDocJson: remote });
      expect(result).toContain('Local content');
    });
  });
});
