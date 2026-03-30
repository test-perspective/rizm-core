import { act, type ComponentProps } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { AiProgressDialog } from './AiProgressDialog';

describe('AiProgressDialog copy', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function renderDialog(overrides: Partial<ComponentProps<typeof AiProgressDialog>> = {}) {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const props: ComponentProps<typeof AiProgressDialog> = {
      isOpen: true,
      title: 'Test',
      events: [
        { type: 'user', message: 'hello' },
        { type: 'llmOutput', text: 'model output' },
      ],
      isRunning: false,
      onCancel: vi.fn(),
      onClose: vi.fn(),
      ...overrides,
    };

    act(() => {
      root.render(<AiProgressDialog {...props} />);
    });

    return { container, root, writeText };
  }

  it('copies all streamed events as plain text when copy control is activated', async () => {
    const { container, root, writeText } = renderDialog();

    const copyBtn = container.querySelector('[aria-label="Copy conversation"]') as HTMLButtonElement;
    expect(copyBtn).not.toBeNull();

    await act(async () => {
      copyBtn.click();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith('hello\n\nmodel output');

    act(() => root.unmount());
    container.remove();
  });
});
