import { act } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import type { Entity, PropertyDefinition } from '../../types';
import { BoardColumnDragPreview } from './BoardColumnDragPreview';

describe('BoardColumnDragPreview', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('renders full column chrome with title, count, and card bodies (not header-only)', () => {
    const entity: Entity = {
      id: 'e1',
      entityId: 'task',
      createdAt: 1,
      updatedAt: 1,
      properties: { taskKey: 'TASK-99', title: 'Preview card title' },
    };
    const visibleProps: PropertyDefinition[] = [];

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <BoardColumnDragPreview
          columnTitle="In Progress"
          taskCount={1}
          items={['e1']}
          entityById={{ e1: entity }}
          visibleProps={visibleProps}
          isSingleColumn={false}
        />
      );
    });

    const preview = container.querySelector('[data-testid="board-column-drag-preview"]');
    expect(preview).not.toBeNull();
    expect(preview?.classList.contains('pointer-events-none')).toBe(true);

    expect(container.textContent).toContain('In Progress');
    expect(container.textContent).toContain('1');
    expect(container.textContent).toContain('Preview card title');
    expect(container.textContent).toContain('TASK-99');

    const body = container.querySelector('.min-h-\\[200px\\]');
    expect(body).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('renders a static divider row for divider ids', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <BoardColumnDragPreview
          columnTitle="Todo"
          taskCount={0}
          items={['divider::d1']}
          entityById={{}}
          visibleProps={[]}
          isSingleColumn={false}
          boardDividers={[{ id: 'divider::d1', title: 'Section A', columnId: 'Todo' }]}
        />
      );
    });

    expect(container.textContent).toContain('Section A');

    act(() => root.unmount());
    container.remove();
  });
});
