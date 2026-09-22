import type { BlockNoteEditor } from '@blocknote/core';
import { YUndoExtension } from '@blocknote/core/yjs';

const MAX_COLLAB_HISTORY_ENTRIES = 100;

export type CollabUndoAvailability = {
  canUndo: boolean;
  canRedo: boolean;
};

/**
 * Reports whether BlockNote's own collaborative undo stack can handle the next
 * undo/redo, so the caller only falls back to its snapshot history when it cannot.
 *
 * Resolved through the exported YUndoExtension rather than by scanning ProseMirror
 * plugin keys for a "y-undo" prefix: the extension key and its plugin state are part
 * of BlockNote's public API, so a signature change fails to compile instead of
 * silently reporting "nothing to undo" forever.
 */
export function getCollabUndoAvailability(
  editor: BlockNoteEditor<any, any, any> | null | undefined
): CollabUndoAvailability {
  const unavailable = { canUndo: false, canRedo: false };
  if (!editor) return unavailable;

  try {
    const yUndo = editor.getExtension(YUndoExtension);
    const plugin = yUndo?.prosemirrorPlugins?.[0];
    if (!plugin) return unavailable;

    const state = plugin.getState(editor.prosemirrorState);
    if (!state) return unavailable;

    return {
      canUndo: state.hasUndoOps || (state.undoManager?.canUndo() ?? false),
      canRedo: state.hasRedoOps || (state.undoManager?.canRedo() ?? false),
    };
  } catch {
    // Collaboration is not enabled, or the editor is not mounted yet.
    return unavailable;
  }
}

export function getMaxCollabHistoryEntries() {
  return MAX_COLLAB_HISTORY_ENTRIES;
}
