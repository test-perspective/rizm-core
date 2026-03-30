import { useCallback } from 'react';
import {
  TEMP_PASTE_GUARD_CHAR,
  LIST_ITEM_TYPES,
  isInlineContentEmpty,
  stripFirstTemporaryPasteGuard,
  findBlockById,
} from './richTextEditorPasteHelpers';
import { replaceTransientImageUrlsInHtml } from './richTextEditorHelpers';

export function useRichTextPasteAndUpload(
  uploadFile: (file: File) => Promise<string>,
  attachmentProjectId: string | undefined,
  attachmentEntityPk: string | undefined
) {
  const pasteHandler = useCallback(
    ({
      event,
      editor: ed,
      defaultPasteHandler,
    }: {
      event: ClipboardEvent;
      editor: {
        getTextCursorPosition?: () => { block?: { id?: string; type?: string; content?: unknown } };
        getBlock?: (id: string) => unknown;
        document?: Array<{ id?: string; children?: unknown[] }>;
        insertInlineContent: (content: string) => void;
        updateBlock: (id: string, props: { content: unknown }) => void;
        pasteHTML: (html: string) => void;
      };
      defaultPasteHandler: () => boolean;
    }) => {
      const currentBlock = ed.getTextCursorPosition?.().block;
      const requiresPasteGuard =
        !!currentBlock &&
        !!currentBlock.type &&
        LIST_ITEM_TYPES.has(currentBlock.type) &&
        isInlineContentEmpty(currentBlock.content);
      const guardedBlockId = requiresPasteGuard ? currentBlock.id : null;

      if (requiresPasteGuard) {
        ed.insertInlineContent(TEMP_PASTE_GUARD_CHAR);
      }

      const cleanupPasteGuard = () => {
        const blockId = guardedBlockId;
        if (typeof blockId !== 'string') return;
        setTimeout(() => {
          try {
            const block =
              ed.getBlock?.(blockId) ??
              findBlockById(
                ed.document as Array<{ id?: string; children?: unknown[] }> | undefined,
                blockId
              );
            if (!block || !Array.isArray((block as { content?: unknown }).content)) return;
            const origContent = (block as { content?: unknown }).content;
            const cleanedContent = stripFirstTemporaryPasteGuard(origContent);
            if (cleanedContent !== origContent) {
              const cleanedArr = Array.isArray(cleanedContent) ? cleanedContent : [];
              const origArr = Array.isArray(origContent) ? origContent : [];
              if (cleanedArr.length === 0 && origArr.length > 0) return;
              ed.updateBlock(blockId, { content: cleanedContent });
            }
          } catch {
            // Ignore cleanup failures
          }
        }, 0);
      };

      const html = event.clipboardData?.getData?.('text/html');
      if (
        attachmentProjectId &&
        attachmentEntityPk &&
        html &&
        (html.includes('data:image/') || html.includes('blob:'))
      ) {
        event.preventDefault();
        replaceTransientImageUrlsInHtml(html, uploadFile)
          .then((modifiedHtml) => {
            ed.pasteHTML(modifiedHtml);
          })
          .finally(() => {
            cleanupPasteGuard();
          });
        return true;
      }

      const handled = defaultPasteHandler();
      cleanupPasteGuard();
      return handled;
    },
    [attachmentProjectId, attachmentEntityPk, uploadFile]
  );

  return { pasteHandler };
}
