import React, { act } from 'react';
import { beforeAll, describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import type { Entity, PropertyDefinition, ViewConfig } from '../types';
import { TableView } from './TableView';

let capturedDataGridProps: Record<string, unknown> = {};

vi.mock('@mui/x-data-grid-premium', () => ({
  DataGridPremium: (props: Record<string, unknown>) => {
    capturedDataGridProps = props;
    return React.createElement('div', { 'data-testid': 'data-grid-premium-mock' });
  },
  useGridApiRef: () => ({ current: null }),
  GridRowModel: {},
  GridColumnResizeParams: {},
  GridColumnVisibilityModel: {},
  GridColumnOrderChangeParams: {},
  GridFilterModel: {},
  GridPaginationModel: {},
}));

vi.mock('../api/projects', () => ({
  fetchProjectsIndex: vi.fn().mockResolvedValue({ projects: [] }),
}));

const baseView: ViewConfig = {
  id: 'view-1',
  name: 'Tasks',
  type: 'table',
  entityId: 'task',
  visibleProperties: ['taskKey', 'title'],
  sortBy: 'updatedAt',
  sortOrder: 'asc',
};

const properties: PropertyDefinition[] = [
  { name: 'taskKey', type: 'text' },
  { name: 'title', type: 'text' },
];

const entities: Entity[] = [
  {
    id: 'e1',
    entityId: 'task',
    createdAt: 0,
    updatedAt: 0,
    properties: { taskKey: 'TASK-1', title: 'Sample Task' },
  },
];

describe('TableView', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    capturedDataGridProps = {};
    localStorage.clear();
  });

  it('passes onStateChange when onTablePageEntityOrderChange is provided', async () => {
    const onTablePageEntityOrderChange = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <TableView
          entities={entities}
          view={baseView}
          properties={properties}
          onEntityUpdate={() => {}}
          onUpsertPropertyOption={() => {}}
          projectId="p1"
          projectKey="REQ"
          onTablePageEntityOrderChange={onTablePageEntityOrderChange}
        />
      );
    });

    expect(typeof capturedDataGridProps.onStateChange).toBe('function');

    act(() => {
      (capturedDataGridProps.onStateChange as () => void)?.();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(onTablePageEntityOrderChange).toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('passes cell-copy props to DataGridPremium: rowSelection=false, cellSelection, disableRowSelectionOnClick', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <TableView
          entities={entities}
          view={baseView}
          properties={properties}
          onEntityUpdate={() => {}}
          onUpsertPropertyOption={() => {}}
          projectId="p1"
          projectKey="REQ"
        />
      );
    });

    expect(capturedDataGridProps.rowSelection).toBe(false);
    expect(capturedDataGridProps.cellSelection).toBe(true);
    expect(capturedDataGridProps.disableRowSelectionOnClick).toBe(true);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('keeps resized column width in component state', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <TableView
          entities={entities}
          view={baseView}
          properties={properties}
          onEntityUpdate={() => {}}
          onUpsertPropertyOption={() => {}}
          projectId="p1"
          projectKey="REQ"
        />
      );
    });

    const onColumnWidthChange = capturedDataGridProps.onColumnWidthChange as
      | ((params: { colDef: { field: string }; width: number }) => void)
      | undefined;
    expect(onColumnWidthChange).toBeTypeOf('function');

    await act(async () => {
      onColumnWidthChange?.({
        colDef: { field: 'title' },
        width: 420,
      });
    });

    const columns = capturedDataGridProps.columns as Array<{ field: string; width?: number }>;
    const titleColumn = columns.find((col) => col.field === 'title');
    expect(titleColumn?.width).toBe(420);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('preserves resized width after rows rerender', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <TableView
          entities={entities}
          view={baseView}
          properties={properties}
          onEntityUpdate={() => {}}
          onUpsertPropertyOption={() => {}}
          projectId="p1"
          projectKey="REQ"
        />
      );
    });

    const onColumnWidthChange = capturedDataGridProps.onColumnWidthChange as
      | ((params: { colDef: { field: string }; width: number }) => void)
      | undefined;
    await act(async () => {
      onColumnWidthChange?.({
        colDef: { field: 'title' },
        width: 480,
      });
    });

    const updatedEntities: Entity[] = [
      {
        ...entities[0],
        updatedAt: 1,
        properties: { ...entities[0].properties, title: 'Updated title' },
      },
    ];

    await act(async () => {
      root.render(
        <TableView
          entities={updatedEntities}
          view={baseView}
          properties={properties}
          onEntityUpdate={() => {}}
          onUpsertPropertyOption={() => {}}
          projectId="p1"
          projectKey="REQ"
        />
      );
    });

    const columns = capturedDataGridProps.columns as Array<{ field: string; width?: number }>;
    const titleColumn = columns.find((col) => col.field === 'title');
    expect(titleColumn?.width).toBe(480);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
