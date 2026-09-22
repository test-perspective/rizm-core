import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

type ForgetCachedPageBodiesParams = {
  setDocById: Dispatch<SetStateAction<Record<string, string | undefined>>>;
  setLastSavedDocById: Dispatch<SetStateAction<Record<string, string | undefined>>>;
  setCrdtBlobById: Dispatch<SetStateAction<Record<string, number[] | undefined>>>;
  lastSyncedUpdatedAtByIdRef: MutableRefObject<Record<string, number>>;
};

function omitKeys<T>(map: Record<string, T>, keys: string[]): Record<string, T> {
  const next = { ...map };
  let changed = false;
  keys.forEach((key) => {
    if (key in next) {
      delete next[key];
      changed = true;
    }
  });
  return changed ? next : map;
}

/**
 * Drop every cached body for the given pages so the next selection refetches them.
 *
 * REQ-319: the caches are keyed by page id only and survive a project switch, so after a
 * cross-project move they would still hold bodies (and a CRDT blob) whose attachment URLs
 * point at the source project — whose files are deleted by the move. Clearing them also
 * clears `lastSyncedUpdatedAt`, which is what lets `useWikiSync` force-apply the remote
 * body even though the refreshed page list already carries the post-move `updatedAt`.
 */
export function useForgetCachedPageBodies({
  setDocById,
  setLastSavedDocById,
  setCrdtBlobById,
  lastSyncedUpdatedAtByIdRef,
}: ForgetCachedPageBodiesParams) {
  return useCallback(
    (pageIds: string[]) => {
      if (pageIds.length === 0) return;
      pageIds.forEach((id) => {
        delete lastSyncedUpdatedAtByIdRef.current[id];
      });
      setDocById((prev) => omitKeys(prev, pageIds));
      setLastSavedDocById((prev) => omitKeys(prev, pageIds));
      setCrdtBlobById((prev) => omitKeys(prev, pageIds));
    },
    [setDocById, setLastSavedDocById, setCrdtBlobById, lastSyncedUpdatedAtByIdRef]
  );
}
