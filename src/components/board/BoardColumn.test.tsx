import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Entity, PropertyDefinition, ViewConfig } from '../../types';
import { BoardColumn } from './BoardColumn';

vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));

vi.mock('../dialogs', () => ({
  useAppDialog: () => ({ prompt: vi.fn() }),
}));

const view: ViewConfig = {
  id: 'board',
  name: 'Board',
  type: 'board',
  entityId: 'task',
  groupBy: 'status',
  visibleProperties: ['title'],
};

const baseProps = {
  columnId: 'In Progress',
  title: 'In Progress',
  count: 0,
  items: [] as string[],
  entityById: {} as Record<string, Entity>,
  visibleProps: [] as PropertyDefinition[],
  onEntityClick: vi.fn(),
  onEntityUpdate: vi.fn(),
  view,
  projectId: 'p1',
  scmIntegrationEnabled: false,
};

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderBoardColumn(
  props: Partial<
    typeof baseProps & {
      onInlineCreate?: (
        columnId: string,
        title: string,
        options?: { order?: number }
      ) => string | undefined;
      isDragActive?: boolean;
    }
  > = {}
) {
  const merged = { ...baseProps, ...props };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <SortableContext items={merged.items} strategy={verticalListSortingStrategy}>
        <BoardColumn {...merged} />
      </SortableContext>
    );
  });
  return { container, root };
}

