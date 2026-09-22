import { describe, expect, it } from 'vitest';
import { BlockNoteEditor } from '@blocknote/core';
import { getMathSlashMenuItems } from '@blocknote/math-block';
import { createTaskLinkSchema, parseDoc } from './richTextEditorHelpers';

const MATH_DOC = [
  {
    id: 'math-block',
    type: 'mathBlock',
    content: [{ type: 'text', text: '\\frac{1}{2}', styles: {} }],
  },
  {
    id: 'math-inline',
    type: 'paragraph',
    content: [
      { type: 'text', text: 'inline ', styles: {} },
      { type: 'math', content: [{ type: 'text', text: 'x^2', styles: {} }] },
    ],
  },
];

function createMathEditor(initialContent: unknown[]) {
  const schema = createTaskLinkSchema({
    entitiesRef: { current: [] },
    onEntityClickRef: { current: undefined },
    isMountedRef: { current: true },
  });
  return BlockNoteEditor.create({
    schema,
    initialContent: initialContent as never,
  } as never) as BlockNoteEditor<any, any, any>;
}

// REQ-313: Math is an opt-in package. These tests pin that it is actually wired into
// the schema and that its LaTeX source survives the persistence path, which is what
// the wiki stores and the backend indexes for search.
describe('math block', () => {
  it('is registered in the editor schema', () => {
    const editor = createMathEditor(MATH_DOC);

    expect(Object.keys(editor.schema.blockSpecs)).toContain('mathBlock');
    expect(Object.keys(editor.schema.inlineContentSpecs)).toContain('math');
  });

  it('offers slash menu items once the specs are in the schema', () => {
    const editor = createMathEditor(MATH_DOC);

    const items = getMathSlashMenuItems(editor);

    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => typeof item.title === 'string' && item.title.length > 0)).toBe(
      true
    );
  });

  it('keeps the latex source through a save and load cycle', () => {
    const editor = createMathEditor(MATH_DOC);
    const saved = JSON.stringify(editor.document);

    const reloaded = createMathEditor(parseDoc(saved) as unknown[]);
    const blocks = reloaded.document;

    const mathBlock = blocks.find((b) => b.id === 'math-block');
    expect(mathBlock?.type).toBe('mathBlock');
    expect(mathBlock?.content).toEqual([{ type: 'text', text: '\\frac{1}{2}', styles: {} }]);

    // Inline math uses "plain" content, which serializes as a bare string rather
    // than the styled-text array every other inline content type uses.
    const paragraph = blocks.find((b) => b.id === 'math-inline');
    expect(paragraph?.content).toContainEqual({ type: 'math', props: {}, content: 'x^2' });
  });

  it('exposes block math latex to text extraction but not inline math', () => {
    const editor = createMathEditor(MATH_DOC);

    // Mirrors backend/src/search/text_extract.rs, which collects every "text" key.
    const collected: string[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (key === 'text' && typeof child === 'string') collected.push(child);
        else walk(child);
      }
    };
    walk(JSON.parse(JSON.stringify(editor.document)));

    // Block math stores its source as styled text, so backend search indexes it.
    expect(collected).toContain('\\frac{1}{2}');
    // Inline math stores its source as a bare string under "content", so text
    // extraction misses it. Known gap, tracked separately from REQ-313.
    expect(collected).not.toContain('x^2');
  });
});
