import type { PropertyDefinition, ViewConfig } from '../types';

export function getVisibleBoardColumns(view: ViewConfig, properties: PropertyDefinition[]): string[] {
  if (view.type !== 'board') return [];
  if (!view.groupBy) return [];

  const groupByProp = properties.find((p) => p.name === view.groupBy);
  const allColumns = groupByProp?.options ?? [];
  if (allColumns.length === 0) return [];

  const orderedColumns = (() => {
    if (view.columnOrder && view.columnOrder.length > 0) {
      const ordered = view.columnOrder.filter((col) => allColumns.includes(col));
      const unordered = allColumns.filter((col) => !view.columnOrder!.includes(col));
      return [...ordered, ...unordered];
    }
    return allColumns;
  })();

  const hiddenSet = new Set(view.hiddenColumns ?? []);
  return orderedColumns.filter((col) => !hiddenSet.has(col));
}

export function getInitialGroupByValueForNewEntity(
  view: ViewConfig,
  properties: PropertyDefinition[]
): string | undefined {
  const columns = getVisibleBoardColumns(view, properties);
  return columns[0];
}

