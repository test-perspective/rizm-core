import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { ViewConfig } from '../../types';
import { SortableViewRow } from './SortableViewRow';
import { getViewIcon } from './sidebarUtils';

const boardView: ViewConfig = {
  id: 'v-board',
  name: 'Board',
  type: 'board',
  entityId: 'task',
  groupBy: 'status',
  visibleProperties: ['title'],
  columnOrder: ['Todo'],
};

function DndHarness({ view, onClick }: { view: ViewConfig; onClick?: () => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  return (
    <DndContext sensors={sensors}>
      <SortableContext items={[view.id]} strategy={verticalListSortingStrategy}>
        <SortableViewRow
          view={view}
          isActive={false}
          canEdit
          onClick={onClick ?? (() => {})}
          getViewIcon={getViewIcon}
        />
      </SortableContext>
    </DndContext>
  );
}

describe('SortableViewRow', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('renders view label without per-row overflow menu', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<DndHarness view={boardView} />);
    });

    expect(container.textContent).toContain('Board');
    expect(container.querySelector('[data-testid^="view-row-menu"]')).toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
