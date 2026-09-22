import { describe, expect, it } from 'vitest';
import { BlockNoteEditor } from '@blocknote/core';
import { blocksToYDoc, yXmlFragmentToBlocks } from '@blocknote/core/yjs';
import * as Y from 'yjs';
import { createTaskLinkSchema } from '../richText/richTextEditorHelpers';
import { COMPAT_FIXTURE_BLOCKS } from '../richText/blockNoteCompatFixture';
import {
  COMPAT_GOLDEN_DOC,
  COMPAT_GOLDEN_YJS_UPDATE_BASE64,
} from '../richText/blockNoteCompatGolden';

// Must match DOC_FRAGMENT_KEY in wikiCollaboration.ts.
const DOC_FRAGMENT_KEY = 'document-store';

function createHeadlessEditor(initialContent?: unknown[]) {
  const schema = createTaskLinkSchema({
    entitiesRef: { current: [] },
    onEntityClickRef: { current: undefined },
    isMountedRef: { current: true },
  });
  return BlockNoteEditor.create({
    schema,
    ...(initialContent ? { initialContent: initialContent as never } : {}),
  } as never) as BlockNoteEditor<any, any, any>;
}

function decodeGoldenUpdate() {
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, Uint8Array.from(Buffer.from(COMPAT_GOLDEN_YJS_UPDATE_BASE64, 'base64')));
  return ydoc;
}

// REQ-313: wiki_collab_states.crdt_blob holds Yjs updates written by whatever BlockNote
// version was deployed at the time. A BlockNote upgrade that changes the Yjs encoding
// would silently destroy every existing collaborative wiki page, so the encoding is
// pinned here against a golden captured from the previously deployed version.
describe('wiki collaboration CRDT compatibility', () => {
  it('reads a stored crdt blob back into the golden document', () => {
    const ydoc = decodeGoldenUpdate();
    const editor = createHeadlessEditor();

    const blocks = yXmlFragmentToBlocks(editor, ydoc.getXmlFragment(DOC_FRAGMENT_KEY));

    expect(JSON.parse(JSON.stringify(blocks))).toEqual(COMPAT_GOLDEN_DOC);
  });

  it('seeds a legacy document into the fragment the editor reads from', () => {
    const editor = createHeadlessEditor(COMPAT_FIXTURE_BLOCKS);

    const ydoc = blocksToYDoc(editor, editor.document as never, DOC_FRAGMENT_KEY);
    const blocks = yXmlFragmentToBlocks(editor, ydoc.getXmlFragment(DOC_FRAGMENT_KEY));

    expect(JSON.parse(JSON.stringify(blocks))).toEqual(COMPAT_GOLDEN_DOC);
  });

  it('keeps code blocks and custom inline content intact through the CRDT', () => {
    const ydoc = decodeGoldenUpdate();
    const editor = createHeadlessEditor();

    const blocks = yXmlFragmentToBlocks(editor, ydoc.getXmlFragment(DOC_FRAGMENT_KEY));
    const codeBlock = blocks.find((b) => b.id === 'fx-code');
    const inlineBlock = blocks.find((b) => b.id === 'fx-inline-custom');

    expect(codeBlock?.content).toEqual([
      { type: 'text', text: 'const answer = 42;', styles: {} },
    ]);
    expect(inlineBlock?.content).toContainEqual({
      type: 'taskLink',
      props: { taskKey: 'REQ-313' },
    });
    expect(inlineBlock?.content).toContainEqual({
      type: 'status',
      props: { id: 'st-1', text: 'In Progress', color: 'blue' },
    });
  });

  it('applies a stored blob on top of a fresh doc without losing content', () => {
    // Mirrors wikiCollaboration.ts: the blob is applied to a brand new Y.Doc on mount.
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, Uint8Array.from(Buffer.from(COMPAT_GOLDEN_YJS_UPDATE_BASE64, 'base64')));
    const reEncoded = Y.encodeStateAsUpdate(ydoc);

    const roundTripped = new Y.Doc();
    Y.applyUpdate(roundTripped, reEncoded);
    const editor = createHeadlessEditor();

    const blocks = yXmlFragmentToBlocks(
      editor,
      roundTripped.getXmlFragment(DOC_FRAGMENT_KEY)
    );

    expect(JSON.parse(JSON.stringify(blocks))).toEqual(COMPAT_GOLDEN_DOC);
  });
});
