import { ApiError } from '../../auth/api';
import { createEntityApi, deleteEntityApi, patchEntityApi } from '../../api/entities';
import { putManifestApi, type PutManifestOptions } from '../../api/manifest';
import type { Entity, Project, ProjectManifest, ViewConfig } from '../../types';
import { reconcileManifestWithData } from '../../utils/manifestReconcile';
import { createEntity, getDefaultManifest } from '../../utils/storage';
import type { CoreRefs, CoreSetters } from './actionsTypes';
import { enqueueManifestPut } from './manifestPutQueue';
import { putViewConfigManifestWith412Retries } from './putViewConfigManifest';

type RefreshAfterConflict = (options?: { bypassProjectRefreshBlock?: boolean }) => Promise<unknown>;

type ModifyEntityPending = {
  properties: Record<string, unknown>;
  resolve: (ok: boolean) => void;
};

type ModifyEntityPumpContext = {
  activeProjectId: string;
  setActiveProject: CoreSetters['setActiveProject'];
  entityEtagByIdRef: CoreRefs['entityEtagByIdRef'];
  refreshActiveProject: RefreshAfterConflict;
};

const modifyEntityQueues = new Map<string, ModifyEntityPending[]>();
const modifyEntityPumpRunning = new Map<string, boolean>();

/** HTTP statuses that often mean "try again soon" (pool pressure, gateway, upstream). */
function isTransientEntityPatchStatus(status: number): boolean {
  return status === 503 || status === 502 || status === 504;
}

const ENTITY_PATCH_TRANSIENT_BACKOFF_MS = [60, 180, 400];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runModifyEntityPatch(
  entityId: string,
  properties: Record<string, unknown>,
  ctx: ModifyEntityPumpContext
): Promise<boolean> {
  const { activeProjectId, setActiveProject, entityEtagByIdRef, refreshActiveProject } = ctx;

  const logPatchFailure = (message: string, error: unknown) => {
    if (error instanceof ApiError) {
      console.error(
        `[entity.patch] ${message} projectId=${activeProjectId} entityId=${entityId} status=${error.status}`,
        error
      );
      return;
    }
    console.error(`[entity.patch] ${message} projectId=${activeProjectId} entityId=${entityId}`, error);
  };

  const sendPatchOnce = async () => {
    const etag = entityEtagByIdRef.current[entityId] ?? `"0"`;
    return await patchEntityApi(activeProjectId, entityId, properties, etag);
  };

  const sendPatchWithTransientRetries = async () => {
    let lastError: unknown;
    const maxAttempts = 1 + ENTITY_PATCH_TRANSIENT_BACKOFF_MS.length;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await sendPatchOnce();
      } catch (e) {
        lastError = e;
        const canRetry =
          e instanceof ApiError &&
          isTransientEntityPatchStatus(e.status) &&
          attempt < ENTITY_PATCH_TRANSIENT_BACKOFF_MS.length;
        if (canRetry) {
          await delay(ENTITY_PATCH_TRANSIENT_BACKOFF_MS[attempt]!);
          continue;
        }
        throw e;
      }
    }
    throw lastError;
  };

  try {
    const { entity, etag: nextEtag } = await sendPatchWithTransientRetries();
    entityEtagByIdRef.current[entityId] = nextEtag;
    setActiveProject((prev) => {
      if (!prev) return prev;
      return { ...prev, entities: (prev.entities ?? []).map((e) => (e.id === entityId ? entity : e)) };
    });
    return true;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 412 || e.status === 409)) {
      try {
        await refreshActiveProject({ bypassProjectRefreshBlock: true });
      } catch (refreshError) {
        logPatchFailure('Failed to refresh project before retry', refreshError);
        return false;
      }
      try {
        const { entity, etag: nextEtag } = await sendPatchWithTransientRetries();
        entityEtagByIdRef.current[entityId] = nextEtag;
        setActiveProject((prev) => {
          if (!prev) return prev;
          return { ...prev, entities: (prev.entities ?? []).map((e) => (e.id === entityId ? entity : e)) };
        });
        return true;
      } catch (retryError) {
        logPatchFailure('Failed to patch entity after refresh', retryError);
        try {
          await refreshActiveProject({ bypassProjectRefreshBlock: true });
        } catch (refreshError) {
          logPatchFailure('Failed to refresh project after retry failure', refreshError);
        }
        return false;
      }
    }
    if (e instanceof ApiError && (e.status === 404 || e.status === 410)) {
      logPatchFailure('Entity not found on server (skipping full project refresh)', e);
      return false;
    }
    logPatchFailure('Failed to patch entity', e);
    try {
      await refreshActiveProject({ bypassProjectRefreshBlock: true });
    } catch (refreshError) {
      logPatchFailure('Failed to refresh project after patch failure', refreshError);
    }
    return false;
  }
}

