import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BoardViewMenu } from './BoardViewMenu';

describe('BoardViewMenu REQ-288 notes', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('calls onOpenPicker from title overflow menu', () => {
    const onOpen = vi.fn();
    const onHide = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <BoardViewMenu
          onConfigClick={vi.fn()}
          notes={{
            show: true,
            wikiPagesCount: 1,
            isNotePaneOpen: false,
            onOpenPicker: onOpen,
            onHide,
          }}
          menuButtonTestId="title-menu-test"
        />
      );
    });

    const trigger = container.querySelector('[data-testid="title-menu-test"]') as HTMLButtonElement;
    act(() => {
      trigger.click();
    });

    const openBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Open notes pane')
    );
    expect(openBtn).not.toBeUndefined();

    act(() => {
      openBtn?.click();
    });

    expect(onOpen).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
