import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';

import { ProjectSelect } from '../common/ProjectSelect';
import type { Entity, MoveTasksResponse, ProjectMeta } from '../../types';
import {
  collectTaskMoveSet,
  formatMoveSummary,
  planDetachedRelations,
  taskKeyOf,
  taskTitleOf,
} from './taskMoveHelpers';

/** How many of the moving tasks to spell out before collapsing the rest. */
const PREVIEW_LIMIT = 10;

export type TaskMoveDialogProps = {
  open: boolean;
  onClose: () => void;
  sourceProjectId: string;
  /** Tasks the user picked. Their subtasks are added automatically. */
  roots: Entity[];
  /** All entities in the source project, used to resolve subtasks and relations. */
  entities: Entity[];
  projects: ProjectMeta[];
  onMove: (destinationProjectId: string, taskIds: string[]) => Promise<MoveTasksResponse>;
  onMoved: (result: MoveTasksResponse) => void | Promise<void>;
};

export function TaskMoveDialog({
  open,
  onClose,
  sourceProjectId,
  roots,
  entities,
  projects,
  onMove,
  onMoved,
}: TaskMoveDialogProps) {
  const [destProjectId, setDestProjectId] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDestProjectId('');
    setSaveError(null);
  }, [open]);

  const rootIds = useMemo(() => roots.map((r) => r.id), [roots]);
  const moveSet = useMemo(() => collectTaskMoveSet(rootIds, entities), [rootIds, entities]);
  const detached = useMemo(
    () => planDetachedRelations(moveSet.ids, entities),
    [moveSet.ids, entities]
  );

  const movingTasks = useMemo(() => {
    const byId = new Map(entities.map((e) => [e.id, e]));
    return moveSet.ids.map((id) => byId.get(id)).filter((e): e is Entity => Boolean(e));
  }, [moveSet.ids, entities]);

  const destinations = useMemo(
    () => projects.filter((p) => p.id !== sourceProjectId),
    [projects, sourceProjectId]
  );

  const handleMove = useCallback(async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const result = await onMove(destProjectId, moveSet.ids);
      // Close first: onMoved navigates or raises a completion notice, and this
      // dialog would otherwise sit behind it showing an emptied-out move set.
      onClose();
      await onMoved(result);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Move failed');
    } finally {
      setSaving(false);
    }
  }, [destProjectId, moveSet.ids, onMove, onMoved, onClose]);

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>Move to project</DialogTitle>
      <DialogContent className="space-y-4 pt-2">
        <p className="text-sm text-zinc-300" data-testid="task-move-summary">
          {formatMoveSummary(moveSet)}
        </p>
        {saveError && (
          <p className="text-sm text-red-400" data-testid="task-move-error">
            {saveError}
          </p>
        )}

        <ProjectSelect
          projects={destinations}
          value={destProjectId}
          onChange={setDestProjectId}
          label="Destination project"
          ariaLabel="Destination project"
          disabled={saving}
          testId="task-move-project-select"
        />

        <ul className="m-0 list-none p-0 text-sm text-zinc-400" data-testid="task-move-task-list">
          {movingTasks.slice(0, PREVIEW_LIMIT).map((task) => (
            <li key={task.id} className="truncate">
              <span className="font-mono text-zinc-300">{taskKeyOf(task) || task.id}</span>{' '}
              {taskTitleOf(task)}
            </li>
          ))}
          {movingTasks.length > PREVIEW_LIMIT && (
            <li className="text-zinc-500">+{movingTasks.length - PREVIEW_LIMIT} more</li>
          )}
        </ul>

        <p className="text-xs text-zinc-500">
          Task keys are re-issued in the destination project. The old keys keep resolving.
        </p>

        {detached.length > 0 && (
          <div className="text-sm text-amber-400" data-testid="task-move-detached">
            <p>These references cross projects and will be removed:</p>
            <ul className="m-0 list-none p-0">
              {detached.map((d) => (
                <li key={`${d.taskKey}-${d.property}`} className="truncate">
                  <span className="font-mono">{d.taskKey}</span> {d.property} →{' '}
                  <span className="font-mono">{d.removedKeys.join(', ')}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleMove()}
          disabled={saving || !destProjectId || moveSet.ids.length === 0}
          data-testid="task-move-confirm"
        >
          Move
        </Button>
      </DialogActions>
    </Dialog>
  );
}
