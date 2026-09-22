import type { DetachedRelation, Entity } from '../../types';

/** Relation properties that store task keys. Mirrors the backend constants. */
const PARENT_PROP = 'parentTaskKey';
const ARRAY_RELATION_PROPS = ['blockedBy', 'link'] as const;

const TASK_ENTITY_IDS = new Set(['task', 'item']);

export function isTaskEntity(entity: Entity): boolean {
  return TASK_ENTITY_IDS.has(entity.entityId);
}

export function taskKeyOf(entity: Entity): string {
  const raw = entity.properties?.taskKey;
  return typeof raw === 'string' ? raw.trim() : '';
}

export function taskTitleOf(entity: Entity): string {
  const raw = entity.properties?.title;
  return typeof raw === 'string' && raw.trim() ? raw : 'Untitled';
}

function readKeyList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  }
  if (typeof value === 'string' && value.trim() !== '') return [value];
  return [];
}

/** The parent the subtree walk follows. The link input can store more than one. */
function parentKeyOf(entity: Entity): string | null {
  return readKeyList(entity.properties?.[PARENT_PROP])[0] ?? null;
}

export type TaskMoveSet = {
  /** Ids the user picked, in the order they picked them. */
  rootIds: string[];
  /** Subtask ids pulled in because their parent moves. */
  descendantIds: string[];
  /** Roots followed by descendants, deduplicated. */
  ids: string[];
};

/**
 * Everything a move of `rootIds` would carry along.
 *
 * Mirrors the server's walk so the dialog can show the real scope before the
 * request goes out. A parent cycle in broken data terminates because a task is
 * only expanded the first time it is seen.
 */
export function collectTaskMoveSet(rootIds: string[], entities: Entity[]): TaskMoveSet {
  const tasks = entities.filter(isTaskEntity);
  const byId = new Map(tasks.map((e) => [e.id, e]));
  const childrenByParentKey = new Map<string, Entity[]>();
  for (const entity of tasks) {
    const parent = parentKeyOf(entity);
    if (!parent) continue;
    const bucket = childrenByParentKey.get(parent);
    if (bucket) bucket.push(entity);
    else childrenByParentKey.set(parent, [entity]);
  }

  const seen = new Set<string>();
  const roots: string[] = [];
  const descendants: string[] = [];

  for (const rootId of rootIds) {
    const root = byId.get(rootId);
    if (!root || seen.has(rootId)) continue;
    seen.add(rootId);
    roots.push(rootId);

    const queue = [...(childrenByParentKey.get(taskKeyOf(root)) ?? [])];
    while (queue.length > 0) {
      const current = queue.shift() as Entity;
      if (seen.has(current.id)) continue;
      seen.add(current.id);
      descendants.push(current.id);
      queue.push(...(childrenByParentKey.get(taskKeyOf(current)) ?? []));
    }
  }

  // `seen` is shared across roots, so a task picked alongside one of its
  // ancestors is counted once, as a descendant.
  return { rootIds: roots, descendantIds: descendants, ids: [...roots, ...descendants] };
}

/**
 * References that will be dropped because the other side stays behind.
 *
 * Reported for both directions, matching what the server actually does.
 */
export function planDetachedRelations(moveIds: string[], entities: Entity[]): DetachedRelation[] {
  const moving = new Set(moveIds);
  const tasks = entities.filter(isTaskEntity);
  const movingKeys = new Set(
    tasks.filter((e) => moving.has(e.id)).map(taskKeyOf).filter(Boolean)
  );
  const stayingKeys = new Set(
    tasks.filter((e) => !moving.has(e.id)).map(taskKeyOf).filter(Boolean)
  );

  const out: DetachedRelation[] = [];
  for (const entity of tasks) {
    const isMoving = moving.has(entity.id);
    const cutKeys = isMoving ? stayingKeys : movingKeys;
    const taskKey = taskKeyOf(entity);
    if (!taskKey) continue;

    // Every stored parent key is checked, not just the one the walk follows.
    const cutParents = readKeyList(entity.properties?.[PARENT_PROP]).filter((k) => cutKeys.has(k));
    if (cutParents.length > 0) {
      out.push({ taskKey, projectId: '', property: PARENT_PROP, removedKeys: cutParents });
    }
    for (const property of ARRAY_RELATION_PROPS) {
      const removedKeys = readKeyList(entity.properties?.[property]).filter((k) => cutKeys.has(k));
      if (removedKeys.length === 0) continue;
      out.push({ taskKey, projectId: '', property, removedKeys });
    }
  }
  return out;
}

/** One-line summary of what the move covers, for the dialog. */
export function formatMoveSummary(moveSet: TaskMoveSet): string {
  const rootCount = moveSet.rootIds.length;
  const subtaskCount = moveSet.descendantIds.length;
  const rootLabel = `${rootCount} ${rootCount === 1 ? 'task' : 'tasks'}`;
  if (subtaskCount === 0) return `Moving ${rootLabel}.`;
  const subtaskLabel = `${subtaskCount} ${subtaskCount === 1 ? 'subtask' : 'subtasks'}`;
  return `Moving ${rootLabel} and ${subtaskLabel} (${moveSet.ids.length} total).`;
}
