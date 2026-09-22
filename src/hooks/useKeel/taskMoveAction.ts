import { moveTasks } from '../../api/tasks';
import type { MoveTasksResponse } from '../../types';
import type { CoreRefs, CoreSetters } from './actionsTypes';
import type { RefreshAfterConflict } from './modifyEntityPatchPump';

/**
 * Move tasks to another project (REQ-309).
 *
 * Unlike `removeEntityAction` this awaits the server instead of updating
 * optimistically: the dialog reports failures inline, and a successful move also
 * changes relations on the tasks left behind, which only a refresh can show.
 */
export async function moveTasksAction(args: {
  activeProjectId: string;
  destinationProjectId: string;
  taskIds: string[];
  setActiveProject: CoreSetters['setActiveProject'];
  entityEtagByIdRef: CoreRefs['entityEtagByIdRef'];
  pendingCreatedEntitiesRef: CoreRefs['pendingCreatedEntitiesRef'];
  refreshActiveProject: RefreshAfterConflict;
}): Promise<MoveTasksResponse> {
  const {
    activeProjectId,
    destinationProjectId,
    taskIds,
    setActiveProject,
    entityEtagByIdRef,
    pendingCreatedEntitiesRef,
    refreshActiveProject,
  } = args;

  const result = await moveTasks(activeProjectId, {
    destinationProjectId,
    taskIds,
  });

  const movedIds = new Set(result.moved.map((m) => m.id));
  for (const id of movedIds) {
    delete entityEtagByIdRef.current[id];
    pendingCreatedEntitiesRef.current.delete(id);
  }
  setActiveProject((prev) => {
    if (!prev) return prev;
    return { ...prev, entities: (prev.entities ?? []).filter((e) => !movedIds.has(e.id)) };
  });

  // Picks up the relations that were cut on the tasks that stayed behind.
  await refreshActiveProject({ bypassProjectRefreshBlock: true });

  return result;
}
