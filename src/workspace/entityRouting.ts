import type { NavigateFunction } from 'react-router-dom';

import { fetchProjectState } from '../api/projects';
import type { ProjectManifest } from '../types';
import { setLastWikiPageForProjectView } from './storage';

/** Kinds of entity that own a dedicated view type in a project manifest. */
export type WorkspaceEntityKind = 'task' | 'page';

/** The entity is not in the project it was looked for in - it was moved or deleted. */
export class EntityNotInProjectError extends Error {
  constructor(
    readonly entityPk: string,
    readonly projectId: string
  ) {
    super(`Entity ${entityPk} is not in project ${projectId}`);
    this.name = 'EntityNotInProjectError';
  }
}

export function buildWorkspacePath(p: { projectId: string; viewId: string; entityId?: string | null }): string {
  const project = encodeURIComponent(p.projectId);
  const view = encodeURIComponent(p.viewId);
  const base = `/p/${project}/v/${view}`;
  if (p.entityId) return `${base}/e/${encodeURIComponent(p.entityId)}`;
  return base;
}

export function resolveViewIdForEntityKind(manifest: ProjectManifest, kind: WorkspaceEntityKind) {
  if (kind === 'task') {
    const board = manifest.views.find((v) => v.type === 'board' && v.entityId === 'task');
    if (board) return board.id;
  }
  if (kind === 'page') {
    const wiki = manifest.views.find((v) => v.type === 'wiki' && v.entityId === 'wikiPage');
    if (wiki) return wiki.id;
  }
  return manifest.defaultView || manifest.views[0]?.id || '';
}

/**
 * Open a task or wiki page, loading the owning project's manifest first when the
 * entity is in another project (its views decide where the entity is shown).
 * Throws when the project cannot be loaded or has no usable view.
 */
export async function navigateToWorkspaceEntity(args: {
  kind: WorkspaceEntityKind;
  projectId: string;
  entityPk: string;
  activeProjectId?: string;
  activeManifest?: ProjectManifest | null;
  navigate: NavigateFunction;
  navigateState?: unknown;
  /**
   * Throw EntityNotInProjectError instead of navigating when the loaded project does not
   * hold the entity. Callers whose projectId may be stale (activity logs record the project
   * an entity was in at the time) want this: the router silently drops an entity id it
   * cannot resolve, which otherwise lands the user on an unrelated entity.
   */
  verifyEntityExists?: boolean;
}): Promise<void> {
  const { kind, projectId, entityPk, activeProjectId, activeManifest, navigate, navigateState } = args;

  let manifest = activeManifest ?? null;
  if (!manifest || projectId !== activeProjectId) {
    const { project } = await fetchProjectState(projectId);
    manifest = project.config.manifest;
    if (args.verifyEntityExists && !project.entities.some((e) => e.id === entityPk)) {
      throw new EntityNotInProjectError(entityPk, projectId);
    }
  }
  if (!manifest) throw new Error(`No manifest for project ${projectId}`);

  const viewId = resolveViewIdForEntityKind(manifest, kind);
  if (!viewId) throw new Error(`No view for ${kind} in project ${projectId}`);

  if (kind === 'page') {
    // Must run before navigate, otherwise useWorkspaceRouting redirects to the last page it remembers.
    setLastWikiPageForProjectView(projectId, viewId, entityPk);
  }
  navigate(buildWorkspacePath({ projectId, viewId, entityId: entityPk }), {
    replace: false,
    ...(navigateState === undefined ? {} : { state: navigateState }),
  });
}
