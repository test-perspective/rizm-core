import { createEntityApi, deleteEntityApi } from '../../api/entities';
import type { Entity } from '../../types';
import { createEntity } from '../../utils/storage';
import type { CoreRefs, CoreSetters } from './actionsTypes';
import {
  enqueueModifyEntityPatch,
  type ModifyEntityPumpContext,
  type RefreshAfterConflict,
} from './modifyEntityPatchPump';

export function addEntityAction(args: {
  activeProjectId: string;
  entityId: string;
  properties: Record<string, unknown>;
  setActiveProject: CoreSetters['setActiveProject'];
  entityEtagByIdRef: CoreRefs['entityEtagByIdRef'];
}) {
  const { activeProjectId, entityId, properties, setActiveProject, entityEtagByIdRef } = args;
  const placeholder = createEntity(entityId, properties);
  setActiveProject((prev) => {
    if (!prev) return prev;
    return { ...prev, entities: [placeholder, ...(prev.entities ?? [])] };
  });

  createEntityApi(activeProjectId, placeholder.id, entityId, properties)
    .then(({ entity, etag }) => {
      entityEtagByIdRef.current[entity.id] = etag;
      setActiveProject((prev) => {
        if (!prev) return prev;
        return { ...prev, entities: (prev.entities ?? []).map((e) => (e.id === entity.id ? entity : e)) };
      });
    })
    .catch((e) => {
      console.error('Failed to create entity:', e);
      setActiveProject((prev) => {
        if (!prev) return prev;
        return { ...prev, entities: (prev.entities ?? []).filter((e) => e.id !== placeholder.id) };
      });
    });

  return placeholder;
}

export function modifyEntityAction(args: {
  activeProjectId: string;
  id: string;
  properties: Record<string, unknown>;
  setActiveProject: CoreSetters['setActiveProject'];
  entityEtagByIdRef: CoreRefs['entityEtagByIdRef'];
  refreshActiveProject: RefreshAfterConflict;
}): Promise<boolean> {
  const { activeProjectId, id, properties, setActiveProject, entityEtagByIdRef, refreshActiveProject } = args;
  setActiveProject((prev) => {
    if (!prev) return prev;
    const next = (prev.entities ?? []).map((entity) =>
      entity.id === id ? { ...entity, properties: { ...(entity.properties ?? {}), ...properties } } : entity
    );
    return { ...prev, entities: next };
  });

  const ctx: ModifyEntityPumpContext = {
    activeProjectId,
    setActiveProject,
    entityEtagByIdRef,
    refreshActiveProject,
  };

  return enqueueModifyEntityPatch(id, properties, ctx);
}

export function removeEntityAction(args: {
  activeProjectId: string;
  id: string;
  setActiveProject: CoreSetters['setActiveProject'];
  entityEtagByIdRef: CoreRefs['entityEtagByIdRef'];
  refreshActiveProject: RefreshAfterConflict;
}) {
  const { activeProjectId, id, setActiveProject, entityEtagByIdRef, refreshActiveProject } = args;
  const etag = entityEtagByIdRef.current[id] ?? `"0"`;
  setActiveProject((prev) => {
    if (!prev) return prev;
    return { ...prev, entities: (prev.entities ?? []).filter((e) => e.id !== id) };
  });
  deleteEntityApi(activeProjectId, id, etag)
    .then(() => {
      delete entityEtagByIdRef.current[id];
    })
    .catch(async (e) => {
      console.error('Failed to delete entity:', e);
      await refreshActiveProject({ bypassProjectRefreshBlock: true });
    });
}

export function applyServerEntityAction(args: {
  entity: Entity;
  etag: string;
  setActiveProject: CoreSetters['setActiveProject'];
  entityEtagByIdRef: CoreRefs['entityEtagByIdRef'];
}) {
  const { entity, etag, setActiveProject, entityEtagByIdRef } = args;
  entityEtagByIdRef.current[entity.id] = etag;
  setActiveProject((prev) => {
    if (!prev) return prev;
    const exists = (prev.entities ?? []).some((e) => e.id === entity.id);
    const nextEntities = exists
      ? (prev.entities ?? []).map((e) => (e.id === entity.id ? entity : e))
      : [entity, ...(prev.entities ?? [])];
    return { ...prev, entities: nextEntities };
  });
}
