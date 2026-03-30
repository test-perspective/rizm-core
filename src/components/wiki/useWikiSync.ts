import { useCallback, useEffect } from 'react';

import { ApiError } from '../../auth/api';
import { fetchWikiPage, fetchWikiPages } from '../../api/projects';
import { mergeWikiDoc } from './wikiDocMerge';
import { syncWikiComments } from './wikiCommentsSync';
import type { WikiSyncParams } from './wikiPersistenceTypes';

export function useWikiSync(params: WikiSyncParams) {
  const {
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
  } = params;

  const bumpEditorResetToken = useCallback((pageId: string) => {
    setEditorResetTokenById((prev) => ({
      ...prev,
      [pageId]: (prev[pageId] ?? 0) + 1,
    }));
  }, [setEditorResetTokenById]);

  const applyRemotePage = useCallback(
    (
      pageId: string,
      remote: { doc: string; title: string; updatedAt: number; comments?: unknown; crdtBlob?: number[] }
    ) => {
      const localDoc = docByIdRef.current[pageId];
      const lastSavedDoc = lastSavedDocByIdRef.current[pageId];
      const localTitle = titleByIdRef.current[pageId];
      const lastSavedTitle = lastSavedTitleByIdRef.current[pageId];
      const hasUnsavedDoc = localDoc !== undefined && localDoc !== lastSavedDoc;
      const hasUnsavedTitle = localTitle !== undefined && localTitle !== lastSavedTitle;

      const nextDoc = hasUnsavedDoc
        ? mergeWikiDoc({
            baseDocJson: lastSavedDoc,
            localDocJson: localDoc,
            remoteDocJson: remote.doc,
          })
        : remote.doc;
      if (docByIdRef.current[pageId] !== nextDoc) {
        setDocById((prev) => ({ ...prev, [pageId]: nextDoc }));
        bumpEditorResetToken(pageId);
      }

      const isRemoteTitleEmpty = remote.title.trim() === '';
      const hasLocalNonEmptyTitle =
        localTitle !== undefined && localTitle.trim() !== '';
      const shouldOverwriteTitle =
        !hasUnsavedTitle &&
        titleByIdRef.current[pageId] !== remote.title &&
        !(isRemoteTitleEmpty && hasLocalNonEmptyTitle);
      if (shouldOverwriteTitle) {
        setTitleById((prev) => ({ ...prev, [pageId]: remote.title }));
      }

      if (remote.comments !== undefined && commentValuesPageIdRef.current === pageId) {
        const commentSync = syncWikiComments({
          currentComments: commentValuesRef.current?.comments,
          remoteComments: remote.comments,
          hasEditing: editingCommentIdRef.current != null,
          hasDirty: Object.values(commentDirtyByIdRef.current).some(Boolean),
          hasNewDraft: newCommentDraftRef.current.hasDraft,
        });
        if (commentSync.shouldUpdate) {
          setCommentValues((prev) => ({ ...(prev ?? {}), comments: commentSync.nextComments }));
        }
      }

      setLastSavedDocById((prev) => ({ ...prev, [pageId]: remote.doc }));
      setLastSavedTitleById((prev) => ({ ...prev, [pageId]: remote.title }));
      if (remote.crdtBlob !== undefined) {
        setCrdtBlobById((prev) => ({ ...prev, [pageId]: remote.crdtBlob }));
      }
      lastSyncedUpdatedAtByIdRef.current[pageId] = remote.updatedAt;
    },
    [
      bumpEditorResetToken,
      commentDirtyByIdRef,
      commentValuesPageIdRef,
      commentValuesRef,
      docByIdRef,
      editingCommentIdRef,
      lastSavedDocByIdRef,
      lastSavedTitleByIdRef,
      newCommentDraftRef,
      setCommentValues,
      setDocById,
      setLastSavedDocById,
      setLastSavedTitleById,
      setCrdtBlobById,
      setTitleById,
      titleByIdRef,
      lastSyncedUpdatedAtByIdRef,
    ]
  );

  const syncSelectedPage = useCallback(
    async (pageId: string) => {
      if (!projectIdRef.current) return;
      if (pageSyncInFlightRef.current) return;
      pageSyncInFlightRef.current = true;
      setLoadingDocId(pageId);

      try {
        const pageExists = pagesRef.current.some((p) => p.id === pageId);
        if (!pageExists) return;
        const remote = await fetchWikiPage(projectIdRef.current, pageId);
        const current = pagesRef.current.find((p) => p.id === pageId);
        const localUpdatedAt = current?.updatedAt ?? 0;
        const lastSynced = lastSyncedUpdatedAtByIdRef.current[pageId] ?? 0;
        const knownUpdatedAt = Math.max(localUpdatedAt, lastSynced);
        const localDoc = docByIdRef.current[pageId];
        const lastSavedDoc = lastSavedDocByIdRef.current[pageId];
        const isEmptyBlockNoteDoc = (d: string | undefined) =>
          !d || d.trim() === '' || d.trim() === '[]';
        const hasLocalDoc =
          typeof localDoc === 'string' && localDoc.trim().length > 0 && localDoc.trim() !== '[]';
        const hasRemoteDoc = typeof remote.doc === 'string' && remote.doc.trim().length > 0;
        const shouldForceApply =
          !hasLocalDoc && hasRemoteDoc && isEmptyBlockNoteDoc(lastSavedDoc);
        const remoteIsNewer = remote.updatedAt > knownUpdatedAt;
        const willApply = shouldForceApply || remoteIsNewer;
        if (!willApply) return;
        applyRemotePage(pageId, {
          doc: remote.doc,
          title: remote.title,
          updatedAt: remote.updatedAt,
          comments: remote.comments,
          crdtBlob: remote.crdtBlob,
        });
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          if (docByIdRef.current[pageId] === undefined) {
            setDocById((prev) => ({ ...prev, [pageId]: '[]' }));
            setLastSavedDocById((prev) => ({ ...prev, [pageId]: '[]' }));
          }
          await onRefreshProjectRef.current?.();
          return;
        }
        console.error('[wiki] failed to load page doc', e);
      } finally {
        pageSyncInFlightRef.current = false;
        setLoadingDocId((cur) => (cur === pageId ? null : cur));
      }
    },
    [
      applyRemotePage,
      docByIdRef,
      lastSavedDocByIdRef,
      lastSyncedUpdatedAtByIdRef,
      onRefreshProjectRef,
      pageSyncInFlightRef,
      pagesRef,
      projectIdRef,
      setDocById,
      setLastSavedDocById,
      setLoadingDocId,
    ]
  );

  const syncWikiList = useCallback(async () => {
    if (!projectIdRef.current) return;
    if (!onRefreshProjectRef.current) return;
    if (listSyncInFlightRef.current) return;
    listSyncInFlightRef.current = true;
    try {
      const meta = await fetchWikiPages(projectIdRef.current);
      const byId = new Map(pagesRef.current.map((p) => [p.id, p]));
      const metaIds = new Set(meta.map((m) => m.id));
      const hasNewer =
        meta.some((m) => {
          const local = byId.get(m.id);
          if (!local) return true;
          return m.updatedAt > local.updatedAt;
        }) || pagesRef.current.some((p) => !metaIds.has(p.id));
      if (hasNewer) {
        await onRefreshProjectRef.current();
      }
    } catch (e) {
      console.error('[wiki] failed to refresh wiki list', e);
    } finally {
      listSyncInFlightRef.current = false;
    }
  }, [listSyncInFlightRef, onRefreshProjectRef, pagesRef, projectIdRef]);

  useEffect(() => {
    if (!projectId || !selectedPageId) return;
    const selectedPage = pages.find((p) => p.id === selectedPageId);
    if (!selectedPage) return;

    const isAutoEditTarget = autoEditPageIdRef.current === selectedPageId && canEditPage;
    if (isAutoEditTarget) {
      setMode('edit');
      autoEditPageIdRef.current = null;
    } else if (selectedPageIdRef.current && selectedPageIdRef.current !== selectedPageId) {
      setMode('read');
    }
    selectedPageIdRef.current = selectedPageId;

    if (docById[selectedPageId] === undefined) {
      const initialDoc = String(selectedPage.properties?.doc ?? '');
      const trimmedInitialDoc = initialDoc.trim();
      if (trimmedInitialDoc.length > 0) {
        setDocById((prev) => {
          if (prev[selectedPageId] !== undefined) return prev;
          return { ...prev, [selectedPageId]: initialDoc };
        });
        setLastSavedDocById((prev) => {
          if (prev[selectedPageId] !== undefined) return prev;
          return { ...prev, [selectedPageId]: initialDoc };
        });
      }
    }
    if (titleById[selectedPageId] === undefined) {
      const initialTitle = String(selectedPage.properties?.title ?? '');
      setTitleById((prev) => {
        if (prev[selectedPageId] !== undefined) return prev;
        return { ...prev, [selectedPageId]: initialTitle };
      });
      setLastSavedTitleById((prev) => {
        if (prev[selectedPageId] !== undefined) return prev;
        return { ...prev, [selectedPageId]: initialTitle };
      });
    }
    syncSelectedPage(selectedPageId);
  }, [
    projectId,
    selectedPageId,
    pages,
    docById,
    titleById,
    syncSelectedPage,
    canEditPage,
    setMode,
    selectedPageIdRef,
    autoEditPageIdRef,
    setDocById,
    setLastSavedDocById,
    setTitleById,
    setLastSavedTitleById,
  ]);

  useEffect(() => {
    if (!projectId || !selectedPageId) return;
    if (!includeDocSaves) return;
    const timer = window.setInterval(() => {
      syncSelectedPage(selectedPageId);
    }, 10000);
    return () => {
      clearInterval(timer);
    };
  }, [includeDocSaves, projectId, selectedPageId, syncSelectedPage]);

  useEffect(() => {
    if (!projectId || !onRefreshProjectRef.current) return;
    syncWikiList();
    const timer = window.setInterval(() => {
      syncWikiList();
    }, 10000);
    return () => {
      clearInterval(timer);
    };
  }, [projectId, syncWikiList, onRefreshProjectRef]);
}
