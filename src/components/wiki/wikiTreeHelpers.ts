import type { Entity } from '../../types';
import { getOrder } from '../board/boardOrder';

export type WikiNodeType = 'page' | 'folder';

export const NODE_TYPE_KEY = 'nodeType';
export const PARENT_ID_KEY = 'parentId';

export const getNodeType = (e: Entity): WikiNodeType => {
  const v = e.properties?.[NODE_TYPE_KEY];
  return v === 'folder' ? 'folder' : 'page';
};

export const getParentId = (e: Entity): string | null => {
  const v = e.properties?.[PARENT_ID_KEY];
  if (v == null || v === '') return null;
  return typeof v === 'string' ? v : null;
};

/**
 * Flat list in tree order (depth-first). Used for migration, create order, etc.
 */
export function sortWikiTreeOrder(pages: Entity[]): Entity[] {
  const byParent = new Map<string | null, Entity[]>();
  for (const p of pages) {
    const pid = getParentId(p);
    const list = byParent.get(pid) ?? [];
    list.push(p);
    byParent.set(pid, list);
  }
  for (const list of byParent.values()) {
    list.sort(sortSiblings);
  }
  const out: Entity[] = [];
  function walk(pid: string | null) {
    const children = byParent.get(pid) ?? [];
    for (const e of children) {
      out.push(e);
      walk(e.id);
    }
  }
  walk(null);
  return out;
}

/**
 * Get siblings (same parent) for an entity. Used for order computation.
 */
export function getSiblingsAtParent(
  pages: Entity[],
  parentId: string | null
): Entity[] {
  const siblings = pages.filter((p) => getParentId(p) === parentId);
  return [...siblings].sort(sortSiblings);
}

export interface WikiTreeRow {
  entity: Entity;
  depth: number;
  isFolder: boolean;
  hasChildren: boolean;
  parentId: string | null;
}

function sortSiblings(a: Entity, b: Entity): number {
  const ao = getOrder(a);
  const bo = getOrder(b);
  if (ao !== null && bo !== null) {
    if (ao !== bo) return ao - bo;
  } else if (ao !== null && bo === null) {
    return -1;
  } else if (ao === null && bo !== null) {
    return 1;
  }
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id.localeCompare(b.id);
}

/**
 * Build tree rows from flat entities. Respects expandedFolderIds - only children
 * of expanded folders are shown. Root-level items are always shown.
 */
export function buildWikiTreeRows(
  pages: Entity[],
  expandedFolderIds: Set<string>,
  searchQuery: string
): WikiTreeRow[] {
  const byParent = new Map<string | null, Entity[]>();
  for (const p of pages) {
    const pid = getParentId(p);
    const list = byParent.get(pid) ?? [];
    list.push(p);
    byParent.set(pid, list);
  }
  for (const list of byParent.values()) {
    list.sort(sortSiblings);
  }

  const q = searchQuery.trim().toLowerCase();
  const matchesSearch = (e: Entity) =>
    !q || String(e.properties?.title ?? '').toLowerCase().includes(q);

  const ancestorIds = new Set<string>();
  if (q) {
    for (const p of pages) {
      if (matchesSearch(p)) {
        let pid: string | null = getParentId(p);
        while (pid) {
          ancestorIds.add(pid);
          const parent = pages.find((e) => e.id === pid);
          pid = parent ? getParentId(parent) : null;
        }
      }
    }
  }

  const rows: WikiTreeRow[] = [];

  function walk(parentId: string | null, depth: number) {
    const children = byParent.get(parentId) ?? [];
    for (const e of children) {
      const isFolder = getNodeType(e) === 'folder';
      const childList = byParent.get(e.id) ?? [];
      const hasChildren = childList.length > 0;

      const isExpanded = expandedFolderIds.has(e.id);
      const isAncestorOfMatch = q && ancestorIds.has(e.id);
      const isMatch = matchesSearch(e);
      const showChildren =
          hasChildren &&
          (isExpanded || isAncestorOfMatch || (q && isMatch));

      if (!q) {
        rows.push({
          entity: e,
          depth,
          isFolder,
          hasChildren,
          parentId: getParentId(e),
        });
        const shouldRecurse = hasChildren && isExpanded;
        if (shouldRecurse) {
          walk(e.id, depth + 1);
        }
      } else {
        const showSelf = isMatch || isAncestorOfMatch;
        if (showSelf) {
          rows.push({
            entity: e,
            depth,
            isFolder,
            hasChildren,
            parentId: getParentId(e),
          });
        }
        if (showChildren && hasChildren) {
          walk(e.id, depth + 1);
        }
      }
    }
  }

  walk(null, 0);
  return rows;
}
