import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { fetchProjectState } from '../../api/projects';
import type { Entity, MoveTasksResponse, ProjectMeta } from '../../types';
import { useAppDialog } from '../dialogs';
import { TaskMoveDialog } from './TaskMoveDialog';
import { TaskMoveContext, type RequestTaskMove } from './taskMoveContext';

export type TaskMoveProviderProps = {
  activeProjectId: string;
  entities: Entity[];
  projects: ProjectMeta[];
  onMove: (destinationProjectId: string, taskIds: string[]) => Promise<MoveTasksResponse>;
  children: ReactNode;
};

export function TaskMoveProvider({
  activeProjectId,
  entities,
  projects,
  onMove,
  children,
}: TaskMoveProviderProps) {
  const navigate = useNavigate();
  const dialog = useAppDialog();
  const [roots, setRoots] = useState<Entity[] | null>(null);

  const requestTaskMove = useCallback<RequestTaskMove>((tasks) => {
    if (tasks.length === 0) return;
    setRoots(tasks);
  }, []);

  const handleMoved = useCallback(
    async (result: MoveTasksResponse) => {
      await openDestinationProject(result, navigate);
      // Keys change on a move, so always say what they became: that is what the
      // user will quote in commits, branches and links from here on.
      await dialog.alert({ title: 'Moved', message: describeMove(result) });
    },
    [dialog, navigate]
  );

  const value = useMemo(() => requestTaskMove, [requestTaskMove]);

  return (
    <TaskMoveContext.Provider value={value}>
      {children}
      {roots && (
        <TaskMoveDialog
          open
          onClose={() => setRoots(null)}
          sourceProjectId={activeProjectId}
          roots={roots}
          entities={entities}
          projects={projects}
          onMove={onMove}
          onMoved={handleMoved}
        />
      )}
    </TaskMoveContext.Provider>
  );
}

function describeMove(result: MoveTasksResponse): string {
  const keys = result.moved.map((m) => m.taskKey);
  const project = result.destinationProjectKey;
  if (result.moved.length === 1) {
    const [only] = result.moved;
    return `Moved ${only.previousTaskKey} to ${project} as ${only.taskKey}.`;
  }
  const range = keys.length > 2 ? `${keys[0]} … ${keys[keys.length - 1]}` : keys.join(', ');
  return `Moved ${result.moved.length} tasks to ${project} (${range}).`;
}

/**
 * Follow the tasks to the project they now live in.
 *
 * Deliberately stops at the task view rather than deep-linking to the entity:
 * the destination project's entities have not loaded yet at this point, and the
 * workspace router drops an entity id it cannot resolve.
 */
async function openDestinationProject(
  result: MoveTasksResponse,
  navigate: ReturnType<typeof useNavigate>
): Promise<void> {
  const projectPath = `/p/${encodeURIComponent(result.destinationProjectId)}`;
  try {
    const { project } = await fetchProjectState(result.destinationProjectId);
    const views = project.config.manifest.views;
    const taskView =
      views.find((v) => v.entityId === 'task' && (v.type === 'table' || v.type === 'board')) ??
      views.find((v) => v.id === project.config.manifest.defaultView);
    if (!taskView) {
      navigate(projectPath, { replace: false });
      return;
    }
    navigate(`${projectPath}/v/${encodeURIComponent(taskView.id)}`, { replace: false });
  } catch {
    navigate(projectPath, { replace: false });
  }
}
