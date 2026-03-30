import type { Entity } from '../../types';
import { ORDER_GAP, getOrder } from '../board/boardOrder';

type OrderUpdate = { id: string; order: number };

export const computeWikiOrderMigration = (
  pages: Entity[],
  executedIds: Set<string>
): { updates: OrderUpdate[]; migratedIds: string[] } => {
  const pagesWithoutOrder = pages.filter((page) => {
    const hasOrder = getOrder(page) !== null;
    const alreadyMigrated = executedIds.has(page.id);
    return !hasOrder && !alreadyMigrated;
  });

  if (pagesWithoutOrder.length === 0) {
    return { updates: [], migratedIds: [] };
  }

  // Sort by updatedAt descending (old behavior) to maintain compatibility
  const sortedForMigration = [...pagesWithoutOrder].sort(
    (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
  );

  // Find the maximum existing order to append after it
  const existingOrders = pages
    .map((p) => getOrder(p))
    .filter((o): o is number => o !== null);
  const maxOrder = existingOrders.length > 0 ? Math.max(...existingOrders) : -ORDER_GAP;

  const updates = sortedForMigration.map((page, index) => ({
    id: page.id,
    order: maxOrder + (index + 1) * ORDER_GAP,
  }));

  return { updates, migratedIds: updates.map((u) => u.id) };
};
