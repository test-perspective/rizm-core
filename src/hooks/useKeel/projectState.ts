import type { Entity, Project } from '../../types';
import type { MutableRef, PendingCreatedEntity } from './actionsTypes';

type ApplyProjectStateArgs = {
  project: Project;
  manifestEtag: string;
  projectId: string;
  setActiveProject: (next: Project | null) => void;
  setActiveProjectId: (next: string) => void;
  manifestEtagRef: MutableRef<string>;
  entityEtagByIdRef: MutableRef<Record<string, string>>;
  pendingCreatedEntitiesRef: MutableRef<Map<string, PendingCreatedEntity>>;
};

const CONFIRMED_ENTITY_GRACE_MS = 30_000;

export function buildEntityEtags(project: Project): Record<string, string> {
  const etags: Record<string, string> = {};
  for (const e of project.entities ?? []) {
    etags[e.id] = `"${e.updatedAt}"`;
  }
  return etags;
}

export function mergePendingCreatedEntities(
  project: Project,
  projectId: string,
  pendingCreatedEntities: Map<string, PendingCreatedEntity>,
  now = Date.now()
): {
  project: Project;
  pendingCreatedEntities: Map<string, PendingCreatedEntity>;
  etagOverrides: Record<string, string>;
} {
  const nextPending = new Map(pendingCreatedEntities);
  const fetchedEntityIds = new Set((project.entities ?? []).map((entity) => entity.id));
  const pendingEntities: Entity[] = [];
  const etagOverrides: Record<string, string> = {};

  for (const [id, pending] of pendingCreatedEntities) {
    if (pending.projectId !== projectId) continue;

    if (fetchedEntityIds.has(id)) {
      nextPending.delete(id);
      continue;
    }

    const confirmedExpired =
      pending.status === 'confirmed' &&
      pending.confirmedAt !== undefined &&
      now - pending.confirmedAt > CONFIRMED_ENTITY_GRACE_MS;
    if (confirmedExpired) {
      nextPending.delete(id);
      continue;
    }

    pendingEntities.unshift(pending.entity);
    if (pending.etag) etagOverrides[id] = pending.etag;
  }

  return {
    project: pendingEntities.length > 0
      ? { ...project, entities: [...pendingEntities, ...(project.entities ?? [])] }
      : project,
    pendingCreatedEntities: nextPending,
    etagOverrides,
  };
}

export function applyProjectState({
  project,
  manifestEtag,
  projectId,
  setActiveProject,
  setActiveProjectId,
  manifestEtagRef,
  entityEtagByIdRef,
  pendingCreatedEntitiesRef,
}: ApplyProjectStateArgs) {
  const merged = mergePendingCreatedEntities(project, projectId, pendingCreatedEntitiesRef.current);
  pendingCreatedEntitiesRef.current = merged.pendingCreatedEntities;
  setActiveProject(merged.project);
  setActiveProjectId(projectId);
  manifestEtagRef.current = manifestEtag || '0';
  entityEtagByIdRef.current = {
    ...buildEntityEtags(project),
    ...merged.etagOverrides,
  };
}

