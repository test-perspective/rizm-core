import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  DataGridPremium,
  GridColumnResizeParams,
  GridRowModel,
  useGridApiRef,
} from '@mui/x-data-grid-premium';
import { TablePagination } from '@mui/material';
import { Download, RefreshCw } from 'lucide-react';
import type { TableRow } from './table/types';
import { useTableContextMenu } from './table/useTableContextMenu';
import { TableContextMenu } from './table/TableContextMenu';
import { tableGridSx, tablePaginationSx } from './table/tableViewStyles';
import type { TableViewProps } from './table/tableViewTypes';
import { useTableViewState } from './table/useTableViewState';
import { useTableViewExport } from './table/useTableViewExport';
import { createTablePageNavIdsSync } from './table/useTablePageNavEntityIds';

export const TableView = ({
  entities,
  view,
  properties,
  onEntityUpdate,
  onUpsertPropertyOption,
  onEntityClick,
  allEntities = [],
  projectId,
  projectKey,
  usersById = {},
  onResolveUsers,
  onReload,
  onTablePageEntityOrderChange,
}: TableViewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const apiRef = useGridApiRef();

  const {
    contextMenuAnchor,
    contextMenuEntity,
    closeContextMenu,
    RowWithContextMenu,
    handleCopyTaskKey,
    handleCopyDetailUrl,
    handleContextMenuOpenDetail,
  } = useTableContextMenu({
    entities,
    view,
    projectId,
    onEntityClick,
  });

  const state = useTableViewState({
    projectId,
    view,
    properties,
    entities,
    allEntities,
    onEntityClick,
    usersById,
    onResolveUsers,
    onUpsertPropertyOption,
    apiRef,
  });

  const syncPageNavIds = useMemo(
    () =>
      onTablePageEntityOrderChange
        ? createTablePageNavIdsSync(apiRef, state.page, state.rowsPerPage, onTablePageEntityOrderChange)
        : undefined,
    [apiRef, state.page, state.rowsPerPage, onTablePageEntityOrderChange]
  );

  // Re-sync when the table remounts (e.g. board → table): DataGrid may not emit stateChange until user interaction.
  // Do not depend on filterModel here — unstable refs caused update-depth loops before.
  useLayoutEffect(() => {
    syncPageNavIds?.();
  }, [syncPageNavIds, state.rows.length]);

  const { handleExportCsv, isExportingCsv } = useTableViewExport({
    apiRef,
    columns: state.columns,
    columnVisibilityModel: state.columnVisibilityModel,
    filterModel: state.filterModel,
    rows: state.rows,
    projectKey,
    viewName: view.name,
  });

  return (
    <div ref={containerRef} className="h-full min-w-0 min-h-0 flex flex-col overflow-hidden p-6">
      <div className="flex-1 min-w-0 min-h-0 bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden flex flex-col">
        <div className="flex items-center justify-end gap-2 px-3 py-2 border-b border-zinc-800">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isExportingCsv || state.filteredCount === 0}
            aria-label="Download CSV"
            title="Download CSV"
            className="p-1.5 text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
          </button>
          {onReload && (
            <button
              type="button"
              onClick={async () => {
                state.setPendingReload(true);
                try {
                  await onReload();
                } finally {
                  state.setReloadCompletedAt(Date.now());
                }
              }}
              disabled={!state.reloadEnabled}
              aria-label="Reload"
              title="Reload"
              className="p-1.5 text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md disabled:opacity-40"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>
        <div ref={gridContainerRef} className="flex-1 min-h-0 min-w-0 overflow-hidden">
          <DataGridPremium
            apiRef={apiRef}
            rowSelection={false}
            cellSelection
            disableRowSelectionOnClick
            slots={{ row: RowWithContextMenu }}
            hideFooter
            rows={state.rows}
            columns={state.columns}
            getRowId={(row) => row.__rowId}
            rowHeight={44}
            pagination
            paginationModel={{ page: state.page, pageSize: state.rowsPerPage }}
            onPaginationModelChange={state.handlePaginationModelChange}
            pageSizeOptions={[10, 20, 50, 100]}
            filterModel={state.filterModel}
            onFilterModelChange={state.handleFilterModelChange}
            columnVisibilityModel={state.columnVisibilityModel}
            onColumnVisibilityModelChange={state.handleColumnVisibilityModelChange}
            onColumnOrderChange={state.handleColumnOrderChange}
            initialState={{
              sorting: { sortModel: state.sortModel },
              ...(state.savedColumnOrder && state.savedColumnOrder.length > 0
                ? { columns: { orderedFields: state.savedColumnOrder } }
                : {}),
            }}
            processRowUpdate={(newRow: GridRowModel<TableRow>, oldRow: GridRowModel<TableRow>) => {
              const patch: Record<string, unknown> = {};
              for (const prop of properties) {
                const key = prop.name;
                if (key === 'taskKey') continue;
                const nextVal = (newRow as Record<string, unknown>)[key];
                const prevVal = (oldRow as Record<string, unknown>)[key];
                if (nextVal !== prevVal) {
                  if (prop.type === 'number') {
                    patch[key] = nextVal === '' || nextVal === null || nextVal === undefined ? null : Number(nextVal);
                  } else if (prop.type === 'boolean') {
                    patch[key] = Boolean(nextVal);
                  } else if (prop.type === 'select') {
                    patch[key] = nextVal === null || nextVal === undefined ? null : String(nextVal);
                  } else if (prop.type === 'labels') {
                    patch[key] = Array.isArray(nextVal)
                      ? nextVal.map((v) => String(v)).filter((v) => v.trim().length > 0)
                      : [];
                  } else {
                    patch[key] = nextVal;
                  }
                }
              }
              if (Object.keys(patch).length > 0) {
                onEntityUpdate(String((oldRow as Record<string, unknown>).__rowId), patch);
              }
              return newRow;
            }}
            onProcessRowUpdateError={(error) => {
              console.error('[keel] TableView row update failed:', error);
            }}
            onColumnWidthChange={(params: GridColumnResizeParams) => {
              const field = params.colDef.field;
              const width = params.width;
              if (field && width > 0) {
                state.handleColumnWidthChange(field, width);
              }
            }}
            {...(syncPageNavIds ? { onStateChange: syncPageNavIds } : {})}
            sx={tableGridSx}
          />
        </div>
        <TableContextMenu
          anchor={contextMenuAnchor}
          entity={contextMenuEntity}
          onClose={closeContextMenu}
          onOpenDetail={handleContextMenuOpenDetail}
          onCopyTaskKey={handleCopyTaskKey}
          onCopyDetailUrl={handleCopyDetailUrl}
        />
        <div className="border-t border-zinc-800">
          <TablePagination
            component="div"
            count={state.filteredCount}
            page={state.page}
            onPageChange={(_, nextPage) => state.setPage(nextPage)}
            rowsPerPage={state.rowsPerPage}
            onRowsPerPageChange={(e) => {
              const next = Number(e.target.value);
              state.setRowsPerPage(next);
              state.setPage(0);
            }}
            rowsPerPageOptions={[10, 20, 50, 100]}
            labelRowsPerPage="Rows per page:"
            sx={tablePaginationSx}
          />
        </div>
      </div>
      <div className="mt-2 text-xs text-zinc-500">
        Tip: Click a cell to select, double-click to edit.
      </div>
    </div>
  );
};
