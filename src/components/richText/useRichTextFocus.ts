import { useLayoutEffect, useRef } from 'react';

export function useRichTextFocus(
  editor: {
    document?: Array<{ id?: string; type?: string; children?: unknown[] }>;
    setTextCursorPosition?: (blockId: string, position: string) => void;
  } | null,
  containerRef: React.RefObject<HTMLDivElement | null>,
  editable: boolean,
  focusRequestToken: number | undefined,
  focusRequest: { blockId?: string } | undefined
) {
  const lastFocusTokenRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!editable || !editor) return;
    if (!focusRequestToken) return;
    if (lastFocusTokenRef.current === focusRequestToken) return;
    lastFocusTokenRef.current = focusRequestToken;
    const blockId = focusRequest?.blockId;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const focusTarget = containerRef.current?.querySelector(
          '[contenteditable="true"]'
        ) as HTMLElement | null;
        if (!focusTarget || !focusTarget.isConnected) return;
        try {
          focusTarget.focus();
        } catch {
          void 0;
        }
        if (blockId) {
          const findBlock = (
            doc: Array<{ id?: string; type?: string; children?: unknown[] }> | undefined,
            id: string
          ): { type?: string } | null => {
            if (!doc) return null;
            for (const b of doc) {
              if (b.id === id) return b;
              const found = findBlock(
                b.children as Array<{ id?: string; type?: string; children?: unknown[] }> | undefined,
                id
              );
              if (found) return found;
            }
            return null;
          };
          const block = findBlock(
            editor.document as Array<{ id?: string; type?: string; children?: unknown[] }> | undefined,
            blockId
          );
          const isLeafBlock = block?.type && ['image', 'video', 'file'].includes(block.type);
          if (!isLeafBlock) {
            try {
              editor.setTextCursorPosition?.(blockId, 'end');
            } catch {
              void 0;
            }
          }
        }
      });
    });
  }, [editable, focusRequestToken, focusRequest, editor, containerRef]);
}
