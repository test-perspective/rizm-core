import { describe, expect, it } from 'vitest';
import { sanitizeBlockNoteBlocksForEditor } from './sanitizeBlockNoteForEditor';

describe('sanitizeBlockNoteBlocksForEditor', () => {
  it('flattens nested link with same href', () => {
    const url = 'https://example.com/a';
    const blocks = [
      {
        id: '1',
        type: 'paragraph',
        props: {},
        content: [
          { type: 'text', text: '(', styles: {} },
          {
            type: 'link',
            href: url,
            content: [
              {
                type: 'link',
                href: url,
                content: [{ type: 'text', text: url, styles: {} }],
              },
            ],
          },
          { type: 'text', text: ')', styles: {} },
        ],
        children: [],
      },
    ];
    const out = sanitizeBlockNoteBlocksForEditor(blocks)!;
    const content = (out[0] as { content: unknown[] }).content;
    const link = content.find((x) => (x as { type?: string }).type === 'link') as {
      content: unknown[];
    };
    expect(link.content.some((x) => (x as { type?: string }).type === 'link')).toBe(false);
  });

  it('repairs TPD-4 style misimport: paragraph then consecutive h1 (no h2 in source) become numberedListItem; lone # paragraph removed', () => {
    const blocks = [
      {
        id: 'intro',
        type: 'paragraph',
        props: { backgroundColor: 'default', textColor: 'default', textAlignment: 'left' },
        content: [{ type: 'text', text: '再現方法', styles: {} }],
        children: [],
      },
      {
        id: 'f1',
        type: 'heading',
        props: { level: 1, backgroundColor: 'default', textColor: 'default', textAlignment: 'left' },
        content: [{ type: 'text', text: 'テーブルを空にする', styles: {} }],
        children: [],
      },
      {
        id: 'f2',
        type: 'heading',
        props: { level: 1, backgroundColor: 'default', textColor: 'default', textAlignment: 'left' },
        content: [{ type: 'text', text: '２つ行を新規に追加する', styles: {} }],
        children: [],
      },
      {
        id: 'hash',
        type: 'paragraph',
        props: { backgroundColor: 'default', textColor: 'default', textAlignment: 'left' },
        content: [{ type: 'text', text: '#', styles: {} }],
        children: [],
      },
      {
        id: 'intro2',
        type: 'paragraph',
        props: { backgroundColor: 'default', textColor: 'default', textAlignment: 'left' },
        content: [{ type: 'text', text: '別の再現方法', styles: {} }],
        children: [],
      },
      {
        id: 'g1',
        type: 'heading',
        props: { level: 1, backgroundColor: 'default', textColor: 'default', textAlignment: 'left' },
        content: [{ type: 'text', text: 'リロードし、行を１つ追加', styles: {} }],
        children: [],
      },
    ];
    const out = sanitizeBlockNoteBlocksForEditor(blocks)!;
    expect((out[0] as { type: string }).type).toBe('paragraph');
    expect((out[1] as { type: string }).type).toBe('numberedListItem');
    expect((out[2] as { type: string }).type).toBe('numberedListItem');
    const loneHashParagraph = out.some((b) => {
      const o = b as { type?: string; content?: { type?: string; text?: string }[] };
      return (
        o.type === 'paragraph' &&
        Array.isArray(o.content) &&
        o.content.length === 1 &&
        o.content[0]?.type === 'text' &&
        o.content[0]?.text === '#'
      );
    });
    expect(loneHashParagraph).toBe(false);
    expect((out[out.length - 2] as { type: string }).type).toBe('paragraph');
    expect((out[out.length - 1] as { type: string }).type).toBe('numberedListItem');
  });

  it('repairs TPD-196 style misimport: h1 steps after h2 become numberedListItem; * sub-lines become top-level bullets', () => {
    const blocks = [
      {
        id: 'h2a',
        type: 'heading',
        props: { level: 2, backgroundColor: 'default', textColor: 'default', textAlignment: 'left' },
        content: [{ type: 'text', text: '再現手順', styles: {} }],
        children: [],
      },
      {
        id: 'fake1',
        type: 'heading',
        props: { level: 1, backgroundColor: 'default', textColor: 'default', textAlignment: 'left' },
        content: [{ type: 'text', text: 'ステップ1', styles: {} }],
        children: [],
      },
      {
        id: 'fake2',
        type: 'heading',
        props: { level: 1, backgroundColor: 'default', textColor: 'default', textAlignment: 'left' },
        content: [{ type: 'text', text: 'ステップ2', styles: {} }],
        children: [],
      },
      {
        id: 'subb',
        type: 'heading',
        props: { level: 1, backgroundColor: 'default', textColor: 'default', textAlignment: 'left' },
        content: [
          { type: 'text', text: '*', styles: {} },
          { type: 'text', text: ' サブA', styles: {} },
        ],
        children: [],
      },
      {
        id: 'fake3',
        type: 'heading',
        props: { level: 1, backgroundColor: 'default', textColor: 'default', textAlignment: 'left' },
        content: [{ type: 'text', text: 'ステップ3', styles: {} }],
        children: [],
      },
    ];
    const out = sanitizeBlockNoteBlocksForEditor(blocks)!;
    expect((out[1] as { type: string }).type).toBe('numberedListItem');
    expect((out[2] as { type: string }).type).toBe('numberedListItem');
    expect((out[3] as { type: string }).type).toBe('bulletListItem');
    expect(
      ((out[3] as { content: { text: string }[] }).content[0] as { text: string }).text,
    ).toBe('サブA');
    expect((out[4] as { type: string }).type).toBe('numberedListItem');
    expect((out[4] as { content: { text: string }[] }).content[0].text).toBe('ステップ3');
  });

  it('maps Jira strikethrough style to BlockNote strike and drops unknown style keys', () => {
    const blocks = [
      {
        id: 'p',
        type: 'paragraph',
        props: {},
        content: [
          {
            type: 'text',
            text: 'crossed',
            styles: { strikethrough: true, bogusStyle: true },
          },
        ],
        children: [],
      },
    ];
    const out = sanitizeBlockNoteBlocksForEditor(blocks)!;
    const styles = (out[0] as { content: { styles: Record<string, unknown> }[] }).content[0].styles;
    expect(styles.strike).toBe(true);
    expect(styles.strikethrough).toBeUndefined();
    expect(styles.bogusStyle).toBeUndefined();
  });

  it('adds empty inline to quote that only had children', () => {
    const blocks = [
      {
        id: 'q',
        type: 'quote',
        props: {},
        content: [],
        children: [
          {
            id: 'p',
            type: 'paragraph',
            props: {},
            content: [{ type: 'text', text: 'Hi', styles: {} }],
            children: [],
          },
        ],
      },
    ];
    const out = sanitizeBlockNoteBlocksForEditor(blocks)!;
    const q = out[0] as { content: unknown[] };
    expect(Array.isArray(q.content)).toBe(true);
    expect(q.content.length).toBeGreaterThan(0);
  });
});
