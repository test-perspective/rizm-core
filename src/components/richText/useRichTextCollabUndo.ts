import { useEffect, useRef } from 'react';
import { getCollabUndoAvailability, getMaxCollabHistoryEntries } from './richTextEditorCollab';
import { parseDoc, resolveRelativeApiUrlsInBlockNoteBlocks } from './richTextEditorHelpers';

export function useRichTextCollabUndo(
  editor: { document: unknown; replaceBlocks: (a: unknown, b: unknown) => void } | null,
  containerRef: React.RefObject<HTMLDivElement | null>,
  editable: boolean,
  collaboration: { provider?: unknown; fragment?: unknown } | undefined
) {
  const collabSnapshotRef = useRef<string | null>(null);
  const collabUndoSnapshotsRef = useRef<string[]>([]);
  const collabRedoSnapshotsRef = useRef<string[]>([]);
  const applyingCollabHistoryRef = useRef(false);

  useEffect(() => {
    if (!editable || !collaboration || !editor) return undefined;

    const handleUndoKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isUndo = (event.ctrlKey || event.metaKey) && !event.shiftKey && key === 'z';
      const isRedo =
        (event.ctrlKey || event.metaKey) &&
        ((event.shiftKey && key === 'z') || (!event.shiftKey && key === 'y'));
      if (!isUndo && !isRedo) return;
      const activeElement = document.activeElement as HTMLElement | null;
      if (!containerRef.current?.contains(activeElement)) return;
      const builtInState = getCollabUndoAvailability(editor as Parameters<typeof getCollabUndoAvailability>[0]);
      const canUseBuiltIn = isUndo ? builtInState.canUndo : builtInState.canRedo;
      if (canUseBuiltIn) return;
      const currentDoc = JSON.stringify(editor.document);
      const nextSnapshot = isUndo
        ? collabUndoSnapshotsRef.current.pop()
        : collabRedoSnapshotsRef.current.pop();
      if (!nextSnapshot) return;
      if (isUndo) {
        collabRedoSnapshotsRef.current.push(currentDoc);
      } else {
        collabUndoSnapshotsRef.current.push(currentDoc);
      }
      applyingCollabHistoryRef.current = true;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      (event as unknown as { cancelBubble: boolean }).cancelBubble = true;
      try {
        editor.replaceBlocks(
          editor.document,
          resolveRelativeApiUrlsInBlockNoteBlocks(parseDoc(nextSnapshot)) ?? []
        );
        collabSnapshotRef.current = nextSnapshot;
      } finally {
        queueMicrotask(() => {
          applyingCollabHistoryRef.current = false;
        });
      }
    };

    window.addEventListener('keydown', handleUndoKeyDown, true);
    return () => window.removeEventListener('keydown', handleUndoKeyDown, true);
  }, [editable, editor, !!collaboration, containerRef]);

  useEffect(() => {
    if (!collaboration || !editor) return undefined;
    collabSnapshotRef.current = JSON.stringify(editor.document);
    collabUndoSnapshotsRef.current = [];
    collabRedoSnapshotsRef.current = [];
    applyingCollabHistoryRef.current = false;
    return undefined;
  }, [editor, collaboration?.fragment]);

  return {
    collabSnapshotRef,
    collabUndoSnapshotsRef,
    collabRedoSnapshotsRef,
    applyingCollabHistoryRef,
    maxEntries: getMaxCollabHistoryEntries(),
  };
}
