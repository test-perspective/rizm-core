import { useCallback, useMemo } from 'react';
import { X } from 'lucide-react';
import type { Entity } from '../../types';
import type { WikiCollabPersistPayload } from './wikiCollaboration';
import type { CreateWikiNodeOptions } from './wikiPersistenceHelpers';
import { WikiEditorPane } from './WikiEditorPane';
import { useWikiViewModel } from './useWikiViewModel';
import { sortWikiTreeOrder } from './wikiTreeHelpers';

export type EmbeddedWikiNotePaneProps = {
  projectId: string;
  wikiViewId: string;
  wikiPages: Entity[];
  allEntities: Entity[];
  selectedPageId: string | null;
  onSelectPageId: (id: string) => void;
  onCreatePage: (opts?: CreateWikiNodeOptions) => Entity;
  onDeletePage: (id: string) => void;
  onUpdatePage: (id: string, patch: Record<string, any>) => void;
  onRefreshProject: () => void | Promise<unknown>;
  onWikiEntityClick: (entity: Entity) => void;
  onServerEntity: (entity: Entity, etag: string) => void;
  onCloseNotePane: () => void;
  searchQuery?: string;
};

/**
 * Single wiki page editor for the board/table notes side pane (REQ-288).
 * Reuses wiki view model without the page list / DnD tree UI.
 */
export function EmbeddedWikiNotePane({
  projectId,
  wikiViewId,
  wikiPages,
  allEntities,
  selectedPageId,
  onSelectPageId,
  onCreatePage,
  onDeletePage,
  onUpdatePage,
  onRefreshProject,
  onWikiEntityClick,
  onServerEntity,
  onCloseNotePane,
  searchQuery,
}: EmbeddedWikiNotePaneProps) {
  const vm = useWikiViewModel({
    projectId,
    viewId: wikiViewId,
    pages: wikiPages,
    selectedPageId,
    onSelectPage: onSelectPageId,
    onCreatePage,
    onDeletePage,
    onUpdatePage,
    onRefreshProject,
    entities: allEntities,
    onEntityClick: onWikiEntityClick,
    onServerEntity,
    searchQuery,
    wikiCreateRef: undefined,
  });

  const {
    canEditPage,
    canComment,
    user,
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
    mode,
    selected,
    titleById,
    docById,
    crdtBlobById,
    editorResetTokenById,
    loadingDocId,
    pendingEditAnchorById,
    editFocusTokenById,
    scrollTopByPageIdRef,
    handleScrollTopChange,
    handleTitleChange,
    handleDocChange,
    collabEnabled,
    userDisplayName,
    handleEditStart,
    handleDone,
    handleSelectPage,
    setLastSavedDocById,
    setCrdtBlobById,
  } = vm;

  const sortedForSelect = useMemo(() => sortWikiTreeOrder(wikiPages), [wikiPages]);

  const handleCollabPersisted = useCallback(
    (pageId: string, payload: WikiCollabPersistPayload) => {
      setLastSavedDocById((prev) => ({ ...prev, [pageId]: payload.doc }));
      setCrdtBlobById((prev) => ({ ...prev, [pageId]: payload.crdtBlob }));
      handleDocChange(pageId, payload.doc);
    },
    [setLastSavedDocById, setCrdtBlobById, handleDocChange]
  );

  return (
    <div className="h-full flex flex-col min-h-0 min-w-0 bg-zinc-950 border-r border-zinc-800">
      <div className="flex items-center gap-2 px-2 py-2 border-b border-zinc-800 shrink-0">
        <label htmlFor="embedded-wiki-page-select" className="sr-only">
          Note page
        </label>
        <select
          id="embedded-wiki-page-select"
          data-testid="embedded-wiki-page-select"
          className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-sm text-zinc-200"
          value={selectedPageId ?? ''}
          onChange={(e) => {
            const id = e.target.value;
            if (id) void handleSelectPage(id);
          }}
          disabled={sortedForSelect.length === 0}
        >
          <option value="">{sortedForSelect.length === 0 ? 'No pages' : 'Select page…'}</option>
          {sortedForSelect.map((p) => {
            const title =
              (typeof p.properties?.title === 'string' && p.properties.title.trim()) || 'Untitled';
            return (
              <option key={p.id} value={p.id}>
                {title}
              </option>
            );
          })}
        </select>
        <button
          type="button"
          data-testid="embedded-wiki-note-close"
          onClick={onCloseNotePane}
          className="shrink-0 p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
          title="Close notes pane"
          aria-label="Close notes pane"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
        {selectedPageId && selected ? (
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
            entities={allEntities}
            onEntityClick={onWikiEntityClick}
            onServerEntity={onServerEntity}
            pagesCount={wikiPages.length}
          />
        ) : (
          <div className="h-full flex items-center justify-center p-4 text-center text-sm text-zinc-500">
            {wikiPages.length === 0
              ? 'No wiki pages in this project. Create pages from the Wiki view.'
              : 'Select a page to show notes here.'}
          </div>
        )}
      </div>
    </div>
  );
}