describe('BoardColumn inline create', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('renders + Create button when onInlineCreate is provided', () => {
    const { container, root } = renderBoardColumn({ onInlineCreate: vi.fn() });

    const button = container.querySelector('[data-testid="board-lane-create-In Progress"]');
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe('+ Create');

    act(() => root.unmount());
    container.remove();
  });

  it('shows inline create card at the bottom when + Create is clicked', async () => {
    const { container, root } = renderBoardColumn({ onInlineCreate: vi.fn() });

    const button = container.querySelector(
      '[data-testid="board-lane-create-In Progress"]'
    ) as HTMLButtonElement;

    await act(async () => {
      button.click();
    });

    expect(container.querySelector('[data-testid="board-lane-create-In Progress"]')).toBeNull();
    expect(container.querySelector('[data-testid="board-inline-create-In Progress"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="board-inline-create-input-In Progress"]')
    ).not.toBeNull();

    const body = container.querySelector('.p-3');
    expect(body?.lastElementChild?.querySelector('[data-testid="board-inline-create-In Progress"]')).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('calls onInlineCreate with columnId, title and order on Enter, then keeps the input open', async () => {
    const onInlineCreate = vi.fn(() => 'new-1');
    const { container, root } = renderBoardColumn({ onInlineCreate });

    const button = container.querySelector(
      '[data-testid="board-lane-create-In Progress"]'
    ) as HTMLButtonElement;

    await act(async () => {
      button.click();
    });

    const input = container.querySelector(
      '[data-testid="board-inline-create-input-In Progress"]'
    ) as HTMLTextAreaElement;

    await act(async () => {
      setTextareaValue(input, 'New inline task');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });

    expect(onInlineCreate).toHaveBeenCalledWith('In Progress', 'New inline task', { order: 0 });
    // The input stays open on the next slot so several tasks can be typed in a row (REQ-310).
    const reopened = container.querySelector(
      '[data-testid="board-inline-create-input-In Progress"]'
    ) as HTMLTextAreaElement;
    expect(reopened).not.toBeNull();
    expect(reopened.value).toBe('');
    expect(container.querySelector('[data-testid="board-lane-create-In Progress"]')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('discards inline create on Escape without calling onInlineCreate', async () => {
    const onInlineCreate = vi.fn();
    const { container, root } = renderBoardColumn({ onInlineCreate });

    const button = container.querySelector(
      '[data-testid="board-lane-create-In Progress"]'
    ) as HTMLButtonElement;

    await act(async () => {
      button.click();
    });

    const input = container.querySelector(
      '[data-testid="board-inline-create-input-In Progress"]'
    ) as HTMLTextAreaElement;

    await act(async () => {
      setTextareaValue(input, 'Discarded task');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });

    expect(onInlineCreate).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="board-inline-create-In Progress"]')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('discards inline create on blur without calling onInlineCreate', async () => {
    const onInlineCreate = vi.fn();
    const { container, root } = renderBoardColumn({ onInlineCreate });

    const button = container.querySelector(
      '[data-testid="board-lane-create-In Progress"]'
    ) as HTMLButtonElement;

    await act(async () => {
      button.click();
    });

    const input = container.querySelector(
      '[data-testid="board-inline-create-input-In Progress"]'
    ) as HTMLTextAreaElement;

    await act(async () => {
      setTextareaValue(input, 'Discarded task');
      input.blur();
    });

    expect(onInlineCreate).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="board-inline-create-In Progress"]')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('does not create when Enter is pressed with empty title', async () => {
    const onInlineCreate = vi.fn();
    const { container, root } = renderBoardColumn({ onInlineCreate });

    const button = container.querySelector(
      '[data-testid="board-lane-create-In Progress"]'
    ) as HTMLButtonElement;

    await act(async () => {
      button.click();
    });

    const input = container.querySelector(
      '[data-testid="board-inline-create-input-In Progress"]'
    ) as HTMLTextAreaElement;

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });

    expect(onInlineCreate).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="board-inline-create-In Progress"]')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('restores the draft after Escape when reopening the inline create', async () => {
    const onInlineCreate = vi.fn();
    const { container, root } = renderBoardColumn({ onInlineCreate });

    await act(async () => {
      (
        container.querySelector('[data-testid="board-lane-create-In Progress"]') as HTMLButtonElement
      ).click();
    });

    let input = container.querySelector(
      '[data-testid="board-inline-create-input-In Progress"]'
    ) as HTMLTextAreaElement;

    await act(async () => {
      setTextareaValue(input, 'Kept draft');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });

    expect(onInlineCreate).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="board-inline-create-In Progress"]')).toBeNull();

    await act(async () => {
      (
        container.querySelector('[data-testid="board-lane-create-In Progress"]') as HTMLButtonElement
      ).click();
    });

    input = container.querySelector(
      '[data-testid="board-inline-create-input-In Progress"]'
    ) as HTMLTextAreaElement;
    expect(input.value).toBe('Kept draft');

    act(() => root.unmount());
    container.remove();
  });

  it('restores the draft after blur when reopening the inline create', async () => {
    const onInlineCreate = vi.fn();
    const { container, root } = renderBoardColumn({ onInlineCreate });

    await act(async () => {
      (
        container.querySelector('[data-testid="board-lane-create-In Progress"]') as HTMLButtonElement
      ).click();
    });

    let input = container.querySelector(
      '[data-testid="board-inline-create-input-In Progress"]'
    ) as HTMLTextAreaElement;

    await act(async () => {
      setTextareaValue(input, 'Blurred draft');
      input.blur();
    });

    expect(onInlineCreate).not.toHaveBeenCalled();

    await act(async () => {
      (
        container.querySelector('[data-testid="board-lane-create-In Progress"]') as HTMLButtonElement
      ).click();
    });

    input = container.querySelector(
      '[data-testid="board-inline-create-input-In Progress"]'
    ) as HTMLTextAreaElement;
    expect(input.value).toBe('Blurred draft');

    act(() => root.unmount());
    container.remove();
  });

  it('clears the draft after a successful create', async () => {
    const onInlineCreate = vi.fn(() => 'new-1');
    const { container, root } = renderBoardColumn({ onInlineCreate });

    await act(async () => {
      (
        container.querySelector('[data-testid="board-lane-create-In Progress"]') as HTMLButtonElement
      ).click();
    });

    let input = container.querySelector(
      '[data-testid="board-inline-create-input-In Progress"]'
    ) as HTMLTextAreaElement;

    await act(async () => {
      setTextareaValue(input, 'Submitted task');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });

    expect(onInlineCreate).toHaveBeenCalledWith('In Progress', 'Submitted task', { order: 0 });

    input = container.querySelector(
      '[data-testid="board-inline-create-input-In Progress"]'
    ) as HTMLTextAreaElement;
    expect(input.value).toBe('');

    // ...and it stays empty after closing and reopening.
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    await act(async () => {
      (
        container.querySelector('[data-testid="board-lane-create-In Progress"]') as HTMLButtonElement
      ).click();
    });

    input = container.querySelector(
      '[data-testid="board-inline-create-input-In Progress"]'
    ) as HTMLTextAreaElement;
    expect(input.value).toBe('');

    act(() => root.unmount());
    container.remove();
  });

  it('does not render + Create button when onInlineCreate is not provided', () => {
    const { container, root } = renderBoardColumn();

    const button = container.querySelector('[data-testid="board-lane-create-In Progress"]');
    expect(button).toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});