async function pumpModifyEntityQueue(entityId: string, ctx: ModifyEntityPumpContext): Promise<void> {
  if (modifyEntityPumpRunning.get(entityId)) return;
  modifyEntityPumpRunning.set(entityId, true);
  try {
    for (;;) {
      const queue = modifyEntityQueues.get(entityId);
      if (!queue || queue.length === 0) break;
      const batch = queue.splice(0, queue.length);
      const merged: Record<string, unknown> = {};
      for (const item of batch) {
        Object.assign(merged, item.properties);
      }
      const ok = await runModifyEntityPatch(entityId, merged, ctx);
      for (const item of batch) {
        item.resolve(ok);
      }
    }
  } finally {
    modifyEntityPumpRunning.set(entityId, false);
    const remaining = modifyEntityQueues.get(entityId);
    if (remaining && remaining.length > 0) {
      void pumpModifyEntityQueue(entityId, ctx);
    }
  }
}

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

  return new Promise((resolve) => {
    const queue = modifyEntityQueues.get(id) ?? [];
    queue.push({ properties, resolve });
    modifyEntityQueues.set(id, queue);
    void pumpModifyEntityQueue(id, ctx);
  });
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

export function updateSchemaAction(args: {
  activeProjectId: string;
  newManifest: ProjectManifest;
  options?: { removeEntityProperty?: { entityId: string; propName: string } };
  setActiveProject: CoreSetters['setActiveProject'];
  manifestEtagRef: CoreRefs['manifestEtagRef'];
  refreshActiveProject: RefreshAfterConflict;
}) {
  const { activeProjectId, newManifest, options, setActiveProject, manifestEtagRef, refreshActiveProject } = args;
  const removal = options?.removeEntityProperty ?? null;
  setActiveProject((prev) => {
    if (!prev) return prev;
    let nextEntities: Entity[] = prev.entities ?? [];
    if (removal) {
      nextEntities = nextEntities.map((e) => {
        if (e.entityId !== removal.entityId) return e;
        if (!(removal.propName in e.properties)) return e;
        const next = { ...e.properties };
        delete next[removal.propName];
        return { ...e, updatedAt: Date.now(), properties: next };
      });
    }
    return {
      ...prev,
      entities: nextEntities,
      config: { ...prev.config, manifest: newManifest },
    };
  });

  enqueueManifestPut(activeProjectId, async () => {
    try {
      const next = await putManifestApi(activeProjectId, newManifest, manifestEtagRef.current, { source: 'silent' });
      manifestEtagRef.current = next.trim().replace(/^"|"$/g, '').trim();
    } catch (e) {
      console.error('Failed to save manifest:', e);
      await refreshActiveProject({ bypassProjectRefreshBlock: true });
    }
  });
}

