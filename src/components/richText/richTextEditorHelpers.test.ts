import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDoc, resolveRelativeApiUrlsInBlockNoteBlocks } from './richTextEditorHelpers';

vi.mock('../../utils/storage', () => ({
  isBackendEnabled: vi.fn(() => true),
  getBackendUrl: vi.fn(() => 'http://localhost:48888'),
}));

import { getBackendUrl, isBackendEnabled } from '../../utils/storage';

type TestImageBlock = {
  type: 'image';
  props: { url: string; caption?: string };
  children: unknown[];
  id?: string;
};

describe('richTextEditorHelpers', () => {
  beforeEach(() => {
    vi.mocked(isBackendEnabled).mockReturnValue(true);
    vi.mocked(getBackendUrl).mockReturnValue('http://localhost:48888');
  });

  describe('resolveRelativeApiUrlsInBlockNoteBlocks', () => {
    it('prefixes /api image urls with backend base', () => {
      const blocks = [
        {
          id: '1',
          type: 'image',
          props: {
            url: '/api/projects/p/entities/e/attachments/x',
            caption: '',
          },
          children: [],
        },
      ] as any;
      const out = resolveRelativeApiUrlsInBlockNoteBlocks(blocks) as TestImageBlock[] | undefined;
      expect(out?.[0]?.props.url).toBe(
        'http://localhost:48888/api/projects/p/entities/e/attachments/x'
      );
    });

    it('does not change already absolute URLs', () => {
      const u = 'http://localhost:48888/api/projects/p/entities/e/attachments/x';
      const blocks = [{ type: 'image', props: { url: u }, children: [] }] as any;
      const out = resolveRelativeApiUrlsInBlockNoteBlocks(blocks) as TestImageBlock[] | undefined;
      expect(out?.[0]?.props.url).toBe(u);
    });

    it('no-ops when backend is disabled', () => {
      vi.mocked(isBackendEnabled).mockReturnValue(false);
      const blocks = [{ type: 'image', props: { url: '/api/x' }, children: [] }] as any;
      const out = resolveRelativeApiUrlsInBlockNoteBlocks(blocks) as TestImageBlock[] | undefined;
      expect(out?.[0]?.props.url).toBe('/api/x');
    });
  });

  describe('parseDoc', () => {
    it('returns undefined for null or undefined', () => {
      expect(parseDoc(null)).toBeUndefined();
      expect(parseDoc(undefined)).toBeUndefined();
    });

    it('returns undefined for non-array non-string', () => {
      expect(parseDoc(123)).toBeUndefined();
      expect(parseDoc({})).toBeUndefined();
    });

    it('parses JSON string to blocks', () => {
      const blocks = [{ id: 'a', type: 'paragraph', content: [] }];
      expect(parseDoc(JSON.stringify(blocks))).toEqual(blocks);
    });

    it('returns array as-is when given array', () => {
      const blocks = [{ id: 'p1', type: 'paragraph', content: [] }];
      expect(parseDoc(blocks)).toEqual(blocks);
    });
  });
});
