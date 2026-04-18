import { useCallback, useRef, type ReactNode } from 'react';
import { notePaneWidthBounds } from '../../workspace/notePaneStorage';

type WorkspaceNoteSplitProps = {
  left: ReactNode;
  right: ReactNode;
  widthPx: number;
  onWidthChangeEnd: (widthPx: number) => void;
};

/**
 * Horizontal split: fixed-width left pane + flexible right (REQ-288 notes pane).
 */
export function WorkspaceNoteSplit({ left, right, widthPx, onWidthChangeEnd }: WorkspaceNoteSplitProps) {
  const widthRef = useRef(widthPx);
  widthRef.current = widthPx;
  const rootRef = useRef<HTMLDivElement | null>(null);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = widthRef.current;
      const minW = notePaneWidthBounds.min;
      const maxW = notePaneWidthBounds.max;
      let lastWidth = startWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        lastWidth = Math.max(minW, Math.min(maxW, startWidth + delta));
        const root = rootRef.current;
        if (root) root.style.setProperty('--note-pane-width', `${lastWidth}px`);
      };
      const onUp = () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        onWidthChangeEnd(lastWidth);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [onWidthChangeEnd]
  );

  return (
    <div
      ref={rootRef}
      data-testid="workspace-note-split"
      className="h-full min-h-0 flex min-w-0 overflow-hidden"
      style={{ ['--note-pane-width' as string]: `${widthPx}px` }}
    >
      <div
        className="shrink-0 h-full min-h-0 min-w-0 overflow-hidden flex flex-col"
        style={{ width: 'var(--note-pane-width)' }}
      >
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize notes pane"
        title="Resize notes pane"
        data-testid="workspace-note-split-resize-handle"
        className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-zinc-700/50 transition-colors"
        onMouseDown={handleResizeStart}
      />
      <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">{right}</div>
    </div>
  );
}
