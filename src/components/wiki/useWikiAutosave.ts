import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { WikiPagePatch } from './wikiAutosaveUtils';
import {
  computeWikiUnsavedUpdateForPage,
  computeWikiUnsavedUpdates,
  hasAnyWikiUnsavedChanges,
} from './wikiAutosaveUtils';

type UseWikiAutosaveArgs = {
  canEdit: boolean;
  mode: 'edit' | 'read';
  selectedPageId: string | null;
  saveTick: number;
  includeDocSaves: boolean;
  docByIdRef: MutableRefObject<Record<string, string | undefined>>;
  lastSavedDocByIdRef: MutableRefObject<Record<string, string | undefined>>;
  titleByIdRef: MutableRefObject<Record<string, string>>;
  lastSavedTitleByIdRef: MutableRefObject<Record<string, string | undefined>>;
  onUpdatePageRef: MutableRefObject<(id: string, patch: Record<string, any>) => void>;
  setLastSavedDocById: Dispatch<SetStateAction<Record<string, string | undefined>>>;
  setLastSavedTitleById: Dispatch<SetStateAction<Record<string, string | undefined>>>;
};

const applyPatch = (
  pageId: string,
  patch: WikiPagePatch,
  onUpdatePageRef: MutableRefObject<(id: string, patch: Record<string, any>) => void>,
  setLastSavedDocById: Dispatch<SetStateAction<Record<string, string | undefined>>>,
  setLastSavedTitleById: Dispatch<SetStateAction<Record<string, string | undefined>>>
) => {
  onUpdatePageRef.current(pageId, patch);
  if (patch.doc !== undefined) {
    setLastSavedDocById((prev) => ({ ...prev, [pageId]: patch.doc }));
  }
  if (patch.title !== undefined) {
    setLastSavedTitleById((prev) => ({ ...prev, [pageId]: patch.title }));
  }
};

export const useWikiAutosave = ({
  canEdit,
  mode,
  selectedPageId,
  saveTick,
  includeDocSaves,
  docByIdRef,
  lastSavedDocByIdRef,
  titleByIdRef,
  lastSavedTitleByIdRef,
  onUpdatePageRef,
  setLastSavedDocById,
  setLastSavedTitleById,
}: UseWikiAutosaveArgs) => {
  const previousSelectedPageIdRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const debounceMs = 800;

  const hasUnsavedChanges = useCallback((): boolean => {
    if (!canEdit || mode === 'read') return false;
    const pageIds = Object.keys(docByIdRef.current);
    return hasAnyWikiUnsavedChanges(
      pageIds,
      docByIdRef.current,
      lastSavedDocByIdRef.current,
      titleByIdRef.current,
      lastSavedTitleByIdRef.current,
      includeDocSaves
    );
  }, [canEdit, mode, docByIdRef, includeDocSaves, lastSavedDocByIdRef, titleByIdRef, lastSavedTitleByIdRef]);

  useEffect(() => {
    if (!canEdit || mode === 'read') return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        const pageIds = Object.keys(docByIdRef.current);
        const updates = computeWikiUnsavedUpdates(
          pageIds,
          docByIdRef.current,
          lastSavedDocByIdRef.current,
          titleByIdRef.current,
          lastSavedTitleByIdRef.current,
          includeDocSaves
        );
        for (const { pageId, patch } of updates) {
          try {
            applyPatch(pageId, patch, onUpdatePageRef, setLastSavedDocById, setLastSavedTitleById);
          } catch (e) {
            console.error(`[wiki] Failed to save page ${pageId} on beforeunload:`, e);
          }
        }
        event.preventDefault();
        event.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [
    canEdit,
    mode,
    includeDocSaves,
    hasUnsavedChanges,
    docByIdRef,
    lastSavedDocByIdRef,
    titleByIdRef,
    lastSavedTitleByIdRef,
    onUpdatePageRef,
    setLastSavedDocById,
    setLastSavedTitleById,
  ]);

  useEffect(() => {
    const previousPageId = previousSelectedPageIdRef.current;
    if (previousPageId && previousPageId !== selectedPageId) {
      const update = computeWikiUnsavedUpdateForPage(
        previousPageId,
        docByIdRef.current,
        lastSavedDocByIdRef.current,
        titleByIdRef.current,
        lastSavedTitleByIdRef.current,
        includeDocSaves
      );
      if (update) {
        applyPatch(update.pageId, update.patch, onUpdatePageRef, setLastSavedDocById, setLastSavedTitleById);
      }
    }
    previousSelectedPageIdRef.current = selectedPageId;
  }, [
    selectedPageId,
    docByIdRef,
    lastSavedDocByIdRef,
    titleByIdRef,
    lastSavedTitleByIdRef,
    onUpdatePageRef,
    includeDocSaves,
    setLastSavedDocById,
    setLastSavedTitleById,
  ]);

  useEffect(() => {
    if (!selectedPageId || !canEdit || mode === 'read') {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      const update = computeWikiUnsavedUpdateForPage(
        selectedPageId,
        docByIdRef.current,
        lastSavedDocByIdRef.current,
        titleByIdRef.current,
        lastSavedTitleByIdRef.current,
        includeDocSaves
      );
      if (update) {
        applyPatch(update.pageId, update.patch, onUpdatePageRef, setLastSavedDocById, setLastSavedTitleById);
      }
    }, debounceMs);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [
    saveTick,
    selectedPageId,
    canEdit,
    mode,
    includeDocSaves,
    docByIdRef,
    lastSavedDocByIdRef,
    titleByIdRef,
    lastSavedTitleByIdRef,
    onUpdatePageRef,
    setLastSavedDocById,
    setLastSavedTitleById,
  ]);

  useEffect(() => {
    const docById = docByIdRef.current;
    const lastSavedDocById = lastSavedDocByIdRef.current;
    const titleById = titleByIdRef.current;
    const lastSavedTitleById = lastSavedTitleByIdRef.current;
    const onUpdatePage = onUpdatePageRef.current;
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      const pageIds = Object.keys(docById);
      const updates = computeWikiUnsavedUpdates(
        pageIds,
        docById,
        lastSavedDocById,
        titleById,
        lastSavedTitleById,
        includeDocSaves
      );
      for (const { pageId, patch } of updates) {
        try {
          onUpdatePage(pageId, patch);
        } catch (e) {
          console.error(`[wiki] Failed to save page ${pageId} on unmount:`, e);
        }
      }
    };
  }, [docByIdRef, includeDocSaves, lastSavedDocByIdRef, titleByIdRef, lastSavedTitleByIdRef, onUpdatePageRef]);
};
