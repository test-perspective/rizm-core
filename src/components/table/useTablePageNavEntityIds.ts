import type { MutableRefObject } from 'react';

type GridApiLike = { getSortedRowIds?: () => (string | number)[] };

/**
 * Reads sorted+filtered row order from the Data Grid API and returns entity ids
 * visible on the current pagination page (client-side page only).
 */
export function computeTablePageEntityIds(
  api: GridApiLike | null | undefined,
  page: number,
  rowsPerPage: number
): string[] {
  if (!api?.getSortedRowIds) return [];
  try {
    const sorted = api.getSortedRowIds().map(String);
    const start = page * rowsPerPage;
    const end = Math.min(start + rowsPerPage, sorted.length);
    return sorted.slice(start, end);
  } catch {
    return [];
  }
}

/**
 * Callback for DataGrid `onStateChange` to keep parent state in sync with the
 * current page's row order (matches grid sort/filter/pagination).
 * Only calls `onChange` when the id list actually changes — the grid fires
 * `stateChange` very often; without this, parent setState causes an update loop.
 */
export function createTablePageNavIdsSync(
  apiRef: MutableRefObject<GridApiLike | null>,
  page: number,
  rowsPerPage: number,
  onChange: (ids: string[]) => void
): () => void {
  let lastKey: string | null = null;
  return () => {
    queueMicrotask(() => {
      const ids = computeTablePageEntityIds(apiRef.current, page, rowsPerPage);
      const key = ids.join('\u0001');
      if (key === lastKey) return;
      lastKey = key;
      onChange(ids);
    });
  };
}
