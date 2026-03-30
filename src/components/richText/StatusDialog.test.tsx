import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { StatusDialog } from './StatusDialog';

describe('StatusDialog', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders nothing when closed', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StatusDialog open={false} onClose={vi.fn()} onConfirm={vi.fn()} />);
    });

    expect(document.body.querySelector('.fixed.inset-0')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('renders dialog when open', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StatusDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} />);
    });

    expect(document.body.textContent).toContain('Insert Status');
    expect(document.body.querySelector('input[placeholder="Status"]')).not.toBeNull();
    expect(document.body.querySelector('button')).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('calls onConfirm with text and color when Insert clicked', () => {
    const onConfirm = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StatusDialog open={true} onClose={vi.fn()} onConfirm={onConfirm} />);
    });

    const input = document.body.querySelector('input[placeholder="Status"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    act(() => {
      const setNativeValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setNativeValue?.call(input, 'Done');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const greenButton = document.body.querySelector('button[title="Green"]');
    expect(greenButton).toBeTruthy();
    act(() => {
      greenButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const insertButton = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Insert')
    );
    expect(insertButton).toBeTruthy();
    act(() => {
      insertButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onConfirm).toHaveBeenCalledWith('Done', 'green');

    act(() => root.unmount());
    container.remove();
  });

  it('renders Edit Status and Update button when initialValues provided', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StatusDialog
          open={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          initialValues={{ text: 'Done', color: 'green' }}
        />
      );
    });

    expect(document.body.textContent).toContain('Edit Status');
    expect(document.body.textContent).toContain('Update');
    const input = document.body.querySelector('input[placeholder="Status"]') as HTMLInputElement;
    expect(input?.value).toBe('Done');

    act(() => root.unmount());
    container.remove();
  });

  it('calls onClose when Cancel clicked', () => {
    const onClose = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StatusDialog open={true} onClose={onClose} onConfirm={vi.fn()} />);
    });

    const cancelButton = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cancel')
    );
    expect(cancelButton).toBeTruthy();
    act(() => {
      cancelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });
});
