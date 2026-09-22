import { describe, expect, it } from 'vitest';
import { BlockNoteEditor } from '@blocknote/core';
import { withCollaboration } from '@blocknote/core/yjs';
import * as Y from 'yjs';
import { getCollabUndoAvailability } from './richTextEditorCollab';
import { createTaskLinkSchema } from './richTextEditorHelpers';

function createCollaborativeEditor() {
  const schema = createTaskLinkSchema({
    entitiesRef: { current: [] },
    onEntityClickRef: { current: undefined },
    isMountedRef: { current: true },
  });
  const ydoc = new Y.Doc();
  const editor = BlockNoteEditor.create(
    withCollaboration({
      schema,
      collaboration: {
        fragment: ydoc.getXmlFragment('document-store'),
        user: { name: 'Tester', color: '#7c3aed' },
      },
    }) as never
  ) as BlockNoteEditor<any, any, any>;

  // The Yjs sync plugin only runs once the view exists.
  editor.mount(document.createElement('div'));
  return { editor, ydoc };
}

// REQ-313: getCollabUndoAvailability decides whether to use BlockNote's own
// collaborative undo or fall back to the snapshot history. It reports "nothing to
// undo" on any failure, so a broken lookup degrades silently. These tests are the
// detector for that.
describe('collaborative undo availability', () => {
  it('reports nothing to undo without collaboration', () => {
    const editor = BlockNoteEditor.create() as BlockNoteEditor<any, any, any>;

    expect(getCollabUndoAvailability(editor)).toEqual({ canUndo: false, canRedo: false });
  });

  it('reports nothing to undo on a freshly created collaborative editor', () => {
    const { editor } = createCollaborativeEditor();

    expect(getCollabUndoAvailability(editor).canUndo).toBe(false);
  });

  it('reports an undoable edit after a local change', () => {
    const { editor } = createCollaborativeEditor();

    editor.insertBlocks(
      [{ type: 'paragraph', content: [{ type: 'text', text: 'hello', styles: {} }] }],
      editor.document[0],
      'after'
    );

    expect(getCollabUndoAvailability(editor).canUndo).toBe(true);
  });

  it('tolerates a null editor', () => {
    expect(getCollabUndoAvailability(null)).toEqual({ canUndo: false, canRedo: false });
  });
});
