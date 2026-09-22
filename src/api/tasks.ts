import { apiJson } from '../auth/api';
import type { MoveTasksRequest, MoveTasksResponse, TaskLookupResponse } from '../types';

/** Move tasks (and their subtasks) to another project. REQ-309. */
export async function moveTasks(
  sourceProjectId: string,
  body: MoveTasksRequest
): Promise<MoveTasksResponse> {
  return await apiJson<MoveTasksResponse>(
    `/api/projects/${encodeURIComponent(sourceProjectId)}/tasks/move`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

/**
 * Look a task up by key across projects. Keys a task held before a move still
 * resolve, with `resolvedVia: 'alias'`.
 */
export async function fetchTaskByKey(taskKey: string): Promise<TaskLookupResponse> {
  return await apiJson<TaskLookupResponse>(`/api/tasks/${encodeURIComponent(taskKey)}`);
}
