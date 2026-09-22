import { createContext, useContext } from 'react';
import type { Entity } from '../../types';

export type RequestTaskMove = (tasks: Entity[]) => void;

/**
 * The move dialog is reachable from the detail panel, the table context menu and
 * board cards. Threading it through the workspace props (already very wide) would
 * cost more than it is worth, so it is exposed the same way as `useAppDialog`.
 *
 * Kept apart from the provider so consumers do not pull the router in with it.
 */
export const TaskMoveContext = createContext<RequestTaskMove | null>(null);

/** Null outside a `TaskMoveProvider`; callers hide their entry point then. */
export function useTaskMove(): RequestTaskMove | null {
  return useContext(TaskMoveContext);
}
