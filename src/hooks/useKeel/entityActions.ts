import { createEntityApi, deleteEntityApi } from '../../api/entities';
import type { Entity } from '../../types';
import { createEntity } from '../../utils/storage';
import type { CoreRefs, CoreSetters, MutableRef } from './actionsTypes';
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
  pendingCreatedEntitiesRef: CoreRefs['pendingCreatedEntitiesRef'];
  activeProjectIdRef: MutableRef<string>;
}) {
  const {
    activeProjectId,
    entityId,
    properties,
    setActiveProject,
    entityEtagByIdRef,
    pendingCreatedEntitiesRef,
    activeProjectIdRef,
  } = args;
  const placeholder = createEntity(entityId, properties);
  pendingCreatedEntitiesRef.current.set(placeholder.id, {
    projectId: activeProjectId,
    entity: placeholder,
    status: 'creating',
  });
  setActiveProject((prev) => {
    if (!prev) return prev;
    return { ...prev, entities: [placeholder, ...(prev.entities ?? [])] };
  });

  createEntityApi(activeProjectId, placeholder.id, entityId, properties)
    .then(({ entity, etag }) => {
      const pending = pendingCreatedEntitiesRef.current.get(entity.id);
      if (!pending) return;
      pendingCreatedEntitiesRef.current.set(entity.id, {
        projectId: activeProjectId,
        entity,
        status: 'confirmed',
        etag,
        confirmedAt: Date.now(),
      });
      entityEtagByIdRef.current[entity.id] = etag;
      if (activeProjectIdRef.current !== activeProjectId) return;
      setActiveProject((prev) => {
        if (!prev || prev.id !== activeProjectId) return prev;
        const exists = (prev.entities ?? []).some((existing) => existing.id === entity.id);
        const entities = exists
          ? (prev.entities ?? []).map((existing) => (existing.id === entity.id ? entity : existing))
          : [entity, ...(prev.entities ?? [])];
        return { ...prev, entities };
      });
    })
    .catch((e) => {
      console.error('Failed to create entity:', e);
      pendingCreatedEntitiesRef.current.delete(placeholder.id);
      if (activeProjectIdRef.current !== activeProjectId) return;
      setActiveProject((prev) => {
        if (!prev || prev.id !== activeProjectId) return prev;
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
  pendingCreatedEntitiesRef: CoreRefs['pendingCreatedEntitiesRef'];
  refreshActiveProject: RefreshAfterConflict;
}) {
  const {
    activeProjectId,
    id,
    setActiveProject,
    entityEtagByIdRef,
    pendingCreatedEntitiesRef,
    refreshActiveProject,
  } = args;
  const etag = entityEtagByIdRef.current[id] ?? `"0"`;
  pendingCreatedEntitiesRef.current.delete(id);
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
