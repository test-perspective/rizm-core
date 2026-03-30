import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Entity, PropertyDefinition } from '../../types';
import { SortableCard } from './BoardCard';

vi.mock('../scm/CreateBranchDialog', () => ({
  CreateBranchDialog: () => null,
}));
vi.mock('../scm/CreatePullRequestDialog', () => ({
  CreatePullRequestDialog: () => null,
}));

const baseEntity: Entity = {
  id: 'e1',
  entityId: 'task',
  createdAt: 1000,
  updatedAt: 1000,
  properties: { taskKey: 'TASK-1', title: 'Test card' },
};

const baseProps = {
  entity: baseEntity,
  visibleProps: [] as PropertyDefinition[],
  onClick: vi.fn(),
  onEntityUpdate: vi.fn(),
  columnTaskIds: ['e1', 'e2', 'e3'],
  onMoveCard: vi.fn(),
  projectId: 'p1',
  scmIntegrationEnabled: false,
  scmConfig: null,
  scmConnected: false,
  scmLoading: false,
};

function renderSortableCard(props: Partial<typeof baseProps> = {}) {
  const merged = { ...baseProps, ...props };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <DndContext onDragStart={() => {}} onDragEnd={() => {}}>
        <SortableContext items={[merged.entity.id]} strategy={verticalListSortingStrategy}>
          <SortableCard {...merged} />
        </SortableContext>
      </DndContext>
    );
  });
  return { container, root };
}

describe('SortableCard', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('shows Move to top/bottom menu when onMoveCard is provided', async () => {
    const onMoveCard = vi.fn();
    const { container, root } = renderSortableCard({ onMoveCard });

    const menuButton = container.querySelector('button[aria-label="Menu"]');
    expect(menuButton).not.toBeNull();

    await act(async () => {
      (menuButton as HTMLButtonElement).click();
    });

    const moveToTopButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Move to top')
    );
    expect(moveToTopButton).not.toBeNull();
    expect(moveToTopButton?.hasAttribute('disabled')).toBe(true);

    const moveToBottomButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Move to bottom')
    );
    expect(moveToBottomButton).not.toBeNull();
    expect(moveToBottomButton?.hasAttribute('disabled')).toBe(false);

    await act(async () => {
      (moveToBottomButton as HTMLButtonElement).click();
    });

    expect(onMoveCard).toHaveBeenCalledWith('e1', 'bottom');

    act(() => root.unmount());
    container.remove();
  });

  it('calls onMoveCard with top when Move to top is clicked and card is not first', async () => {
    const onMoveCard = vi.fn();
    const entity: Entity = { ...baseEntity, id: 'e2' };
    const { container, root } = renderSortableCard({
      entity,
      columnTaskIds: ['e1', 'e2', 'e3'],
      onMoveCard,
    });

    const menuButton = container.querySelector('button[aria-label="Menu"]');
    await act(async () => {
      (menuButton as HTMLButtonElement).click();
    });

    const moveToTopButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Move to top')
    );
    expect(moveToTopButton?.hasAttribute('disabled')).toBe(false);

    await act(async () => {
      (moveToTopButton as HTMLButtonElement).click();
    });

    expect(onMoveCard).toHaveBeenCalledWith('e2', 'top');

    act(() => root.unmount());
    container.remove();
  });

  it('does not render 3-dot menu when onMoveCard is not provided', () => {
    const { container, root } = renderSortableCard({ onMoveCard: undefined });

    const menuButton = container.querySelector('button[aria-label="Menu"]');
    expect(menuButton).toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});
