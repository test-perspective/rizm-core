import { useCallback, useEffect, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { Entity, ViewConfig } from '../types';
import {
  getDefaultNotePaneWidthPx,
  getNotePanePrefs,
  notePaneWidthBounds,
  setNotePanePrefs,
  type NotePanePrefs,
} from './notePaneStorage';
import { setLastViewForProject } from './storage';

type BuildPath = (args: { projectId: string; viewId: string; entityId?: string | null }) => string;

export type UseNotePaneStateInput = {
  activeProjectId: string;
  effectiveViewId: string | null | undefined;
  currentView: ViewConfig | null | undefined;
  wikiPagesForNotes: Entity[];
  navigate: NavigateFunction;
  buildPath: BuildPath;
  removeEntity: (id: string) => void;
};

export type UseNotePaneStateResult = {
  notePaneLocal: NotePanePrefs;
  setNotePaneLocal: React.Dispatch<React.SetStateAction<NotePanePrefs>>;
  notePanePickerOpen: boolean;
  setNotePanePickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  notePanePickerTargetViewId: string | null;
  setNotePanePickerTargetViewId: React.Dispatch<React.SetStateAction<string | null>>;
  persistNotePaneForView: (viewId: string, next: NotePanePrefs) => void;
  hideNotePaneForView: (viewId: string) => void;
  openNotePanePickerForView: (viewId: string) => void;
  handleNotePanePickerConfirm: (pageId: string, targetViewId: string) => void;
  handleNotesWikiDelete: (id: string) => void;
};

export function useNotePaneState(input: UseNotePaneStateInput): UseNotePaneStateResult {
  const {
    activeProjectId,
    effectiveViewId,
    currentView,
    wikiPagesForNotes,
    navigate,
    buildPath,
    removeEntity,
  } = input;

  const [notePanePickerOpen, setNotePanePickerOpen] = useState(false);
  const [notePanePickerTargetViewId, setNotePanePickerTargetViewId] = useState<string | null>(null);
  const [notePaneLocal, setNotePaneLocal] = useState<NotePanePrefs>(() => ({
    open: false,
    pageId: null,
    widthPx: getDefaultNotePaneWidthPx(),
  }));

  useEffect(() => {
    if (!activeProjectId || !effectiveViewId || !currentView) return;
    if (currentView.type !== 'board' && currentView.type !== 'table') return;
    setNotePaneLocal(getNotePanePrefs(activeProjectId, effectiveViewId));
  }, [activeProjectId, effectiveViewId, currentView?.type, currentView?.id]);

  useEffect(() => {
    if (!activeProjectId || !effectiveViewId || !currentView) return;
    if (currentView.type !== 'board' && currentView.type !== 'table') return;
    setNotePaneLocal((prev) => {
      if (!prev.open || !prev.pageId) return prev;
      if (wikiPagesForNotes.some((p) => p.id === prev.pageId)) return prev;
      const next: NotePanePrefs = {
        ...prev,
        pageId: wikiPagesForNotes[0]?.id ?? null,
      };
      setNotePanePrefs(activeProjectId, effectiveViewId, next);
      return next;
    });
  }, [activeProjectId, effectiveViewId, currentView?.type, currentView?.id, wikiPagesForNotes]);

  const persistNotePaneForView = useCallback(
    (viewId: string, next: NotePanePrefs) => {
      setNotePanePrefs(activeProjectId, viewId, next);
      if (viewId === effectiveViewId) {
        setNotePaneLocal(next);
      }
    },
    [activeProjectId, effectiveViewId]
  );

  const hideNotePaneForView = useCallback(
    (viewId: string) => {
      const prev = getNotePanePrefs(activeProjectId, viewId);
      persistNotePaneForView(viewId, { ...prev, open: false });
    },
    [activeProjectId, persistNotePaneForView]
  );

  const openNotePanePickerForView = useCallback((viewId: string) => {
    setNotePanePickerTargetViewId(viewId);
    setNotePanePickerOpen(true);
  }, []);

  const handleNotePanePickerConfirm = useCallback(
    (pageId: string, targetViewId: string) => {
      const prev = getNotePanePrefs(activeProjectId, targetViewId);
      const widthPx =
        prev.widthPx >= notePaneWidthBounds.min ? prev.widthPx : getDefaultNotePaneWidthPx();
      const next: NotePanePrefs = { open: true, pageId, widthPx };
      setNotePanePrefs(activeProjectId, targetViewId, next);
      setNotePanePickerOpen(false);
      setNotePanePickerTargetViewId(null);
      if (targetViewId !== effectiveViewId) {
        setLastViewForProject(activeProjectId, targetViewId);
        navigate(buildPath({ projectId: activeProjectId, viewId: targetViewId }), { replace: false });
      } else {
        setNotePaneLocal(next);
      }
    },
    [activeProjectId, navigate, buildPath, effectiveViewId]
  );

  const handleNotesWikiDelete = useCallback(
    (id: string) => {
      // Caller-provided wiki pages are used to compute descendants when panel is showing notes.
      const pages = wikiPagesForNotes;
      const collectDescendants = (parentId: string): string[] =>
        pages
          .filter((e) => e.properties?.parentId === parentId)
          .flatMap((e) => [e.id, ...collectDescendants(e.id)]);
      const toDelete = [id, ...collectDescendants(id)];
      toDelete.forEach((entityId) => removeEntity(entityId));
      const remaining = pages.filter((e) => !toDelete.includes(e.id));
      if (!effectiveViewId) return;
      setNotePaneLocal((prev) => {
        if (!prev.open || !prev.pageId || !toDelete.includes(prev.pageId)) return prev;
        const next: NotePanePrefs = {
          ...prev,
          pageId: remaining[0]?.id ?? null,
        };
        setNotePanePrefs(activeProjectId, effectiveViewId, next);
        return next;
      });
    },
    [wikiPagesForNotes, removeEntity, activeProjectId, effectiveViewId]
  );

  return {
    notePaneLocal,
    setNotePaneLocal,
    notePanePickerOpen,
    setNotePanePickerOpen,
    notePanePickerTargetViewId,
    setNotePanePickerTargetViewId,
    persistNotePaneForView,
    hideNotePaneForView,
    openNotePanePickerForView,
    handleNotePanePickerConfirm,
    handleNotesWikiDelete,
  };
}
