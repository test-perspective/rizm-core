import { act, type ComponentProps } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { AssistantPanel } from './AssistantPanel';

vi.mock('../../utils/storage', () => ({
  isBackendEnabled: () => true,
}));

describe('AssistantPanel multiline input', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function renderPanel(overrides: Partial<ComponentProps<typeof AssistantPanel>> & { onSubmit?: () => void } = {}) {
    const onSubmit = overrides.onSubmit ?? vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const props = {
      input: 'hello',
      onInputChange: vi.fn(),
      onSubmit,
      isProcessing: false,
      history: [],
      onClearHistory: vi.fn(),
      presetsOnly: false,
      progressEvents: [],
      progressRunning: false,
      onCancelProgress: vi.fn(),
      ...overrides,
    };

    act(() => {
      root.render(<AssistantPanel {...props} />);
    });

    return { container, root, onSubmit };
  }

  it('renders a textarea instead of a single-line text input', () => {
    const { container, root } = renderPanel();
    expect(container.querySelector('textarea')).not.toBeNull();
    expect(container.querySelector('input[type="text"]')).toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it('calls onSubmit when Enter is pressed without Shift', () => {
    const { container, root, onSubmit } = renderPanel();
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;

    act(() => {
      ta.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, shiftKey: false })
      );
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    container.remove();
  });

  it('does not call onSubmit when Enter is pressed with Shift', () => {
    const { container, root, onSubmit } = renderPanel();
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;

    act(() => {
      ta.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, shiftKey: true })
      );
    });

    expect(onSubmit).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });

  it('copies the full conversation panel (history and progress) when copy control is activated', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    const { container, root } = renderPanel({
      history: [{ role: 'assistant', content: 'Final answer', createdAt: 1700000001000 }],
      progressEvents: [{ type: 'phase', message: 'Thinking…' }],
    });

    const copyBtn = container.querySelector('[aria-label="Copy conversation"]') as HTMLButtonElement;
    expect(copyBtn).not.toBeNull();

    await act(async () => {
      copyBtn.click();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith('Assistant\nFinal answer\n\nThinking…');

    act(() => root.unmount());
    container.remove();
  });
});
