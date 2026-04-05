import type { Entity } from '../../types';
import type { WikiPageMeta } from '../../types';
import { getParentId } from './wikiTreeHelpers';

/** All wiki page ids in the subtree rooted at `rootId` (including root). */
export function collectWikiSubtreeIds(rootId: string, pages: Entity[]): Set<string> {
  const byParent = new Map<string | null, string[]>();
  for (const p of pages) {
    const pid = getParentId(p);
    const list = byParent.get(pid) ?? [];
    list.push(p.id);
    byParent.set(pid, list);
  }
  const out = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const c of byParent.get(id) ?? []) {
      queue.push(c);
    }
  }
  return out;
}

function metaParentId(m: WikiPageMeta): string | null {
  const v = m.parentId;
  if (v == null || v === '') return null;
  return v;
}

function metaSortKey(m: WikiPageMeta): number {
  return typeof m.order === 'number' ? m.order : 0;
}

export type WikiMoveParentOption = {
  id: string | null;
  depth: number;
  title: string;
};

/** Tree-ordered parent choices for move destination (root first), excluding invalid targets. */
export function buildMoveParentOptions(
  metas: WikiPageMeta[],
  excludeIds: Set<string>
): WikiMoveParentOption[] {
  const byParent = new Map<string | null, WikiPageMeta[]>();
  for (const m of metas) {
    const pid = metaParentId(m);
    const list = byParent.get(pid) ?? [];
    list.push(m);
    byParent.set(pid, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => metaSortKey(a) - metaSortKey(b) || a.id.localeCompare(b.id));
  }
  const out: WikiMoveParentOption[] = [{ id: null, depth: 0, title: '(root level)' }];

  function walk(parentId: string | null, depth: number) {
    const children = byParent.get(parentId) ?? [];
    for (const m of children) {
      if (excludeIds.has(m.id)) continue;
      out.push({
        id: m.id,
        depth,
        title: m.title || 'Untitled',
      });
      walk(m.id, depth + 1);
    }
  }
  walk(null, 0);
  return out;
}

export function listMoveSiblingMetas(
  metas: WikiPageMeta[],
  parentId: string | null,
  excludeIds: Set<string>
): WikiPageMeta[] {
  return metas
    .filter((m) => {
      const p = metaParentId(m);
      const sameParent =
        (parentId === null && p === null) || (parentId !== null && p === parentId);
      return sameParent && !excludeIds.has(m.id);
    })
    .sort((a, b) => metaSortKey(a) - metaSortKey(b) || a.id.localeCompare(b.id));
}
