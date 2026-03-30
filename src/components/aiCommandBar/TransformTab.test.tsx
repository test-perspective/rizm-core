import { act, createRef, type ComponentProps } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { TransformTab } from './TransformTab';

vi.mock('../../utils/storage', () => ({
  isBackendEnabled: () => true,
}));

describe('TransformTab multiline input', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function renderTab(overrides: Partial<ComponentProps<typeof TransformTab>> & { onSendMessage?: () => void } = {}) {
    const onSendMessage = overrides.onSendMessage ?? vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const inputRef = createRef<HTMLTextAreaElement>();

    const props = {
      inputRef,
      input: 'hello',
      onInputChange: vi.fn(),
      onSendMessage,
      onGenerateManifest: vi.fn(),
      isProcessing: false,
      presetsOnly: false,
      quickTransformKeys: [],
      onQuickTransform: vi.fn(),
      history: [],
      onClearHistory: vi.fn(),
      onReusePrompt: vi.fn(),
      progressEvents: [],
      progressRunning: false,
      onCancelProgress: vi.fn(),
      ...overrides,
    };

    act(() => {
      root.render(<TransformTab {...props} />);
    });

    return { container, root, onSendMessage, inputRef };
  }

  it('renders a textarea instead of a single-line text input', () => {
    const { container, root } = renderTab();
    expect(container.querySelector('textarea')).not.toBeNull();
    expect(container.querySelector('input[type="text"]')).toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it('calls onSendMessage when Enter is pressed without Shift', () => {
    const { container, root, onSendMessage } = renderTab();
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;

    act(() => {
      ta.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, shiftKey: false })
      );
    });

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    container.remove();
  });

  it('does not call onSendMessage when Enter is pressed with Shift', () => {
    const { container, root, onSendMessage } = renderTab();
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;

    act(() => {
      ta.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, shiftKey: true })
      );
    });

    expect(onSendMessage).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });

  it('calls onReusePrompt when Reuse is activated on a user message', () => {
    const onReusePrompt = vi.fn();
    const { container, root } = renderTab({
      onReusePrompt,
      history: [{ role: 'user', content: 'Reuse me', createdAt: 1700000002000 }],
    });

    const reuseBtn = container.querySelector('[aria-label="Reuse prompt"]') as HTMLButtonElement;
    expect(reuseBtn).not.toBeNull();

    act(() => {
      reuseBtn.click();
    });

    expect(onReusePrompt).toHaveBeenCalledWith('Reuse me');

    act(() => root.unmount());
    container.remove();
  });

  it('does not wrap assistant message body in a button', () => {
    const { container, root } = renderTab({
      history: [{ role: 'assistant', content: 'Assistant body', createdAt: 1700000003000 }],
    });

    const body = Array.from(container.querySelectorAll('p')).find((p) => p.textContent === 'Assistant body');
    expect(body).toBeDefined();
    expect(body!.closest('button')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('disables Generate when assistant is not ready and no bitbucket.org URL', () => {
    const { container, root } = renderTab({
      input: 'hi',
      history: [
        { role: 'user', content: 'hello', createdAt: 1 },
        { role: 'assistant', content: 'I can help with Bitbucket concepts.', createdAt: 2 },
      ],
    });
    const genBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Generate Manifest')
    );
    expect(genBtn).toBeDefined();
    expect(genBtn!.disabled).toBe(true);
    act(() => root.unmount());
    container.remove();
  });

  it('enables Generate when user message includes bitbucket.org even if assistant never says ready', () => {
    const { container, root } = renderTab({
      input: '',
      history: [
        { role: 'user', content: 'Link https://bitbucket.org/my-ws/my-repo', createdAt: 1 },
        { role: 'assistant', content: 'Generic advice without readiness wording.', createdAt: 2 },
      ],
    });
    const genBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Generate Manifest')
    );
    expect(genBtn).toBeDefined();
    expect(genBtn!.disabled).toBe(false);
    act(() => root.unmount());
    container.remove();
  });

  it('enables Generate when draft input contains bitbucket.org URL', () => {
    const { container, root } = renderTab({
      input: 'Use https://bitbucket.org/ws2/r2',
      history: [{ role: 'assistant', content: 'Still thinking.', createdAt: 1 }],
    });
    const genBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Generate Manifest')
    );
    expect(genBtn).toBeDefined();
    expect(genBtn!.disabled).toBe(false);
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

    const { container, root } = renderTab({
      history: [{ role: 'assistant', content: 'Manifest plan', createdAt: 1700000004000 }],
      progressEvents: [{ type: 'user', message: 'Streaming prompt' }],
    });

    const copyBtn = container.querySelector('[aria-label="Copy conversation"]') as HTMLButtonElement;
    expect(copyBtn).not.toBeNull();

    await act(async () => {
      copyBtn.click();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith('Assistant\nManifest plan\n\nStreaming prompt');

    act(() => root.unmount());
    container.remove();
  });
});
