import { useState, useCallback, useMemo } from 'react';
import { generateStatusInlineContent } from './StatusInline';

export function useRichTextStatusEdit(
  editor: {
    document: Array<{ id?: string; content?: unknown; children?: unknown[] }>;
    updateBlock: (id: string, props: { content: unknown }) => void;
    insertInlineContent: (content: unknown) => void;
  } | null,
  editable: boolean
) {
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusEditStatusId, setStatusEditStatusId] = useState<string | null>(null);
  const [statusEditInitialValues, setStatusEditInitialValues] = useState<{
    text: string;
    color: string;
  } | null>(null);

  const openStatusEditDialog = useCallback(
    (statusId: string, text: string, color: string) => {
      if (!editable) return;
      setStatusEditStatusId(statusId);
      setStatusEditInitialValues({ text, color });
      setStatusDialogOpen(true);
    },
    [editable]
  );

  const statusEditContextValue = useMemo(
    () => (editable ? { openStatusEditDialog } : null),
    [editable, openStatusEditDialog]
  );

  const handleStatusConfirm = useCallback(
    (text: string, color: string) => {
      if (!editor) return;
      if (statusEditStatusId) {
        const doc = editor.document;
        const findAndUpdateStatus = (
          blocks: Array<{ id?: string; content?: unknown; children?: unknown[] }>
        ): boolean => {
          for (const block of blocks) {
            const content = block.content;
            if (Array.isArray(content)) {
              const idx = content.findIndex(
                (item: { type?: string; props?: { id?: string; text?: string; color?: string } }) =>
                  item?.type === 'status' &&
                  (item?.props?.id === statusEditStatusId ||
                    `${item?.props?.text}-${item?.props?.color}` === statusEditStatusId)
              );
              if (idx >= 0) {
                const next = [...content];
                const existing = next[idx] as { type: string; props: Record<string, unknown> };
                next[idx] = {
                  ...existing,
                  props: { ...existing.props, text, color, id: existing.props?.id ?? statusEditStatusId },
                };
                editor.updateBlock(block.id!, { content: next });
                return true;
              }
            }
            const children = block.children as Array<{ id?: string; content?: unknown; children?: unknown[] }>;
            if (Array.isArray(children) && findAndUpdateStatus(children)) return true;
          }
          return false;
        };
        findAndUpdateStatus(doc);
      } else {
        const statusContent = generateStatusInlineContent(text, color);
        editor.insertInlineContent([statusContent] as never);
      }
      setStatusDialogOpen(false);
      setStatusEditStatusId(null);
      setStatusEditInitialValues(null);
    },
    [editor, statusEditStatusId]
  );

  const closeStatusDialog = useCallback(() => {
    setStatusDialogOpen(false);
    setStatusEditStatusId(null);
    setStatusEditInitialValues(null);
  }, []);

  return {
    statusDialogOpen,
    statusEditInitialValues,
    statusEditContextValue,
    handleStatusConfirm,
    closeStatusDialog,
    setStatusDialogOpen,
  };
}
