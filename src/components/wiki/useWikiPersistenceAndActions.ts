import { useCallback, useEffect } from 'react';

import { computeWikiUnsavedUpdateForPage } from './wikiAutosaveUtils';
import { useWikiAutosave } from './useWikiAutosave';
import { useWikiSync } from './useWikiSync';
import type { WikiEditStartAnchor } from './WikiEditorPane';
import type { WikiPersistenceParams } from './wikiPersistenceTypes';
import { createWikiNodeWithOrder, deleteWikiPageWithSave } from './wikiPersistenceHelpers';

export function useWikiPersistenceAndActions(params: WikiPersistenceParams) {
  const {
    canEditPage,
    mode,
    setMode,
    selectedPageId,
    projectId,
    pages,
    selected,
    sortedPages,
    onCreatePage,
    onDeletePage,
    onSelectPage,
    onUpdatePage,
    onUpdatePageRef,
    onRefreshProjectRef,
    saveTick,
    setSaveTick,
    includeDocSaves,
    docById,
    setDocById,
    setCrdtBlobById,
    docByIdRef,
    lastSavedDocById,
    setLastSavedDocById,
    lastSavedDocByIdRef,
    titleById,
    setTitleById,
    titleByIdRef,
    lastSavedTitleById,
    setLastSavedTitleById,
    lastSavedTitleByIdRef,
    setLoadingDocId,
    pageListContainerRef,
    selectedPageIdRef,
    lastCreatedPageIdRef,
    autoEditPageIdRef,
    lastSyncedUpdatedAtByIdRef,
    pagesRef,
    projectIdRef,
    listSyncInFlightRef,
    pageSyncInFlightRef,
    scrollTopByPageIdRef,
    setEditorResetTokenById,
    setPendingEditAnchorById,
    setEditFocusTokenById,
    commentValuesRef,
    commentValuesPageIdRef,
    editingCommentIdRef,
    commentDirtyByIdRef,
    newCommentDraftRef,
    setCommentValues,
    dialog,
  } = params;

  useWikiSync({
    canEditPage,
    setMode,
    selectedPageId,
    projectId,
    pages,
    docById,
    titleById,
    setDocById,
    setLastSavedDocById,
    setTitleById,
    setLastSavedTitleById,
    setCrdtBlobById,
    setLoadingDocId,
    docByIdRef,
    lastSavedDocByIdRef,
    titleByIdRef,
    lastSavedTitleByIdRef,
    lastSyncedUpdatedAtByIdRef,
    pagesRef,
    projectIdRef,
    listSyncInFlightRef,
    pageSyncInFlightRef,
    onRefreshProjectRef,
    selectedPageIdRef,
    autoEditPageIdRef,
    commentValuesRef,
    commentValuesPageIdRef,
    editingCommentIdRef,
    commentDirtyByIdRef,
    newCommentDraftRef,
    setCommentValues,
    includeDocSaves,
    setEditorResetTokenById,
  });

  useWikiAutosave({
    canEdit: canEditPage,
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
  });

  const doCreate = useCallback(
    (parentId?: string | null, nodeType?: 'page' | 'folder', initialTitle?: string) => {
      createWikiNodeWithOrder({
        pages,
        onCreatePage: (opts) => onCreatePage(opts),
        onUpdatePage,
        onSelectPage,
        setDocById,
        setLastSavedDocById,
        setTitleById,
        setLastSavedTitleById,
        autoEditPageIdRef,
        lastCreatedPageIdRef,
        parentId: parentId ?? null,
        nodeType: nodeType ?? 'page',
        initialTitle,
      });
    },
    [
      pages,
      onCreatePage,
      onUpdatePage,
      onSelectPage,
      setDocById,
      setLastSavedDocById,
      setTitleById,
      setLastSavedTitleById,
      autoEditPageIdRef,
      lastCreatedPageIdRef,
    ]
  );

  const handleCreateTopLevelPage = () => doCreate(null, 'page');
  const handleCreateTopLevelFolder = useCallback(async () => {
    const name = await dialog.prompt({
      title: 'Create folder',
      message: 'Enter folder name:',
      placeholder: 'Folder name',
      confirmText: 'Create',
    });
    if (name == null) return;
    const trimmed = name.trim();
    if (trimmed === '') return;
    doCreate(null, 'folder', trimmed);
  }, [dialog, doCreate]);
  const handleCreateChildPage = (parentId: string) => doCreate(parentId, 'page');
  const handleCreateChildFolder = (parentId: string) => doCreate(parentId, 'folder');

  useEffect(() => {
    if (!lastCreatedPageIdRef.current) return;
    const pageId = lastCreatedPageIdRef.current;
    lastCreatedPageIdRef.current = null;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!pageListContainerRef.current) return;
        const pageElement = pageListContainerRef.current.querySelector(`[data-page-id="${pageId}"]`) as HTMLElement;
        if (pageElement) {
          pageElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      });
    });
  }, [sortedPages, lastCreatedPageIdRef, pageListContainerRef]);

  const handleDelete = async (id: string) => {
    await deleteWikiPageWithSave({
      id,
      pages,
      docById,
      lastSavedDocById,
      titleById,
      lastSavedTitleById,
      setDocById,
      setLastSavedDocById,
      setTitleById,
      setLastSavedTitleById,
      onUpdatePageRef,
      onDeletePage,
      dialog,
    });
  };

  const handleEditStart = (anchor?: WikiEditStartAnchor) => {
    if (!canEditPage) return;
    if (selected?.id && anchor) {
      setPendingEditAnchorById((prev) => ({ ...prev, [selected.id]: anchor }));
      setEditFocusTokenById((prev) => ({
        ...prev,
        [selected.id]: (prev[selected.id] ?? 0) + 1,
      }));
    }
    setMode('edit');
  };

  const handleDone = () => {
    if (!canEditPage) return;
    (document.activeElement as HTMLElement)?.blur?.();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        doHandleDone();
      });
    });
  };

  const doHandleDone = () => {
    if (selected) {
      const update = computeWikiUnsavedUpdateForPage(
        selected.id,
        docByIdRef.current,
        lastSavedDocByIdRef.current,
        titleByIdRef.current,
        lastSavedTitleByIdRef.current,
        includeDocSaves
      );
      if (update) {
        const patch = includeDocSaves
          ? update.patch
          : Object.fromEntries(Object.entries(update.patch).filter(([k]) => k !== 'doc'));
        if (Object.keys(patch).length > 0) {
          onUpdatePage(update.pageId, patch);
        }
        if (includeDocSaves && update.patch.doc !== undefined) {
          setLastSavedDocById((prev) => ({ ...prev, [update.pageId]: update.patch.doc }));
        }
        if (update.patch.title !== undefined) {
          setLastSavedTitleById((prev) => ({ ...prev, [update.pageId]: update.patch.title }));
        }
      }
    }
    setMode('read');
  };

  const handleScrollTopChange = (pageId: string, scrollTop: number) => {
    scrollTopByPageIdRef.current[pageId] = scrollTop;
  };

  const handleTitleChange = (pageId: string, title: string) => {
    setTitleById((prev) => ({ ...prev, [pageId]: title }));
    setSaveTick((prev) => prev + 1);
  };

  const handleRename = useCallback(
    async (pageId: string, currentTitle: string) => {
      const newTitle = await dialog.prompt({
        title: 'Rename',
        message: 'Enter new name:',
        defaultValue: currentTitle || 'Untitled',
        placeholder: 'Name',
        confirmText: 'Rename',
      });
      if (newTitle == null || newTitle.trim() === '') return;
      const trimmed = newTitle.trim();
      setTitleById((prev) => ({ ...prev, [pageId]: trimmed }));
      setLastSavedTitleById((prev) => ({ ...prev, [pageId]: trimmed }));
      onUpdatePage(pageId, { title: trimmed });
      setSaveTick((prev) => prev + 1);
    },
    [dialog, onUpdatePage, setLastSavedTitleById, setSaveTick, setTitleById]
  );

  const handleDocChange = (pageId: string, doc: string) => {
    setDocById((prev) => ({ ...prev, [pageId]: doc }));
    setSaveTick((prev) => prev + 1);
  };

  return {
    handleCreateTopLevelPage,
    handleCreateTopLevelFolder,
    handleCreateChildPage,
    handleCreateChildFolder,
    handleDelete,
    handleRename,
    handleEditStart,
    handleDone,
    handleScrollTopChange,
    handleTitleChange,
    handleDocChange,
  };
}
