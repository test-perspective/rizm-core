import { ApiError } from '../../auth/api';
import { getEntityApi, patchEntityApi } from '../../api/entities';
import type { Entity } from '../../types';
import type { CoreRefs, CoreSetters } from './actionsTypes';

export type RefreshAfterConflict = (options?: { bypassProjectRefreshBlock?: boolean }) => Promise<unknown>;

export type ModifyEntityPending = {
  properties: Record<string, unknown>;
  resolve: (ok: boolean) => void;
};

export type ModifyEntityPumpContext = {
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

  const applySuccessfulPatch = (entity: Entity, nextEtag: string) => {
    entityEtagByIdRef.current[entityId] = nextEtag;
    setActiveProject((prev) => {
      if (!prev) return prev;
      return { ...prev, entities: (prev.entities ?? []).map((e) => (e.id === entityId ? entity : e)) };
    });
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

  /**
   * Sync If-Match token from GET /entities/:id (authoritative) when project refresh
   * did not yield a successful retry (e.g. stale etags in client ref).
   * Only updates the etag ref to preserve optimistic UI until PATCH succeeds.
   */
  const tryRecoverPatchViaEntityGet = async (): Promise<boolean> => {
    try {
      const latest = await getEntityApi(activeProjectId, entityId);
      if (!latest?.etag) {
        logPatchFailure('Failed to GET entity for patch recovery', new Error('missing etag'));
        return false;
      }
      entityEtagByIdRef.current[entityId] = latest.etag;
    } catch (getError) {
      logPatchFailure('Failed to GET entity for patch recovery', getError);
      return false;
    }
    try {
      const { entity, etag: nextEtag } = await sendPatchWithTransientRetries();
      applySuccessfulPatch(entity, nextEtag);
      return true;
    } catch (patchAfterGetError) {
      logPatchFailure('Failed to PATCH entity after GET recovery', patchAfterGetError);
      return false;
    }
  };

  try {
    const { entity, etag: nextEtag } = await sendPatchWithTransientRetries();
    applySuccessfulPatch(entity, nextEtag);
    return true;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 412 || e.status === 409)) {
      try {
        await refreshActiveProject({ bypassProjectRefreshBlock: true });
      } catch (refreshError) {
        logPatchFailure('Failed to refresh project before retry', refreshError);
        const recovered = await tryRecoverPatchViaEntityGet();
        if (recovered) return true;
        return false;
      }
      try {
        const { entity, etag: nextEtag } = await sendPatchWithTransientRetries();
        applySuccessfulPatch(entity, nextEtag);
        return true;
      } catch (retryError) {
        logPatchFailure('Failed to patch entity after refresh', retryError);
        const recovered = await tryRecoverPatchViaEntityGet();
        if (recovered) return true;
        try {
          await refreshActiveProject({ bypassProjectRefreshBlock: true });
        } catch (refreshError) {
          logPatchFailure('Failed to refresh project after retry failure', refreshError);
        }
        return false;
      }
    }
    if (e instanceof ApiError && (e.status === 404 || e.status === 410)) {
      // A 404 here has two possible meanings:
      //  1. The entity really was deleted server-side.
      //  2. The server returned 404 spuriously (e.g. the REQ-276 case where
      //     SQLITE_BUSY_SNAPSHOT was masked as 404). Blindly returning false
      //     leaves the optimistic UI in place and the change is lost on reload.
      // Prefer a GET-based recovery: if the entity still exists, re-apply the
      // PATCH with a fresh If-Match; otherwise refresh the project so the UI
      // stops showing a value the server never persisted.
      const recovered = await tryRecoverPatchViaEntityGet();
      if (recovered) return true;
      logPatchFailure('Entity not recoverable after 404 (refreshing project)', e);
      try {
        await refreshActiveProject({ bypassProjectRefreshBlock: true });
      } catch (refreshError) {
        logPatchFailure('Failed to refresh project after 404', refreshError);
      }
      return false;
    }
    logPatchFailure('Failed to patch entity', e);
    try {
      await refreshActiveProject({ bypassProjectRefreshBlock: true });
    } catch (refreshError) {
      logPatchFailure('Failed to refresh project after patch failure', refreshError);
    }
    const recovered = await tryRecoverPatchViaEntityGet();
    if (recovered) return true;
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

/**
 * Enqueue a PATCH to an entity and return a promise that resolves to the
 * final success state (after all retries / conflicts are handled).
 * Multiple concurrent calls against the same entity are coalesced into one
 * in-flight batch, preserving last-write-wins order via `Object.assign`.
 */
export function enqueueModifyEntityPatch(
  entityId: string,
  properties: Record<string, unknown>,
  ctx: ModifyEntityPumpContext
): Promise<boolean> {
  return new Promise((resolve) => {
    const queue = modifyEntityQueues.get(entityId) ?? [];
    queue.push({ properties, resolve });
    modifyEntityQueues.set(entityId, queue);
    void pumpModifyEntityQueue(entityId, ctx);
  });
}
