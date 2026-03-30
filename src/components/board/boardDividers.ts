import type { BoardDivider } from '../../types';

export const DIVIDER_PREFIX = 'divider::';

export const isDividerId = (id: string): boolean => {
  return id.startsWith(DIVIDER_PREFIX);
};

/**
 * Insert dividers into a task ID array to build a mixed list (task IDs + divider IDs).
 * Dividers are placed after the task specified by `afterId`.
 * If `afterId` is omitted, the divider goes at the head.
 * Multiple dividers with the same `afterId` are ordered by ascending `sort`.
 */
export const insertDividersIntoItems = (
  taskIds: string[],
  dividers: BoardDivider[],
  columnId: string
): string[] => {
  // Filter dividers for this column
  const columnDividers = dividers.filter((d) => d.columnId === columnId);
  if (columnDividers.length === 0) return taskIds;

  // Group by afterId and sort by sort order
  const byAfterId = new Map<string | undefined, BoardDivider[]>();
  const danglingDividers: BoardDivider[] = [];
  for (const d of columnDividers) {
    const key = d.afterId ?? undefined;
    if (key === undefined || taskIds.includes(key)) {
      if (!byAfterId.has(key)) {
        byAfterId.set(key, []);
      }
      byAfterId.get(key)!.push(d);
    } else {
      danglingDividers.push(d);
    }
  }

  // Sort within each group by sort (treat missing sort as 0)
  for (const dividers of byAfterId.values()) {
    dividers.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  }

  // Build mixed list from task IDs
  const result: string[] = [];

  // Head dividers (afterId is undefined)
  const headDividers = byAfterId.get(undefined) ?? [];
  for (const d of headDividers) {
    result.push(d.id);
  }

  // After each task, insert dividers anchored to that task
  for (const taskId of taskIds) {
    result.push(taskId);
    const afterDividers = byAfterId.get(taskId) ?? [];
    for (const d of afterDividers) {
      result.push(d.id);
    }
  }

  // Append dividers whose afterId is not a task in this column (preserve them at the end)
  if (danglingDividers.length > 0) {
    for (const d of danglingDividers) {
      result.push(d.id);
    }
  }

  return result;
};

/**
 * Return only task IDs from a mixed list (task IDs + divider IDs).
 */
export const extractTaskIds = (mixedIds: string[]): string[] => {
  return mixedIds.filter((id) => !isDividerId(id));
};

/**
 * Return only divider IDs from a mixed list (task IDs + divider IDs).
 */
export const extractDividerIds = (mixedIds: string[]): string[] => {
  return mixedIds.filter((id) => isDividerId(id));
};

/**
 * Recompute each divider's position (afterId, sort) from a mixed list (task IDs + divider IDs).
 * Use after task moves to refresh divider anchor positions.
 */
export const deriveDividersFromItems = (
  mixedIds: string[],
  existingDividers: BoardDivider[],
  columnId: string
): BoardDivider[] => {
  const result: BoardDivider[] = [];
  const taskIds = extractTaskIds(mixedIds);
  const seenDividerIds = new Set<string>();
  // Map existing dividers by ID
  const existingById = new Map<string, BoardDivider>();
  for (const d of existingDividers) {
    if (d.columnId === columnId) {
      existingById.set(d.id, d);
    }
  }

  // Group by afterId to compute sort
  const byAfterId = new Map<string | undefined, BoardDivider[]>();
  for (let i = 0; i < mixedIds.length; i++) {
    const id = mixedIds[i];
    if (!isDividerId(id)) continue;

    const existing = existingById.get(id);
    if (!existing) {
      continue; // Skip unknown divider IDs (unexpected but safe)
    }
    seenDividerIds.add(id);

    // Find the task ID immediately before this divider (walk backward)
    let afterId: string | undefined = undefined;
    for (let j = i - 1; j >= 0; j--) {
      const prevId = mixedIds[j];
      if (!isDividerId(prevId) && taskIds.includes(prevId)) {
        afterId = prevId;
        break;
      }
    }

    const updated: BoardDivider = {
      ...existing,
      columnId,
      afterId,
    };

    if (!byAfterId.has(afterId)) {
      byAfterId.set(afterId, []);
    }
    byAfterId.get(afterId)!.push(updated);
  }

  // Assign sort by display order within each group
  for (const dividers of byAfterId.values()) {
    for (let i = 0; i < dividers.length; i++) {
      dividers[i].sort = i;
    }
    result.push(...dividers);
  }
  return result;
};
