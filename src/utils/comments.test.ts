import { describe, expect, it, vi } from 'vitest';
import type { TaskComment } from './comments';
import {
  DELETED_COMMENT_DOC,
  getLatestCommentDoc,
  isBlockNoteDocBlank,
  isBlockNoteDocContentEqual,
  isCommentDeleted,
  isValidBlockNoteDoc,
  makeComment,
  normalizeComments,
} from './comments';

describe('comments utils', () => {
  it('normalizeComments returns [] for non-array', () => {
    expect(normalizeComments(undefined)).toEqual([]);
    expect(normalizeComments(null)).toEqual([]);
    expect(normalizeComments('x')).toEqual([]);
    expect(normalizeComments({})).toEqual([]);
  });

  it('normalizeComments filters invalid entries and sorts newest first', () => {
    const raw = [
      { id: 'a', createdAt: 10, doc: '  [{"type":"paragraph","content":[{"type":"text","text":"old"}],"children":[]}]  ' },
      { id: 'b', createdAt: 20, doc: '[{"type":"paragraph","content":[{"type":"text","text":"new"}],"children":[]}]' },
      { id: 'bad1', createdAt: 30 }, // missing doc
      'not object',
    ];
    const out = normalizeComments(raw);
    expect(out.map((c) => c.id)).toEqual(['b', 'a']);
    expect(out[0].createdAt).toBe(20);
  });

  it('makeComment sets id/createdAt and author from user', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-0000-0000-000000000001');

    const c = makeComment('[{"type":"paragraph","content":[{"type":"text","text":"hi"}],"children":[]}]', {
      userId: 'u1',
      email: 'a@example.test',
      role: 'editor',
    });
    expect(c.id).toBe('00000000-0000-0000-0000-000000000001');
    expect(c.createdAt).toBe(1234);
    expect(c.author).toEqual({ id: 'u1', name: 'a@example.test' });
    expect(c.doc).toContain('"text":"hi"');
  });

  it('getLatestCommentDoc picks the max createdAt', () => {
    const list: TaskComment[] = [
      { id: 'a', createdAt: 10, doc: 'A' },
      { id: 'b', createdAt: 999, doc: 'B' },
      { id: 'c', createdAt: 20, doc: 'C' },
    ];
    expect(getLatestCommentDoc(list)).toBe('B');
    expect(getLatestCommentDoc([])).toBe('');
    expect(getLatestCommentDoc(undefined)).toBe('');
  });

  it('isBlockNoteDocBlank detects blank vs non-blank docs', () => {
    expect(isBlockNoteDocBlank('')).toBe(true);
    expect(isBlockNoteDocBlank('   ')).toBe(true);

    const blankDoc = JSON.stringify([
      { type: 'paragraph', content: [], children: [] },
    ]);
    expect(isBlockNoteDocBlank(blankDoc)).toBe(true);

    const nonBlankDoc = JSON.stringify([
      { type: 'paragraph', content: [{ type: 'text', text: 'hello', styles: {} }], children: [] },
    ]);
    expect(isBlockNoteDocBlank(nonBlankDoc)).toBe(false);
  });

  it('DELETED_COMMENT_DOC is not blank', () => {
    expect(isBlockNoteDocBlank(DELETED_COMMENT_DOC)).toBe(false);
    expect(DELETED_COMMENT_DOC).toContain('This comment was deleted.');
  });

  it('isBlockNoteDocBlank treats doc with only table as non-blank', () => {
    const tableOnlyDoc = JSON.stringify([
      {
        type: 'table',
        content: {
          type: 'tableContent',
          rows: [
            {
              cells: [
                [{ type: 'text', text: 'A1', styles: {} }],
                [{ type: 'text', text: 'B1', styles: {} }],
              ],
            },
            {
              cells: [
                [{ type: 'text', text: 'A2', styles: {} }],
                [{ type: 'text', text: 'B2', styles: {} }],
              ],
            },
          ],
        },
        children: [],
      },
    ]);
    expect(isBlockNoteDocBlank(tableOnlyDoc)).toBe(false);
  });

  it('isBlockNoteDocBlank treats empty table as blank', () => {
    const emptyTableDoc = JSON.stringify([
      {
        type: 'table',
        content: {
          type: 'tableContent',
          rows: [
            { cells: [[{ type: 'text', text: '', styles: {} }], [{ type: 'text', text: '', styles: {} }]] },
            { cells: [[{ type: 'text', text: ' ', styles: {} }], []] },
          ],
        },
        children: [],
      },
    ]);
    expect(isBlockNoteDocBlank(emptyTableDoc)).toBe(true);
  });

  it('isCommentDeleted returns true only when deletedAt is a finite number', () => {
    expect(isCommentDeleted({ id: 'x', createdAt: 0, doc: 'x', deletedAt: 100 })).toBe(true);
    expect(isCommentDeleted({ id: 'x', createdAt: 0, doc: 'x' })).toBe(false);
    expect(isCommentDeleted({ id: 'x', createdAt: 0, doc: 'x', deletedAt: undefined })).toBe(false);
  });

  describe('isBlockNoteDocContentEqual', () => {
    it('returns true when content is identical but block IDs differ', () => {
      const docA = JSON.stringify([
        { id: 'block-1', type: 'paragraph', content: [{ type: 'text', text: 'Hello', styles: {} }], children: [] },
      ]);
      const docB = JSON.stringify([
        { id: 'block-2', type: 'paragraph', content: [{ type: 'text', text: 'Hello', styles: {} }], children: [] },
      ]);
      expect(isBlockNoteDocContentEqual(docA, docB)).toBe(true);
    });

    it('returns true when property order differs', () => {
      const docA = JSON.stringify([
        { type: 'paragraph', content: [{ type: 'text', text: 'Hi', styles: {} }], children: [], id: 'x' },
      ]);
      const docB = JSON.stringify([
        { id: 'y', children: [], content: [{ type: 'text', text: 'Hi', styles: {} }], type: 'paragraph' },
      ]);
      expect(isBlockNoteDocContentEqual(docA, docB)).toBe(true);
    });

    it('returns false when text differs by one character', () => {
      const docA = JSON.stringify([
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello', styles: {} }], children: [] },
      ]);
      const docB = JSON.stringify([
        { type: 'paragraph', content: [{ type: 'text', text: 'Helloo', styles: {} }], children: [] },
      ]);
      expect(isBlockNoteDocContentEqual(docA, docB)).toBe(false);
    });

    it('returns true for empty documents', () => {
      expect(isBlockNoteDocContentEqual('', '')).toBe(true);
      expect(isBlockNoteDocContentEqual('   ', '  ')).toBe(true);
      expect(isBlockNoteDocContentEqual('[]', '[]')).toBe(true);
    });

    it('returns false when one is invalid JSON', () => {
      const valid = '[{"type":"paragraph","content":[],"children":[]}]';
      expect(isBlockNoteDocContentEqual(valid, 'not json')).toBe(false);
      expect(isBlockNoteDocContentEqual('not json', valid)).toBe(false);
    });

    it('returns true when BlockNote adds default props (backgroundColor, textColor, textAlignment)', () => {
      const stored = JSON.stringify([
        { id: 'b1', type: 'paragraph', content: [{ type: 'text', text: 'Hi', styles: {} }], children: [] },
      ]);
      const reserialized = JSON.stringify([
        {
          id: 'b2',
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hi', styles: {} }],
          children: [],
          backgroundColor: 'default',
          textColor: 'default',
          textAlignment: 'left',
        },
      ]);
      expect(isBlockNoteDocContentEqual(stored, reserialized)).toBe(true);
    });

    it('returns true for same content with nested children', () => {
      const base = [
        {
          id: 'parent-1',
          type: 'bulletListItem',
          content: [{ type: 'text', text: 'Item', styles: {} }],
          children: [
            {
              id: 'child-1',
              type: 'paragraph',
              content: [{ type: 'text', text: 'Nested', styles: {} }],
              children: [],
            },
          ],
        },
      ];
      const withOtherIds = [
        {
          id: 'parent-2',
          type: 'bulletListItem',
          content: [{ type: 'text', text: 'Item', styles: {} }],
          children: [
            {
              id: 'child-2',
              type: 'paragraph',
              content: [{ type: 'text', text: 'Nested', styles: {} }],
              children: [],
            },
          ],
        },
      ];
      expect(isBlockNoteDocContentEqual(JSON.stringify(base), JSON.stringify(withOtherIds))).toBe(true);
    });
  });

  describe('isValidBlockNoteDoc', () => {
    it('returns true for valid BlockNote JSON string', () => {
      const valid = '[{"type":"paragraph","content":[{"type":"text","text":"hi"}],"children":[]}]';
      expect(isValidBlockNoteDoc(valid)).toBe(true);
      expect(isValidBlockNoteDoc('[]')).toBe(true);
      expect(isValidBlockNoteDoc('  ')).toBe(true);
      expect(isValidBlockNoteDoc('')).toBe(true);
    });

    it('returns false for non-string or null/undefined', () => {
      expect(isValidBlockNoteDoc(null)).toBe(false);
      expect(isValidBlockNoteDoc(undefined)).toBe(false);
      expect(isValidBlockNoteDoc(123)).toBe(false);
      expect(isValidBlockNoteDoc([])).toBe(false);
    });

    it('returns false for invalid JSON', () => {
      expect(isValidBlockNoteDoc('not json')).toBe(false);
      expect(isValidBlockNoteDoc('{ "type": "paragraph" }')).toBe(false);
    });

    it('returns false for Jira ADF-like structure (object, not array of blocks)', () => {
      const adfLike = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
      expect(isValidBlockNoteDoc(adfLike)).toBe(false);
    });

    it('returns false for array with blocks missing type', () => {
      expect(isValidBlockNoteDoc('[{"content":[]}]')).toBe(false);
      expect(isValidBlockNoteDoc('[{}]')).toBe(false);
    });
  });

  it('normalizeComments preserves extended fields (updatedAt, deletedAt, etc.)', () => {
    const raw = [
      {
        id: 'c1',
        createdAt: 10,
        doc: '[{"type":"paragraph","content":[{"type":"text","text":"hi"}],"children":[]}]',
        updatedAt: 20,
        updatedBy: { id: 'u1', name: 'editor@test' },
        deletedAt: 30,
        deletedBy: { id: 'u2', name: 'admin@test' },
      },
    ];
    const out = normalizeComments(raw);
    expect(out).toHaveLength(1);
    expect(out[0].updatedAt).toBe(20);
    expect(out[0].updatedBy).toEqual({ id: 'u1', name: 'editor@test' });
    expect(out[0].deletedAt).toBe(30);
    expect(out[0].deletedBy).toEqual({ id: 'u2', name: 'admin@test' });
  });
});