export function updateManifestAction(args: {
  activeProject: Project | null;
  activeProjectId: string;
  newManifest: ProjectManifest;
  options?: PutManifestOptions;
  setActiveProject: CoreSetters['setActiveProject'];
  manifestEtagRef: CoreRefs['manifestEtagRef'];
  refreshActiveProject: RefreshAfterConflict;
}) {
  const { activeProject, activeProjectId, newManifest, options, setActiveProject, manifestEtagRef, refreshActiveProject } = args;
  const reconciled = (() => {
    const p = activeProject;
    if (!p) return newManifest;
    const old = p.config.manifest;
    return reconcileManifestWithData(old, newManifest, p.entities ?? []).manifest;
  })();

  setActiveProject((p) => {
    if (!p) return p;
    const old = p.config.manifest;
    const { manifest } = reconcileManifestWithData(old, newManifest, p.entities ?? []);
    return { ...p, updatedAt: Date.now(), config: { ...p.config, manifest } };
  });

  const putOptions: PutManifestOptions = options?.source ? options : { source: 'silent', ...options };
  enqueueManifestPut(activeProjectId, async () => {
    try {
      const next = await putManifestApi(activeProjectId, reconciled, manifestEtagRef.current, putOptions);
      manifestEtagRef.current = next.trim().replace(/^"|"$/g, '').trim();
    } catch (e) {
      console.error('Failed to save manifest:', e);
      await refreshActiveProject({ bypassProjectRefreshBlock: true });
    }
  });
}

export function transformManifestAction(args: {
  activeProjectManifest?: ProjectManifest;
  activeProjectId: string;
  transformation: Partial<ProjectManifest>;
  setActiveProject: CoreSetters['setActiveProject'];
  manifestEtagRef: CoreRefs['manifestEtagRef'];
  refreshActiveProject: RefreshAfterConflict;
}) {
  const { activeProjectManifest, activeProjectId, transformation, setActiveProject, manifestEtagRef, refreshActiveProject } = args;
  const base = activeProjectManifest ?? getDefaultManifest();
  const nextManifest = { ...base, ...transformation };
  setActiveProject((p) => {
    if (!p) return p;
    return { ...p, updatedAt: Date.now(), config: { ...p.config, manifest: nextManifest } };
  });
  enqueueManifestPut(activeProjectId, async () => {
    try {
      const next = await putManifestApi(activeProjectId, nextManifest, manifestEtagRef.current, { source: 'silent' });
      manifestEtagRef.current = next.trim().replace(/^"|"$/g, '').trim();
    } catch (e) {
      console.error('Failed to save manifest:', e);
      await refreshActiveProject({ bypassProjectRefreshBlock: true });
    }
  });
}

export function updateViewConfigAction(args: {
  activeProject: Project | null;
  activeProjectId: string;
  viewId: string;
  updater: (view: ViewConfig) => ViewConfig;
  setActiveProject: CoreSetters['setActiveProject'];
  manifestEtagRef: CoreRefs['manifestEtagRef'];
  refreshActiveProject: RefreshAfterConflict;
}) {
  const { activeProject, activeProjectId, viewId, updater, setActiveProject, manifestEtagRef, refreshActiveProject } = args;
  const currentManifest = activeProject?.config.manifest;
  if (!currentManifest) return;
  const viewIndex = currentManifest.views.findIndex((v) => v.id === viewId);
  if (viewIndex === -1) return;

  const updatedView = updater(currentManifest.views[viewIndex]);
  const nextViews = [...currentManifest.views];
  nextViews[viewIndex] = updatedView;
  const nextManifest: ProjectManifest = { ...currentManifest, views: nextViews };

  setActiveProject((p) => {
    if (!p) return p;
    return { ...p, updatedAt: Date.now(), config: { ...p.config, manifest: nextManifest } };
  });

  enqueueManifestPut(activeProjectId, async () => {
    try {
      await putViewConfigManifestWith412Retries({
        activeProjectId,
        viewId,
        updater,
        initialManifest: nextManifest,
        manifestEtagRef,
        setActiveProject,
      });
    } catch (e) {
      console.error('Failed to save view config:', e);
      await refreshActiveProject({ bypassProjectRefreshBlock: true });
    }
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
