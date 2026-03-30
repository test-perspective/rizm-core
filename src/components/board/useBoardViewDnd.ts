import { useEffect, useMemo, useRef, useState } from 'react';
import type { Entity, ViewConfig } from '../../types';
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { findContainerId, getColumnDropId } from './boardDnd';
import { computeOrderForMove, ORDER_KEY, sortEntitiesForBoard } from './boardOrder';
import { extractTaskIds, insertDividersIntoItems, deriveDividersFromItems, isDividerId } from './boardDividers';

type UseBoardViewDndParams = {
  columns: string[];
  orderedColumns: string[];
  entities: Entity[];
  view: ViewConfig;
  onEntityUpdate: (entityId: string, patch: Record<string, any>) => void;
  onViewConfigUpdate?: (view: ViewConfig) => void;
};

export function useBoardViewDnd(params: UseBoardViewDndParams) {
  const { columns, orderedColumns, entities, view, onEntityUpdate, onViewConfigUpdate } = params;

  const entityById = useMemo(() => {
    const map: Record<string, Entity> = {};
    for (const e of entities) map[e.id] = e;
    return map;
  }, [entities]);

  const initialItemsByColumn = useMemo(() => {
    const byCol: Record<string, string[]> = {};
    const dividers = view.boardDividers ?? [];
    for (const col of columns) {
      const colEntities = entities
        .filter((e) => e.properties[view.groupBy!] === col)
        .sort(sortEntitiesForBoard);
      const taskIds = colEntities.map((e) => e.id);
      const normalizedDividers = dividers
        .filter((d) => d.columnId === col)
        .map((divider) => {
          if (!divider.afterId) return divider;
          if (taskIds.includes(divider.afterId)) return divider;
          const afterEntity = entityById[divider.afterId];
          const afterOrder = afterEntity?.properties?.[ORDER_KEY];
          if (afterOrder == null) return { ...divider, afterId: undefined };
          let fallbackId: string | undefined = undefined;
          for (const entity of colEntities) {
            const order = entity.properties?.[ORDER_KEY];
            if (order != null && order <= afterOrder) fallbackId = entity.id;
          }
          return { ...divider, afterId: fallbackId };
        });
      byCol[col] = insertDividersIntoItems(taskIds, normalizedDividers, col);
    }
    return byCol;
  }, [columns, entities, view.groupBy, view.boardDividers, entityById]);

  const [itemsByColumn, setItemsByColumn] = useState<Record<string, string[]>>(initialItemsByColumn);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const itemsByColumnRef = useRef<Record<string, string[]>>(initialItemsByColumn);
  const dragOriginColumnRef = useRef<string | null>(null);
  const isDividerDragInProgressRef = useRef(false);
  const dividerPrevTaskRef = useRef<Map<string, string | undefined>>(new Map());

  useEffect(() => {
    if (isDividerDragInProgressRef.current) return;
    setItemsByColumn(initialItemsByColumn);
    itemsByColumnRef.current = initialItemsByColumn;
  }, [initialItemsByColumn]);

  useEffect(() => {
    if (isDividerDragInProgressRef.current) {
      isDividerDragInProgressRef.current = false;
    } else {
      setItemsByColumn(initialItemsByColumn);
      itemsByColumnRef.current = initialItemsByColumn;
    }
  }, [view.boardDividers, initialItemsByColumn]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    if (orderedColumns.includes(id)) {
      setActiveColumnId(id);
      setActiveId(null);
      return;
    }
    setActiveId(id);
    setActiveColumnId(null);
    dragOriginColumnRef.current = findContainerId(id, itemsByColumnRef.current);
    if (isDividerId(id)) return;
    const originCol = dragOriginColumnRef.current;
    const mixedIds = originCol ? itemsByColumnRef.current[originCol] ?? [] : [];
    const prevTaskByDivider = new Map<string, string | undefined>();
    let lastTaskId: string | undefined = undefined;
    for (const mixedId of mixedIds) {
      if (isDividerId(mixedId)) {
        prevTaskByDivider.set(mixedId, lastTaskId);
      } else {
        lastTaskId = mixedId;
      }
    }
    dividerPrevTaskRef.current = prevTaskByDivider;
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeItemId = String(active.id);
    const overId = String(over.id);

    setItemsByColumn((prev) => {
      const activeCol = findContainerId(activeItemId, prev);
      const overCol = findContainerId(overId, prev);
      if (!activeCol || !overCol) return prev;

      if (activeCol === overCol) {
        const items = prev[activeCol];
        const oldIndex = items.indexOf(activeItemId);
        const newIndex =
          overId === getColumnDropId(activeCol) || overId === activeCol
            ? items.length - 1
            : items.indexOf(overId);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev;
        const next = { ...prev, [activeCol]: arrayMove(items, oldIndex, newIndex) };
        itemsByColumnRef.current = next;
        return next;
      }

      const activeItems = prev[activeCol];
      const overItems = prev[overCol];
      const activeIndex = activeItems.indexOf(activeItemId);
      if (activeIndex === -1) return prev;
      const nextActiveItems = activeItems.filter((id) => id !== activeItemId);
      const overIndex =
        overId === getColumnDropId(overCol) || overId === overCol ? overItems.length : overItems.indexOf(overId);
      const insertIndex = overIndex < 0 ? overItems.length : overIndex;
      const nextOverItems = [
        ...overItems.slice(0, insertIndex),
        activeItemId,
        ...overItems.slice(insertIndex),
      ];
      const next = { ...prev, [activeCol]: nextActiveItems, [overCol]: nextOverItems };
      itemsByColumnRef.current = next;
      return next;
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const activeId = String(active.id);
    const overId = over ? String(over.id) : null;

    if (activeColumnId && orderedColumns.includes(activeId)) {
      const overColumnId = (() => {
        if (!overId) return null;
        if (orderedColumns.includes(overId)) return overId;
        return findContainerId(overId, itemsByColumnRef.current);
      })();
      if (!overColumnId || !orderedColumns.includes(overColumnId)) {
        setActiveColumnId(null);
        return;
      }
      const oldIndex = orderedColumns.indexOf(activeId);
      const newIndex = orderedColumns.indexOf(overColumnId);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex && onViewConfigUpdate) {
        onViewConfigUpdate({ ...view, columnOrder: arrayMove(orderedColumns, oldIndex, newIndex) });
      }
      setActiveColumnId(null);
      return;
    }

    setActiveId(null);
    const latest = itemsByColumnRef.current;
    if (!overId) {
      setItemsByColumn(initialItemsByColumn);
      itemsByColumnRef.current = initialItemsByColumn;
      dragOriginColumnRef.current = null;
      return;
    }

    const activeCol = dragOriginColumnRef.current ?? findContainerId(activeId, latest);
    const overCol = findContainerId(overId, latest);
    if (!activeCol || !overCol) {
      setItemsByColumn(initialItemsByColumn);
      itemsByColumnRef.current = initialItemsByColumn;
      dragOriginColumnRef.current = null;
      return;
    }

    if (isDividerId(activeId)) {
      if (onViewConfigUpdate) {
        const allDividers = view.boardDividers ?? [];
        const updatedDividers = deriveDividersFromItems(latest[overCol] ?? [], allDividers, overCol);
        const otherDividers = allDividers.filter((d) => d.columnId !== overCol);
        const nextDividers = [...otherDividers, ...updatedDividers];
        isDividerDragInProgressRef.current = true;
        onViewConfigUpdate({ ...view, boardDividers: nextDividers.length > 0 ? nextDividers : undefined });
      }
      dragOriginColumnRef.current = null;
      return;
    }

    const finalDestIds = latest[overCol] ?? [];
    const taskIdsOnly = extractTaskIds(finalDestIds);
    const movedEntity = entityById[activeId];
    if (!movedEntity) return;
    const { order, reindex } = computeOrderForMove(taskIdsOnly, activeId, entityById);
    for (const r of reindex) {
      if (r.entityId === activeId) continue;
      onEntityUpdate(r.entityId, { [ORDER_KEY]: r.order });
    }
    const patch: Record<string, any> = { [ORDER_KEY]: order };
    if (activeCol !== overCol && view.groupBy) patch[view.groupBy] = overCol;
    onEntityUpdate(activeId, patch);

    if (onViewConfigUpdate && view.boardDividers && view.boardDividers.length > 0) {
      const prevTaskByDivider = dividerPrevTaskRef.current;
      const adjustedDividers = view.boardDividers.map((divider) => {
        if (activeCol !== overCol && divider.columnId === activeCol && divider.afterId === activeId) {
          return { ...divider, afterId: prevTaskByDivider.get(divider.id) };
        }
        return divider;
      });
      const updatedDividers: typeof adjustedDividers = [];
      const columnsToUpdate = new Set([activeCol, overCol]);
      for (const col of columnsToUpdate) {
        const mixed = latest[col] ?? [];
        const existingForCol = adjustedDividers.filter((d) => d.columnId === col);
        const missingDividerIds = existingForCol.filter((d) => !mixed.includes(d.id)).map((d) => d.id);
        const mixedWithMissing = missingDividerIds.length > 0 ? [...mixed, ...missingDividerIds] : mixed;
        updatedDividers.push(...deriveDividersFromItems(mixedWithMissing, adjustedDividers, col));
      }
      const otherDividers = adjustedDividers.filter((d) => !columnsToUpdate.has(d.columnId));
      const nextDividers = [...otherDividers, ...updatedDividers];
      onViewConfigUpdate({ ...view, boardDividers: nextDividers.length > 0 ? nextDividers : undefined });
    }

    dragOriginColumnRef.current = null;
  };

  const activeEntity = activeId && !isDividerId(activeId) ? entityById[activeId] : null;
  const activeDivider = activeId && isDividerId(activeId) ? (view.boardDividers ?? []).find((d) => d.id === activeId) : null;

  return {
    entityById,
    itemsByColumn,
    activeId,
    activeEntity,
    activeDivider,
    activeColumnId,
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  };
}
