import type { TreeMoveTarget } from './wikiTreeOrder';

const INSIDE_PREFIX = 'inside:';
const BEFORE_PREFIX = 'before:';
const AFTER_PREFIX = 'after:';

export function buildInsideDropId(id: string): string {
  return `${INSIDE_PREFIX}${id}`;
}

export function buildBeforeDropId(id: string): string {
  return `${BEFORE_PREFIX}${id}`;
}

export function buildAfterDropId(id: string): string {
  return `${AFTER_PREFIX}${id}`;
}

export function parseDropTarget(overId: string): TreeMoveTarget | null {
  if (overId.startsWith(INSIDE_PREFIX)) {
    const parentId = overId.slice(INSIDE_PREFIX.length);
    return parentId ? { type: 'inside', parentId } : null;
  }
  if (overId.startsWith(BEFORE_PREFIX)) {
    const siblingId = overId.slice(BEFORE_PREFIX.length);
    return siblingId ? { type: 'before', siblingId } : null;
  }
  if (overId.startsWith(AFTER_PREFIX)) {
    const siblingId = overId.slice(AFTER_PREFIX.length);
    return siblingId ? { type: 'after', siblingId } : null;
  }
  // Backward compatibility for plain row IDs.
  return overId ? { type: 'inside', parentId: overId } : null;
}
