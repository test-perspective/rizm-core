import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { WorkspaceNoteSplit } from './WorkspaceNoteSplit';

describe('WorkspaceNoteSplit', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('calls onWidthChangeEnd after resize mouseup with clamped width', () => {
    const onEnd = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <WorkspaceNoteSplit
          widthPx={300}
          onWidthChangeEnd={onEnd}
          left={<div>left</div>}
          right={<div>right</div>}
        />
      );
    });

    const handle = container.querySelector('[data-testid="workspace-note-split-resize-handle"]') as HTMLElement;
    expect(handle).not.toBeNull();

    act(() => {
      handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100 }));
    });
    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 400 }));
    });
    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    expect(onEnd).toHaveBeenCalledTimes(1);
    const w = onEnd.mock.calls[0][0] as number;
    expect(w).toBeGreaterThanOrEqual(240);
    expect(w).toBeLessThanOrEqual(900);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
