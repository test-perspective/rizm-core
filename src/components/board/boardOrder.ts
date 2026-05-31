import type { Entity } from '../../types';

export const ORDER_KEY = '__keelOrder';
export const ORDER_GAP = 1000;
const ORDER_EPS = 1e-4;

export type OrderReindex = Array<{ entityId: string; order: number }>;

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const getOrder = (e: Entity | undefined): number | null => {
  if (!e) return null;
  const v = e.properties?.[ORDER_KEY];
  return isFiniteNumber(v) ? v : null;
};

export const sortEntitiesForBoard = (a: Entity, b: Entity) => {
  const ao = getOrder(a);
  const bo = getOrder(b);
  if (ao !== null && bo !== null) {
    if (ao !== bo) return ao - bo;
  } else if (ao !== null && bo === null) {
    return -1;
  } else if (ao === null && bo !== null) {
    return 1;
  }
  // Fallback: stable-ish ordering so initial render isn't random.
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id.localeCompare(b.id);
};

export const computeOrderForMove = (
  destIds: string[],
  movedId: string,
  entityById: Record<string, Entity>
): { order: number; reindex: OrderReindex } => {
  const idx = destIds.indexOf(movedId);
  // If destination column has any items without an order yet, we must reindex the whole column.
  // Otherwise, the visual ordering won't persist because the next render sorts by __keelOrder.
  const needsReindex = destIds.some((id) => getOrder(entityById[id]) === null);
  if (needsReindex) {
    const reindex: OrderReindex = destIds.map((id, i) => ({
      entityId: id,
      order: i * ORDER_GAP,
    }));
    return { order: (idx < 0 ? 0 : idx * ORDER_GAP), reindex };
  }

  const prevId = idx > 0 ? destIds[idx - 1] : null;
  const nextId = idx >= 0 && idx < destIds.length - 1 ? destIds[idx + 1] : null;

  const prevOrder = prevId ? getOrder(entityById[prevId]) : null;
  const nextOrder = nextId ? getOrder(entityById[nextId]) : null;

  if (prevOrder !== null && nextOrder !== null) {
    const gap = nextOrder - prevOrder;
    if (gap > ORDER_EPS) {
      return { order: prevOrder + gap / 2, reindex: [] };
    }
    // too tight → reindex whole column
  } else if (prevOrder !== null && nextOrder === null) {
    return { order: prevOrder + ORDER_GAP, reindex: [] };
  } else if (prevOrder === null && nextOrder !== null) {
    return { order: nextOrder - ORDER_GAP, reindex: [] };
  }

  // Reindex destination column (including movedId) to guarantee stable future inserts.
  const reindex: OrderReindex = destIds.map((id, i) => ({
    entityId: id,
    order: i * ORDER_GAP,
  }));
  return { order: idx < 0 ? 0 : idx * ORDER_GAP, reindex };
};

/**
 * Compute order value for a new entity to be placed at the top of a lane.
 * Returns a value that is less than the minimum existing order in the lane,
 * ensuring the new entity appears first when sorted by __keelOrder.
 *
 * @param laneEntities - Entities in the target lane (column)
 * @returns Order value for the new entity (guaranteed to be first)
 */
export const computeOrderForNewEntityAtTopInLane = (laneEntities: Entity[]): number => {
  // Find all existing orders in the lane
  const existingOrders = laneEntities
    .map((e) => getOrder(e))
    .filter((o): o is number => o !== null);

  if (existingOrders.length === 0) {
    // No existing orders: start at 0
    return 0;
  }

  // Find minimum order in the lane
  const minOrder = Math.min(...existingOrders);

  // Return a value smaller than the minimum to ensure it appears first
  // This handles both positive and negative orders correctly
  return minOrder - ORDER_GAP;
};

/**
 * Compute order value for a new entity to be placed at the bottom of a lane.
 * Returns a value greater than the maximum existing order in the lane when orders exist.
 * When the lane has entities but none have orders yet, returns null so the new entity
 * sorts last by createdAt among peers without __keelOrder.
 */
export const computeOrderForNewEntityAtBottomInLane = (laneEntities: Entity[]): number | null => {
  const existingOrders = laneEntities
    .map((e) => getOrder(e))
    .filter((o): o is number => o !== null);

  if (existingOrders.length === 0) {
    return laneEntities.length === 0 ? 0 : null;
  }

  const maxOrder = Math.max(...existingOrders);
  return maxOrder + ORDER_GAP;
};

