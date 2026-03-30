import type { Entity } from '../../types';
import { getOrder, ORDER_GAP } from '../board/boardOrder';
import { getParentId } from './wikiTreeHelpers';

export type TreeMoveTarget =
  | { type: 'inside'; parentId: string }
  | { type: 'before'; siblingId: string }
  | { type: 'after'; siblingId: string };

function isDescendantOf(id: string, ancestorId: string, entityById: Record<string, Entity>): boolean {
  const entity = entityById[id];
  if (!entity) return false;
  let pid: string | null = getParentId(entity);
  while (pid) {
    if (pid === ancestorId) return true;
    pid = getParentId(entityById[pid]);
  }
  return false;
}

export function computeTreeMove(
  movedId: string,
  target: TreeMoveTarget,
  entityById: Record<string, Entity>
): { parentId: string | null; order: number; reindex: Array<{ entityId: string; order: number }> } {
  const moved = entityById[movedId];
  if (!moved) return { parentId: null, order: 0, reindex: [] };
  const fallback = {
    parentId: getParentId(moved),
    order: getOrder(moved) ?? 0,
    reindex: [] as Array<{ entityId: string; order: number }>,
  };

  if (target.type === 'inside') {
    const parentId = target.parentId;
    if (movedId === parentId || isDescendantOf(parentId, movedId, entityById)) {
      return fallback;
    }
    const parent = entityById[parentId];
    if (!parent) return fallback;
    const siblings = Object.values(entityById).filter(
      (e) => getParentId(e) === parentId && e.id !== movedId
    );
    siblings.sort((a, b) => (getOrder(a) ?? 0) - (getOrder(b) ?? 0));
    const destIds = [...siblings.map((s) => s.id), movedId];
    const { order, reindex } = computeOrderForSiblings(destIds, movedId, entityById);
    return { parentId, order, reindex };
  }

  const sibling = entityById[target.siblingId];
  if (!sibling) return fallback;
  const newParentId = getParentId(sibling);
  if (
    target.siblingId === movedId ||
    newParentId === movedId ||
    (newParentId !== null && isDescendantOf(newParentId, movedId, entityById))
  ) {
    return fallback;
  }

  const siblings = Object.values(entityById).filter(
    (e) => getParentId(e) === newParentId && e.id !== movedId
  );
  siblings.sort((a, b) => (getOrder(a) ?? 0) - (getOrder(b) ?? 0));
  const sibIds = siblings.map((s) => s.id);
  const idx = sibIds.indexOf(target.siblingId);
  if (idx === -1) return fallback;

  const insertIdx = target.type === 'before' ? idx : idx + 1;
  const destIds = [...sibIds.slice(0, insertIdx), movedId, ...sibIds.slice(insertIdx)];
  const { order, reindex } = computeOrderForSiblings(destIds, movedId, entityById);
  return { parentId: newParentId, order, reindex };
}

function computeOrderForSiblings(
  destIds: string[],
  movedId: string,
  entityById: Record<string, Entity>
): { order: number; reindex: Array<{ entityId: string; order: number }> } {
  const ORDER_EPS = 1e-4;
  const idx = destIds.indexOf(movedId);
  const needsReindex = destIds.some((id) => getOrder(entityById[id]) === null);
  if (needsReindex) {
    const reindex = destIds.map((id, i) => ({
      entityId: id,
      order: i * ORDER_GAP,
    }));
    return { order: idx < 0 ? 0 : idx * ORDER_GAP, reindex };
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
  } else if (prevOrder !== null && nextOrder === null) {
    return { order: prevOrder + ORDER_GAP, reindex: [] };
  } else if (prevOrder === null && nextOrder !== null) {
    return { order: nextOrder - ORDER_GAP, reindex: [] };
  }

  const reindex = destIds.map((id, i) => ({
    entityId: id,
    order: i * ORDER_GAP,
  }));
  return { order: idx < 0 ? 0 : idx * ORDER_GAP, reindex };
}
