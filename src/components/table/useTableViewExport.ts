import { useCallback, useMemo, useState } from 'react';
import type { GridColDef, GridFilterModel } from '@mui/x-data-grid-premium';
import type { MutableRefObject } from 'react';
import type { TableRow } from './types';
import { downloadBlob } from '../../utils/exportZip';
import { buildTableCsv, makeTableCsvFilename } from '../../utils/tableCsvExport';

export type UseTableViewExportArgs = {
  apiRef: MutableRefObject<unknown>;
  columns: GridColDef<TableRow>[];
  columnVisibilityModel: Record<string, boolean>;
  filterModel: GridFilterModel;
  rows: TableRow[];
  projectKey: string;
  viewName: string;
};

export function useTableViewExport({
  apiRef,
  columns,
  columnVisibilityModel,
  filterModel,
  rows,
  projectKey,
  viewName,
}: UseTableViewExportArgs) {
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  const filterSummaryForFilename = useMemo(() => {
    const noValueOperators = new Set(['isEmpty', 'isNotEmpty', 'isTrue', 'isFalse']);
    const itemParts = (filterModel.items ?? [])
      .map((item) => {
        const field = String(item.field ?? '').trim();
        if (!field) return '';
        const operator = String(item.operator ?? 'op').trim();
        const rawValue = item.value;
        const hasValue = rawValue !== null && rawValue !== undefined && String(rawValue).trim().length > 0;
        if (!hasValue && !noValueOperators.has(operator)) {
          return '';
        }
        const valueText = hasValue ? String(rawValue).trim() : '';
        return valueText ? `${field}_${operator}_${valueText}` : `${field}_${operator}`;
      })
      .filter((part) => part.length > 0);

    const quickFilterParts = (filterModel.quickFilterValues ?? [])
      .map((v) => String(v ?? '').trim())
      .filter((v) => v.length > 0)
      .map((v) => `quick_${v}`);

    const allParts = [...itemParts, ...quickFilterParts];
    if (allParts.length === 0) return 'all';
    return allParts.join('__');
  }, [filterModel]);

  const handleExportCsv = useCallback(() => {
    if (isExportingCsv) return;
    setIsExportingCsv(true);
    try {
      const api = apiRef.current as {
        getAllColumns?: () => GridColDef<TableRow>[];
        getSortedRowIds?: () => Array<string | number>;
        getAllRowIds?: () => Array<string | number>;
        getFilterState?: (m: GridFilterModel) => { filteredRowsLookup?: Record<string, boolean> } | null;
        getRow?: (id: string | number) => TableRow | undefined;
      } | null;
      const apiColumns = api?.getAllColumns?.();
      const sourceColumns = apiColumns && apiColumns.length > 0 ? apiColumns : columns;
      const visibleColumns = sourceColumns.filter((col) => {
        const field = String(col.field ?? '');
        if (!field) return false;
        if (field === '__check__' || field === '__reorder__') return false;
        return columnVisibilityModel[field] !== false;
      });
      if (visibleColumns.length === 0) return;

      const sortedRowIds =
        (api?.getSortedRowIds?.() as Array<string | number> | undefined) ??
        (api?.getAllRowIds?.() as Array<string | number> | undefined) ??
        rows.map((row) => row.__rowId);
      const filterState = api?.getFilterState?.(filterModel);
      const filteredRowsLookup = filterState?.filteredRowsLookup ?? null;
      const filteredRowIds = sortedRowIds.filter((rowId) => filteredRowsLookup?.[String(rowId)] !== false);

      const rowById = new Map(rows.map((row) => [row.__rowId, row]));
      const exportRows = filteredRowIds
        .map((rowId) => {
          const apiRow = api?.getRow?.(rowId);
          if (apiRow && typeof apiRow === 'object') return apiRow;
          return rowById.get(String(rowId));
        })
        .filter((row): row is TableRow => Boolean(row));
      if (exportRows.length === 0) return;

      const csvText = buildTableCsv<TableRow>({
        columns: visibleColumns.map((col) => {
          const colAny = col as {
            valueGetter?: (value: unknown, row: TableRow) => unknown;
            valueFormatter?: (value: unknown, row?: TableRow) => string;
          };
          return {
            field: String(col.field),
            headerName: typeof col.headerName === 'string' ? col.headerName : String(col.field),
            valueGetter:
              typeof colAny.valueGetter === 'function'
                ? (value: unknown, row: TableRow) => colAny.valueGetter!(value, row)
                : undefined,
            valueFormatter:
              typeof colAny.valueFormatter === 'function'
                ? (value: unknown, row?: TableRow) => colAny.valueFormatter!(value, row)
                : undefined,
          };
        }),
        rows: exportRows,
      });

      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      downloadBlob(blob, makeTableCsvFilename({ projectKey, viewName, filterSummary: filterSummaryForFilename }));
    } finally {
      setIsExportingCsv(false);
    }
  }, [
    apiRef,
    columns,
    columnVisibilityModel,
    filterModel,
    filterSummaryForFilename,
    isExportingCsv,
    projectKey,
    rows,
    viewName,
  ]);

  return { handleExportCsv, isExportingCsv };
}
