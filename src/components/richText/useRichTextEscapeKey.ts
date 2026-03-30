import { useEffect } from 'react';
import {
  findTrailingTaskKey,
  replaceTaskLinkWithText,
} from '../richTextTaskLinking';
import {
  findTrailingSymbol,
  revertTrailingSymbol,
} from '../richTextSymbolSubstitutions';

export function useRichTextEscapeKey(
  editor: {
    getTextCursorPosition?: () => { block?: { id?: string; content?: unknown } };
    getSelection?: () => { blocks?: Array<{ id?: string; content?: unknown }> };
    document?: Array<{ id?: string; type?: string; content?: unknown }>;
    updateBlock: (id: string, props: { content: unknown }) => void;
    removeBlocks: (ids: string[]) => void;
  } | null,
  containerRef: React.RefObject<HTMLDivElement | null>,
  editable: boolean,
  processingRef: React.MutableRefObject<boolean>,
  suppressedKeysRef: React.MutableRefObject<Map<string, Set<string>>>
) {
  useEffect(() => {
    if (!editable || !editor) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key !== 'Esc') return;
      if (!containerRef.current) return;
      if (!containerRef.current.contains(document.activeElement)) return;

      const cursor = editor.getTextCursorPosition?.();
      const selection = editor.getSelection?.();
      const block = cursor?.block ?? selection?.blocks?.[0];
      if (!block || !Array.isArray(block.content)) return;

      const trailingSymbol = findTrailingSymbol(block.content as Parameters<typeof findTrailingSymbol>[0]);
      if (trailingSymbol) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        (event as unknown as { cancelBubble: boolean }).cancelBubble = true;
        const reverted = revertTrailingSymbol(
          block.content as Parameters<typeof revertTrailingSymbol>[0],
          trailingSymbol
        );
        if (reverted.changed) {
          processingRef.current = true;
          editor.updateBlock(block.id!, { content: reverted.content as never });
          queueMicrotask(() => {
            processingRef.current = false;
            const doc = editor.document as Array<{ id?: string; type?: string; content?: unknown }>;
            const tail = doc?.[doc.length - 1];
            const tailText =
              Array.isArray(tail?.content)
                ? tail.content
                    .map((item: { type?: string; text?: string; props?: { taskKey?: string } }) => {
                      if (item?.type === 'text' && typeof item.text === 'string') return item.text;
                      if (item?.type === 'taskLink' && item?.props?.taskKey) {
                        return String(item.props.taskKey);
                      }
                      return '';
                    })
                    .join('')
                : '';
            const tailIsEmpty =
              tail?.type === 'paragraph' && (!tailText || tailText.trim().length === 0);
            if (tailIsEmpty && tail?.id && tail.id !== block.id && doc.length > 1) {
              try {
                editor.removeBlocks([tail.id]);
              } catch {
                void 0;
              }
            }
          });
        }
        return;
      }

      const trailingKey = findTrailingTaskKey(block.content as Parameters<typeof findTrailingTaskKey>[0]);
      if (!trailingKey) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      (event as unknown as { cancelBubble: boolean }).cancelBubble = true;

      const suppressedKeys = suppressedKeysRef.current.get(block.id!) ?? new Set<string>();
      suppressedKeys.add(trailingKey);
      suppressedKeysRef.current.set(block.id!, suppressedKeys);

      const reverted = replaceTaskLinkWithText(
        block.content as Parameters<typeof replaceTaskLinkWithText>[0],
        trailingKey
      );
      if (reverted.changed) {
        processingRef.current = true;
        editor.updateBlock(block.id!, { content: reverted.content as never });
        queueMicrotask(() => {
          processingRef.current = false;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [editor, editable, containerRef, processingRef, suppressedKeysRef]);
}
