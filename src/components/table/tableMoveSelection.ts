import type { Entity } from '../../types';

export type SelectedCell = { id: unknown; field: string };

/**
 * Which tasks a row action applies to.
 *
 * The grid runs with `rowSelection={false}` and `cellSelection` (copy/paste), so
 * there is no row selection model to read. Cell selection stands in for it: a
 * right-click inside the selected range acts on every row the range covers, and a
 * right-click outside it acts on that row alone.
 */
export function resolveRowActionTargets(
  selectedCells: SelectedCell[],
  contextEntity: Entity | null,
  entities: Entity[]
): Entity[] {
  if (!contextEntity) return [];

  const selectedIds = new Set(selectedCells.map((c) => String(c.id)));
  if (!selectedIds.has(contextEntity.id)) return [contextEntity];

  const targets = entities.filter((e) => selectedIds.has(e.id));
  return targets.length > 0 ? targets : [contextEntity];
}
