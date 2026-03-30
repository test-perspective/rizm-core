import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import type { Entity } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { isBackendEnabled } from '../../utils/storage';
import { normalizeComments } from '../../utils/comments';
import { useAppDialog } from '../dialogs';
import { useEntityComments } from '../entityDetail/useEntityComments';
import { ORDER_KEY } from '../board/boardOrder';
import { computeWikiOrderMigration } from './wikiOrderMigration';
import { buildWikiTreeRows, getParentId, sortWikiTreeOrder } from './wikiTreeHelpers';
import type { WikiEditStartAnchor } from './WikiEditorPane';
import type { WikiViewProps } from './wikiViewTypes';
import { useWikiPersistenceAndActions } from './useWikiPersistenceAndActions';
import { useWikiDnd } from './useWikiDnd';

export function useWikiViewModel({
  projectId,
  pages,
  selectedPageId,
  onSelectPage,
  onCreatePage,
  onDeletePage,
  onUpdatePage,
  onRefreshProject,
  wikiCreateRef,
}: WikiViewProps) {
  const location = useLocation();
  const dialog = useAppDialog();
  const { user } = useAuth();
  const canEditPage = !!user && user.role !== 'viewer';
  const canComment = !!user;

  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'edit' | 'read'>('read');
  const [docById, setDocById] = useState<Record<string, string | undefined>>({});
  const [crdtBlobById, setCrdtBlobById] = useState<Record<string, number[] | undefined>>({});
  const [lastSavedDocById, setLastSavedDocById] = useState<Record<string, string | undefined>>({});
  const [titleById, setTitleById] = useState<Record<string, string>>({});
  const [lastSavedTitleById, setLastSavedTitleById] = useState<Record<string, string | undefined>>({});
  const [saveTick, setSaveTick] = useState(0);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  const [editorResetTokenById, setEditorResetTokenById] = useState<Record<string, number>>({});
  const [editFocusTokenById, setEditFocusTokenById] = useState<Record<string, number>>({});
  const [pendingEditAnchorById, setPendingEditAnchorById] = useState<Record<string, WikiEditStartAnchor | undefined>>({});
  const docByIdRef = useRef<Record<string, string | undefined>>({});
  const lastSavedDocByIdRef = useRef<Record<string, string | undefined>>({});
  const titleByIdRef = useRef<Record<string, string>>({});
  const lastSavedTitleByIdRef = useRef<Record<string, string | undefined>>({});
  const onUpdatePageRef = useRef(onUpdatePage);
  const onRefreshProjectRef = useRef<(() => void | Promise<unknown>) | undefined>(onRefreshProject);
  const pageListContainerRef = useRef<HTMLDivElement | null>(null);
  const selectedPageIdRef = useRef<string | null>(null);
  const lastCreatedPageIdRef = useRef<string | null>(null);
  const autoEditPageIdRef = useRef<string | null>(null);
  const migrationExecutedRef = useRef<Set<string>>(new Set());
  const lastSyncedUpdatedAtByIdRef = useRef<Record<string, number>>({});
  const pagesRef = useRef<Entity[]>(pages);
  const projectIdRef = useRef(projectId);
  const listSyncInFlightRef = useRef(false);
  const pageSyncInFlightRef = useRef(false);
  const scrollTopByPageIdRef = useRef<Record<string, number>>({});
  const [commentValues, setCommentValues] = useState<Record<string, any>>({});
  const [commentValuesPageId, setCommentValuesPageId] = useState<string | null>(null);
  const commentValuesRef = useRef<Record<string, any>>({});
  const commentValuesPageIdRef = useRef<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedPageId) return;
    const entityById = new Map(pages.map((p) => [p.id, p]));
    const byParent = new Map<string | null, string[]>();
    for (const p of pages) {
      const pid = getParentId(p);
      const list = byParent.get(pid) ?? [];
      list.push(p.id);
      byParent.set(pid, list);
    }
    const selected = entityById.get(selectedPageId);
    if (!selected) return;
    const ancestorIds = new Set<string>();
    let pid: string | null = getParentId(selected);
    while (pid) {
      const children = byParent.get(pid) ?? [];
      if (children.length > 0) ancestorIds.add(pid);
      const parent = entityById.get(pid);
      pid = parent ? getParentId(parent) : null;
    }
    if (ancestorIds.size === 0) return;
    setExpandedFolderIds((prev) => {
      let changed = false;
      for (const id of ancestorIds) {
        if (!prev.has(id)) changed = true;
      }
      if (!changed) return prev;
      const next = new Set(prev);
      for (const id of ancestorIds) next.add(id);
      return next;
    });
  }, [selectedPageId, pages]);

  useEffect(() => {
    if (!canEditPage) setMode('read');
  }, [canEditPage]);

  useEffect(() => {
    const fromState = (location.state as { wikiAutoEditEntityId?: string } | null)?.wikiAutoEditEntityId;
    if (typeof fromState === 'string') {
      autoEditPageIdRef.current = fromState;
    }
  }, [location.state]);

  const sortedPages = useMemo(() => sortWikiTreeOrder(pages), [pages]);

  const toggleExpandedFolder = useCallback((folderId: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  useEffect(() => {
    onUpdatePageRef.current = onUpdatePage;
  }, [onUpdatePage]);

  useEffect(() => {
    onRefreshProjectRef.current = onRefreshProject;
  }, [onRefreshProject]);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  useEffect(() => {
    commentValuesRef.current = commentValues;
  }, [commentValues]);

  useEffect(() => {
    commentValuesPageIdRef.current = commentValuesPageId;
  }, [commentValuesPageId]);

  useEffect(() => {
    if (!canEditPage) return;
    const { updates, migratedIds } = computeWikiOrderMigration(pages, migrationExecutedRef.current);
    if (updates.length === 0) return;
    migratedIds.forEach((id) => {
      migrationExecutedRef.current.add(id);
    });
    updates.forEach(({ id, order }) => {
      onUpdatePageRef.current(id, { [ORDER_KEY]: order });
    });
  }, [canEditPage, pages]);

  const treeRows = useMemo(
    () => buildWikiTreeRows(pages, expandedFolderIds, query),
    [pages, expandedFolderIds, query]
  );

  const {
    activeId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
    entityById,
  } = useWikiDnd({
    pages,
    expandedFolderIds,
    setExpandedFolderIds,
    query,
    onUpdatePage,
  });

  const selected = useMemo(() => {
    if (!selectedPageId) return null;
    return pages.find((p) => p.id === selectedPageId) ?? null;
  }, [pages, selectedPageId]);

  const selectedCrdtBlob = selected ? crdtBlobById[selected.id] : undefined;
  const hasSelectedCrdtBlob = Array.isArray(selectedCrdtBlob) && selectedCrdtBlob.length > 0;
  // Keep collab transport enabled for migration, but retain classic doc saves
  // until a CRDT blob exists for the selected page.
  const collabEnabled = isBackendEnabled();
  const includeDocSaves = !collabEnabled || !hasSelectedCrdtBlob;

  const {
    comments,
    editingCommentId,
    commentDraftById,
    commentDirtyById,
    editingCommentIdRef,
    commentDirtyByIdRef,
    newCommentDraftRef,
    resetCommentState,
    handleAddComment,
    handleEditComment,
    handleCommentDraftChange,
    handleSaveComment,
    handleCancelEditComment,
    handleDeleteComment,
    handleNewCommentDraftChange,
  } = useEntityComments({
    entity: selected,
    values: commentValues,
    setValues: setCommentValues,
    onUpdate: onUpdatePage,
    user,
    dialog,
  });

  useEffect(() => {
    commentDirtyByIdRef.current = commentDirtyById;
    editingCommentIdRef.current = editingCommentId;
  }, [commentDirtyById, editingCommentId, commentDirtyByIdRef, editingCommentIdRef]);

  useEffect(() => {
    if (!selected) {
      setCommentValues({});
      setCommentValuesPageId(null);
      resetCommentState();
      return;
    }
    if (commentValuesPageIdRef.current !== selected.id) {
      setCommentValues({ comments: normalizeComments(selected.properties?.comments) });
      setCommentValuesPageId(selected.id);
      resetCommentState();
    }
  }, [resetCommentState, selected]);

  useEffect(() => {
    docByIdRef.current = docById;
  }, [docById]);

  useEffect(() => {
    lastSavedDocByIdRef.current = lastSavedDocById;
  }, [lastSavedDocById]);

  useEffect(() => {
    titleByIdRef.current = titleById;
  }, [titleById]);

  useEffect(() => {
    lastSavedTitleByIdRef.current = lastSavedTitleById;
  }, [lastSavedTitleById]);

  const handleSelectPage = useCallback(
    async (targetId: string) => {
      if (targetId === selectedPageId) {
        onSelectPage(targetId);
        return;
      }
      const hasCommentEditOpen =
        Object.values(commentDirtyByIdRef.current).some(Boolean);
      const hasNewCommentDraft = newCommentDraftRef.current.hasDraft;
      if (hasCommentEditOpen || hasNewCommentDraft) {
        const confirmed = await dialog.confirm({
          title: 'Discard changes?',
          message:
            'You have unsaved comment changes. Discard and switch page?',
          confirmText: 'Discard and switch',
          cancelText: 'Keep editing',
          danger: true,
        });
        if (!confirmed) return;
        resetCommentState();
      }
      onSelectPage(targetId);
    },
    [
      selectedPageId,
      onSelectPage,
      dialog,
      editingCommentIdRef,
      commentDirtyByIdRef,
      newCommentDraftRef,
      resetCommentState,
    ]
  );

  const {
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
  } = useWikiPersistenceAndActions({
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
    onSelectPage: handleSelectPage,
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
  });

  useEffect(() => {
    if (wikiCreateRef) {
      wikiCreateRef.current = handleCreateTopLevelPage;
      return () => {
        wikiCreateRef.current = null;
      };
    }
  }, [wikiCreateRef, handleCreateTopLevelPage]);

  return {
    user,
    canEditPage,
    canComment,
    query,
    setQuery,
    sortedPages,
    treeRows,
    expandedFolderIds,
    toggleExpandedFolder,
    titleById,
    selected,
    comments,
    editingCommentId,
    commentDraftById,
    commentDirtyById,
    handleAddComment,
    handleEditComment,
    handleCommentDraftChange,
    handleSaveComment,
    handleCancelEditComment,
    handleDeleteComment,
    handleNewCommentDraftChange,
    pageListContainerRef,
    activeId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
    entityById,
    handleCreateTopLevelPage,
    handleCreateTopLevelFolder,
    handleCreateChildPage,
    handleCreateChildFolder,
    handleDelete,
    handleRename,
    mode,
    collabEnabled,
    userDisplayName: user?.email ?? user?.userId ?? 'Anonymous',
    docById,
    crdtBlobById,
    setCrdtBlobById,
    editorResetTokenById,
    loadingDocId,
    pendingEditAnchorById,
    editFocusTokenById,
    scrollTopByPageIdRef,
    handleScrollTopChange,
    handleTitleChange,
    handleDocChange,
    setLastSavedDocById,
    handleEditStart,
    handleDone,
    handleSelectPage,
  };
}
