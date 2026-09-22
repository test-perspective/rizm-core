import { describe, expect, it } from 'vitest';
import { BlockNoteEditor } from '@blocknote/core';
import { createTaskLinkSchema, parseDoc } from './richTextEditorHelpers';
import { COMPAT_FIXTURE_BLOCKS } from './blockNoteCompatFixture';
import { COMPAT_GOLDEN_DOC } from './blockNoteCompatGolden';

function createCompatEditor(initialContent: unknown[]) {
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

// REQ-313: These assertions pin the persisted document format. They must keep passing
// across BlockNote upgrades, because the whole app stores JSON.stringify(editor.document)
// and the backend hand-writes the same JSON in Rust with no compile-time checking.
describe('BlockNote document round trip', () => {
  it('normalizes the fixture into the frozen golden document', () => {
    const editor = createCompatEditor(COMPAT_FIXTURE_BLOCKS);

    expect(JSON.parse(JSON.stringify(editor.document))).toEqual(COMPAT_GOLDEN_DOC);
  });

  it('survives a save/load cycle through the persisted JSON string', () => {
    const editor = createCompatEditor(COMPAT_FIXTURE_BLOCKS);
    const savedDoc = JSON.stringify(editor.document);

    // parseDoc is the production load path: JSON.parse + sanitizeBlockNoteBlocksForEditor.
    const reloaded = createCompatEditor(parseDoc(savedDoc) as unknown[]);

    expect(JSON.parse(JSON.stringify(reloaded.document))).toEqual(COMPAT_GOLDEN_DOC);
  });

  it('keeps code block content as styled text', () => {
    const editor = createCompatEditor(COMPAT_FIXTURE_BLOCKS);
    const codeBlock = editor.document.find((block) => block.id === 'fx-code');

    expect(codeBlock?.type).toBe('codeBlock');
    expect(codeBlock?.props).toEqual({ language: 'typescript' });
    expect(codeBlock?.content).toEqual([
      { type: 'text', text: 'const answer = 42;', styles: {} },
    ]);
  });

  it('keeps the custom taskLink and status inline content', () => {
    const editor = createCompatEditor(COMPAT_FIXTURE_BLOCKS);
    const block = editor.document.find((b) => b.id === 'fx-inline-custom');

    expect(block?.content).toEqual([
      { type: 'text', text: 'see ', styles: {} },
      { type: 'taskLink', props: { taskKey: 'REQ-313' } },
      { type: 'text', text: ' with ', styles: {} },
      { type: 'status', props: { id: 'st-1', text: 'In Progress', color: 'blue' } },
    ]);
  });

  it('keeps table content addressable by rows and cells', () => {
    const editor = createCompatEditor(COMPAT_FIXTURE_BLOCKS);
    const table = editor.document.find((b) => b.id === 'fx-table');
    const content = table?.content as {
      type: string;
      rows: { cells: { content: { text: string }[] }[] }[];
    };

    expect(content.type).toBe('tableContent');
    expect(content.rows).toHaveLength(2);
    expect(content.rows[0].cells[0].content[0].text).toBe('r1c1');
    expect(content.rows[1].cells[1].content[0].text).toBe('r2c2');
  });

  it('keeps the relative attachment url on image blocks', () => {
    const editor = createCompatEditor(COMPAT_FIXTURE_BLOCKS);
    const image = editor.document.find((b) => b.id === 'fx-image');

    expect((image?.props as { url: string }).url).toBe(
      '/api/projects/p1/entities/e1/attachments/a1'
    );
  });
});
