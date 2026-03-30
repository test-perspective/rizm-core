const MAX_COLLAB_HISTORY_ENTRIES = 100;

export function getCollabUndoAvailability(editor: {
  prosemirrorView?: { state?: { plugins?: unknown[] } };
}) {
  const state = editor?.prosemirrorView?.state;
  const plugins = Array.isArray(state?.plugins) ? state.plugins : [];
  const yUndoPlugin = plugins.find(
    (plugin: unknown) => {
      const key = (plugin as { key?: string })?.key;
      return typeof key === 'string' && key.startsWith('y-undo');
    }
  ) as
    | {
        key?: string;
        getState?: (state: unknown) => {
          hasUndoOps?: boolean;
          hasRedoOps?: boolean;
          undoManager?: {
            canUndo?: () => boolean;
            canRedo?: () => boolean;
            undoStack?: unknown[];
            redoStack?: unknown[];
            trackedOrigins?: Set<unknown>;
          };
        };
      }
    | undefined;
  const yUndoState = yUndoPlugin?.getState?.(state) ?? null;
  return {
    canUndo: yUndoState?.undoManager?.canUndo?.() ?? yUndoState?.hasUndoOps ?? false,
    canRedo: yUndoState?.undoManager?.canRedo?.() ?? yUndoState?.hasRedoOps ?? false,
  };
}

export function getMaxCollabHistoryEntries() {
  return MAX_COLLAB_HISTORY_ENTRIES;
}
