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

function renderBoardColumn(props: Partial<typeof baseProps & { onCreateEntityInColumn?: (columnId: string) => void }> = {}) {
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

describe('BoardColumn + Create', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('renders + Create button when onCreateEntityInColumn is provided', () => {
    const { container, root } = renderBoardColumn({ onCreateEntityInColumn: vi.fn() });

    const button = container.querySelector('[data-testid="board-lane-create-In Progress"]');
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe('+ Create');

    act(() => root.unmount());
    container.remove();
  });

  it('renders + Create button at the bottom of the lane body', () => {
    const entity: Entity = {
      id: 'e1',
      entityId: 'task',
      createdAt: 1000,
      updatedAt: 1000,
      properties: { title: 'Existing task' },
    };
    const { container, root } = renderBoardColumn({
      onCreateEntityInColumn: vi.fn(),
      items: ['e1'],
      entityById: { e1: entity },
    });

    const button = container.querySelector('[data-testid="board-lane-create-In Progress"]');
    expect(button).not.toBeNull();

    const body = button?.closest('.p-3');
    expect(body).not.toBeNull();
    expect(body?.lastElementChild).toBe(button);

    act(() => root.unmount());
    container.remove();
  });

  it('calls onCreateEntityInColumn with columnId when + Create is clicked', async () => {
    const onCreateEntityInColumn = vi.fn();
    const { container, root } = renderBoardColumn({ onCreateEntityInColumn });

    const button = container.querySelector(
      '[data-testid="board-lane-create-In Progress"]'
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();

    await act(async () => {
      button.click();
    });

    expect(onCreateEntityInColumn).toHaveBeenCalledWith('In Progress');

    act(() => root.unmount());
    container.remove();
  });

  it('does not render + Create button when onCreateEntityInColumn is not provided', () => {
    const { container, root } = renderBoardColumn();

    const button = container.querySelector('[data-testid="board-lane-create-In Progress"]');
    expect(button).toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});
