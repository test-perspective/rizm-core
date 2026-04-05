import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entity, ViewConfig } from '../../types';
import { useBoardViewDnd } from './useBoardViewDnd';

type HookState = ReturnType<typeof useBoardViewDnd>;

const baseView: ViewConfig = {
  id: 'view-1',
  name: 'Board',
  type: 'board',
  entityId: 'task',
  groupBy: 'status',
  visibleProperties: ['title'],
  columnOrder: ['Todo', 'Doing', 'Done'],
};

const entities: Entity[] = [
  {
    id: 'e1',
    entityId: 'task',
    createdAt: 1,
    updatedAt: 1,
    properties: { status: 'Todo', title: 'Task 1' },
  },
  {
    id: 'e2',
    entityId: 'task',
    createdAt: 2,
    updatedAt: 2,
    properties: { status: 'Doing', title: 'Task 2' },
  },
];

const baseColumns = ['Todo', 'Doing', 'Done'];
const onEntityUpdate = vi.fn();
const onViewConfigUpdate = vi.fn();

function HookHarness({
  onState,
}: {
  onState: (state: HookState) => void;
}) {
  const state = useBoardViewDnd({
    columns: baseColumns,
    orderedColumns: baseColumns,
    entities,
    view: baseView,
    onEntityUpdate,
    onViewConfigUpdate,
  });

  useEffect(() => {
    onState(state);
  }, [state, onState]);

  return null;
}

describe('useBoardViewDnd column preview order', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    onEntityUpdate.mockClear();
    onViewConfigUpdate.mockClear();
  });

  it('updates visible column order during drag over to preview drop state', () => {
    let latestState: HookState | null = null;
    const getState = () => {
      expect(latestState).not.toBeNull();
      return latestState!;
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<HookHarness onState={(state) => { latestState = state; }} />);
    });

    const state = getState();
    expect(state.displayColumns).toEqual(['Todo', 'Doing', 'Done']);

    act(() => {
      state.handleDragStart({
        active: { id: 'Todo' },
      } as any);
    });

    act(() => {
      getState().handleDragOver({
        active: { id: 'Todo' },
        over: { id: 'Done' },
      } as any);
    });

    expect(getState().displayColumns).toEqual(['Doing', 'Done', 'Todo']);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('starts preview immediately after drag start and persists the preview order on drop', () => {
    let latestState: HookState | null = null;
    const getState = () => {
      expect(latestState).not.toBeNull();
      return latestState!;
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<HookHarness onState={(state) => { latestState = state; }} />);
    });

    const initialState = getState();

    act(() => {
      initialState.handleDragStart({
        active: { id: 'Todo' },
      } as any);
      initialState.handleDragOver({
        active: { id: 'Todo' },
        over: { id: 'Doing' },
      } as any);
    });

    expect(getState().displayColumns).toEqual(['Doing', 'Todo', 'Done']);

    act(() => {
      getState().handleDragEnd({
        active: { id: 'Todo' },
        over: { id: 'Todo' },
      } as any);
    });

    expect(onViewConfigUpdate).toHaveBeenCalledWith({
      ...baseView,
      columnOrder: ['Doing', 'Todo', 'Done'],
    });

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
