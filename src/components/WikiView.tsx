import { useCallback, useRef, useState } from 'react';
import { WikiMoveDialog } from './wiki/WikiMoveDialog';
import { WikiPageListPane } from './wiki/WikiPageListPane';
import { WikiEditorPane } from './wiki/WikiEditorPane';
import type { WikiCollabPersistPayload } from './wiki/wikiCollaboration';
import { useWikiViewModel } from './wiki/useWikiViewModel';
import type { WikiViewProps } from './wiki/wikiViewTypes';
import {
  getDefaultWidth,
  getMaxWidth,
  getMinWidth,
  getPageListWidth,
  setPageListWidth,
} from '../utils/wikiPageListWidthPrefs';

export function WikiView({
  projectId,
  viewId,
  projects = [],
  pages,
  selectedPageId,
  onSelectPage,
  onCreatePage,
  onDeletePage,
  onUpdatePage,
  onRefreshProject,
  entities = [],
  onEntityClick,
  onServerEntity,
  searchQuery,
  wikiCreateRef,
}: WikiViewProps) {
  const {
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
    userDisplayName,
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
  } = useWikiViewModel({
    projectId,
    pages,
    selectedPageId,
    onSelectPage,
    onCreatePage,
    onDeletePage,
    onUpdatePage,
    onRefreshProject,
    wikiCreateRef,
  });

  const [movePageId, setMovePageId] = useState<string | null>(null);

  const defaultWidth = getDefaultWidth();
  const initialWidth = projectId && viewId
    ? getPageListWidth(projectId, viewId) ?? defaultWidth
    : defaultWidth;
  const [pageListWidth, setPageListWidthState] = useState(() =>
    Math.min(
      Math.max(getMinWidth(), initialWidth),
      getMaxWidth()
    )
  );
  const pageListWidthRef = useRef(pageListWidth);
  pageListWidthRef.current = pageListWidth;

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = pageListWidthRef.current;
    const minW = getMinWidth();
    const maxW = getMaxWidth();
    let lastWidth = startWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      lastWidth = Math.max(minW, Math.min(maxW, startWidth + delta));
      setPageListWidthState(lastWidth);
    };
    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (projectId && viewId) {
        setPageListWidth(projectId, viewId, lastWidth);
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [projectId, viewId]);

  const handleCollabPersisted = useCallback(
    (pageId: string, payload: WikiCollabPersistPayload) => {
      setLastSavedDocById((prev) => ({ ...prev, [pageId]: payload.doc }));
      setCrdtBlobById((prev) => ({ ...prev, [pageId]: payload.crdtBlob }));
      // REQ-232: When collaboration is on, RichTextEditor skips onChange. Update docById from persist.
      handleDocChange(pageId, payload.doc);
    },
    [setLastSavedDocById, setCrdtBlobById, handleDocChange]
  );

  return (
    <div className="h-full flex overflow-hidden">
      <WikiPageListPane
        width={pageListWidth}
        canEdit={canEditPage}
        query={query}
        onQueryChange={setQuery}
        pages={pages}
        treeRows={treeRows}
        sortedPages={sortedPages}
        selectedPageId={selectedPageId}
        expandedFolderIds={expandedFolderIds}
        onToggleFolder={toggleExpandedFolder}
        titleById={titleById}
        onSelectPage={handleSelectPage}
        onCreateTopLevelPage={handleCreateTopLevelPage}
        onCreateTopLevelFolder={handleCreateTopLevelFolder}
        onCreateChildPage={handleCreateChildPage}
        onCreateChildFolder={handleCreateChildFolder}
        onDeletePage={handleDelete}
        onRename={handleRename}
        pageListContainerRef={pageListContainerRef}
        activeId={activeId}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        entityById={entityById}
        onMovePage={
          collabEnabled && projects.length > 0 ? (id) => setMovePageId(id) : undefined
        }
      />
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        title="Resize panel"
        data-testid="wiki-page-list-resize-handle"
        className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-zinc-700/50 transition-colors"
        onMouseDown={handleResizeStart}
      />
      <WikiEditorPane
        projectId={projectId}
        canEdit={canEditPage}
        canComment={canComment}
        comments={comments}
        user={user}
        editingCommentId={editingCommentId}
        commentDraftById={commentDraftById}
        commentDirtyById={commentDirtyById}
        onAddComment={handleAddComment}
        onEditComment={handleEditComment}
        onCommentDraftChange={handleCommentDraftChange}
        onSaveComment={handleSaveComment}
        onCancelEditComment={handleCancelEditComment}
        onDeleteComment={handleDeleteComment}
        onNewCommentDraftChange={handleNewCommentDraftChange}
        mode={mode}
        selected={selected}
        titleById={titleById}
        docById={docById}
        crdtBlobById={crdtBlobById}
        editorResetTokenById={editorResetTokenById}
        loadingDocId={loadingDocId}
        focusRequest={selected ? pendingEditAnchorById[selected.id] : undefined}
        focusRequestToken={selected ? editFocusTokenById[selected.id] : undefined}
        restoreScrollTop={selected ? scrollTopByPageIdRef.current[selected.id] : undefined}
        searchQuery={searchQuery}
        onScrollTopChange={handleScrollTopChange}
        onTitleChange={handleTitleChange}
        onDocChange={handleDocChange}
        collabEnabled={collabEnabled}
        collabUserName={userDisplayName}
        onCollabPersisted={handleCollabPersisted}
        onPageDeleted={onRefreshProject}
        onEditStart={handleEditStart}
        onDone={handleDone}
        entities={entities}
        onEntityClick={onEntityClick}
        onServerEntity={onServerEntity}
        pagesCount={pages.length}
      />
      {movePageId && onRefreshProject && projects.length > 0 ? (
        <WikiMoveDialog
          open
          onClose={() => setMovePageId(null)}
          sourceProjectId={projectId}
          pageId={movePageId}
          pages={pages}
          projects={projects}
          onRefreshProject={onRefreshProject}
        />
      ) : null}
    </div>
  );
}

