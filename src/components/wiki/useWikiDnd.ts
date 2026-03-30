import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragCancelEvent, DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';

import type { Entity } from '../../types';
import { getParentId, PARENT_ID_KEY } from './wikiTreeHelpers';
import { ORDER_KEY } from '../board/boardOrder';
import { computeTreeMove } from './wikiTreeOrder';
import { parseDropTarget } from './wikiDndTarget';

export interface UseWikiDndOptions {
  pages: Entity[];
  expandedFolderIds: Set<string>;
  setExpandedFolderIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  query: string;
  onUpdatePage: (id: string, patch: Record<string, unknown>) => void;
}

export function useWikiDnd({
  pages,
  expandedFolderIds,
  setExpandedFolderIds,
  query,
  onUpdatePage,
}: UseWikiDndOptions) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const hoverExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverExpandTargetRef = useRef<string | null>(null);

  const childCountByParentId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of pages) {
      const pid = getParentId(p);
      if (!pid) continue;
      map[pid] = (map[pid] ?? 0) + 1;
    }
    return map;
  }, [pages]);

  const entityById = useMemo(() => {
    const map: Record<string, Entity> = {};
    for (const p of pages) map[p.id] = p;
    return map;
  }, [pages]);

  const clearHoverExpandTimer = useCallback(() => {
    if (hoverExpandTimerRef.current) {
      clearTimeout(hoverExpandTimerRef.current);
      hoverExpandTimerRef.current = null;
    }
    hoverExpandTargetRef.current = null;
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      if (query.trim() !== '') {
        clearHoverExpandTimer();
        return;
      }
      if (!event.over) {
        clearHoverExpandTimer();
        return;
      }

      const target = parseDropTarget(String(event.over.id));
      if (!target || target.type !== 'inside') {
        clearHoverExpandTimer();
        return;
      }

      const hoverId = target.parentId;
      if (hoverId === String(event.active.id)) {
        clearHoverExpandTimer();
        return;
      }
      const hasChildren = (childCountByParentId[hoverId] ?? 0) > 0;
      const isExpanded = expandedFolderIds.has(hoverId);
      if (!hasChildren || isExpanded) {
        clearHoverExpandTimer();
        return;
      }
      if (hoverExpandTargetRef.current === hoverId) {
        return;
      }

      clearHoverExpandTimer();
      hoverExpandTargetRef.current = hoverId;
      hoverExpandTimerRef.current = setTimeout(() => {
        setExpandedFolderIds((prev) => {
          if (prev.has(hoverId)) return prev;
          const next = new Set(prev);
          next.add(hoverId);
          return next;
        });
        hoverExpandTimerRef.current = null;
        hoverExpandTargetRef.current = null;
      }, 700);
    },
    [childCountByParentId, clearHoverExpandTimer, expandedFolderIds, query, setExpandedFolderIds]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      clearHoverExpandTimer();
      setActiveId(null);

      if (!over) return;
      if (query.trim() !== '') return;

      const movedId = String(active.id);
      const overId = String(over.id);
      if (movedId === overId) return;

      const target = parseDropTarget(overId);
      if (!target) return;

      const { parentId, order, reindex } = computeTreeMove(movedId, target, entityById);
      const movedEntity = entityById[movedId];
      const currentOrder = movedEntity?.properties?.[ORDER_KEY];
      if (reindex.length === 0 && parentId === getParentId(movedEntity) && order === currentOrder) {
        return;
      }

      for (const r of reindex) {
        if (r.entityId === movedId) continue;
        onUpdatePage(r.entityId, { [ORDER_KEY]: r.order });
      }
      const patch: Record<string, unknown> = { [ORDER_KEY]: order };
      if (parentId !== getParentId(entityById[movedId])) {
        patch[PARENT_ID_KEY] = parentId;
      }
      onUpdatePage(movedId, patch);
    },
    [clearHoverExpandTimer, entityById, onUpdatePage, query]
  );

  const handleDragCancel = useCallback(
    (_event: DragCancelEvent) => {
      clearHoverExpandTimer();
      setActiveId(null);
    },
    [clearHoverExpandTimer]
  );

  useEffect(() => {
    return () => {
      clearHoverExpandTimer();
    };
  }, [clearHoverExpandTimer]);

  return {
    activeId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
    entityById,
  };
}
