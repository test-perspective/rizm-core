import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { Entity } from '../../types';
import type { Me } from '../../auth/types';
import type { TaskComment } from '../../utils/comments';
import { Check, Edit3, Eye, Loader2 } from 'lucide-react';
import { WikiEditor } from './WikiEditor';
import type { WikiCollabPersistPayload } from './wikiCollaboration';
import { getDocForEntity } from './wikiEditorPaneDisplayLogic';
import { CommentsSection } from '../entityDetail/comments/CommentsSection';

const LOADING_SPINNER_DELAY_MS = 500;

/**
 * Page to display: selected if doc ready, else keep previous visible until content is ready.
 * Fixes flicker: right after switch docById[selected.id] is undefined (useEffect not run yet),
 * so we must show previous page immediately - don't wait for loadingDocId.
 */
function useDisplayedPage(
  selected: Entity | null,
  docById: Record<string, string | undefined>
): { display: Entity | null; isLoadingOverlay: boolean } {
  const lastDisplayedRef = useRef<Entity | null>(null);

  const selectedDocReady = selected && docById[selected.id] !== undefined;
  const selectedDocNotReady = selected && docById[selected.id] === undefined;
  const hasPreviousToShow = lastDisplayedRef.current && docById[lastDisplayedRef.current.id] !== undefined;

  let display: Entity | null;
  let isLoadingOverlay: boolean;

  if (selectedDocReady) {
    display = selected;
    isLoadingOverlay = false;
    lastDisplayedRef.current = selected;
  } else if (selectedDocNotReady && hasPreviousToShow) {
    display = lastDisplayedRef.current;
    isLoadingOverlay = true;
  } else {
    display = selected;
    isLoadingOverlay = false;
  }

  return { display, isLoadingOverlay };
}

export type WikiEditStartAnchor = {
  blockId?: string;
  clientX: number;
  clientY: number;
};

type WikiEditorPaneProps = {
  projectId: string;
  canEdit: boolean;
  canComment: boolean;
  mode: 'edit' | 'read';
  selected: Entity | null;
  titleById: Record<string, string>;
  docById: Record<string, string | undefined>;
  editorResetTokenById: Record<string, number>;
  loadingDocId: string | null;
  comments: TaskComment[];
  user?: Me | null;
  editingCommentId: string | null;
  commentDraftById: Record<string, string>;
  commentDirtyById: Record<string, boolean>;
  onAddComment: (doc: string) => boolean;
  onEditComment: (id: string) => void;
  onCommentDraftChange: (id: string, doc: string, isDirty: boolean) => void;
  onSaveComment: (id: string) => void;
  onCancelEditComment: (id: string) => void;
  onDeleteComment: (id: string) => void;
  onNewCommentDraftChange: (doc: string) => void;
  onTitleChange: (pageId: string, title: string) => void;
  onDocChange: (pageId: string, doc: string) => void;
  onEditStart: (anchor?: WikiEditStartAnchor) => void;
  onDone: () => void;
  focusRequest?: WikiEditStartAnchor;
  focusRequestToken?: number;
  restoreScrollTop?: number;
  searchQuery?: string;
  onScrollTopChange?: (pageId: string, scrollTop: number) => void;
  entities: Entity[];
  onEntityClick?: (entity: Entity) => void;
  onServerEntity?: (entity: Entity, etag: string) => void;
  collabEnabled?: boolean;
  collabUserName?: string;
  crdtBlobById?: Record<string, number[] | undefined>;
  onCollabPersisted?: (pageId: string, payload: WikiCollabPersistPayload) => void;
  onPageDeleted?: () => void;
  pagesCount?: number;
};

export function WikiEditorPane({
  projectId,
  canEdit,
  canComment,
  mode,
  selected,
  titleById,
  docById,
  editorResetTokenById,
  loadingDocId,
  comments,
  user,
  editingCommentId,
  commentDraftById,
  commentDirtyById,
  onAddComment,
  onEditComment,
  onCommentDraftChange,
  onSaveComment,
  onCancelEditComment,
  onDeleteComment,
  onNewCommentDraftChange,
  onTitleChange,
  onDocChange,
  onEditStart,
  onDone,
  focusRequest,
  focusRequestToken,
  restoreScrollTop,
  searchQuery,
  onScrollTopChange,
  entities,
  onEntityClick,
  onServerEntity,
  collabEnabled = false,
  collabUserName,
  crdtBlobById = {},
  onCollabPersisted,
  onPageDeleted,
  pagesCount = 0,
}: WikiEditorPaneProps) {
  const [showDelayedSpinner, setShowDelayedSpinner] = useState(false);
  const loadingDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { display, isLoadingOverlay } = useDisplayedPage(selected, docById);
  const isLoadingWithoutDoc =
    !!selected && loadingDocId === selected.id && docById[selected.id] === undefined;
  const selectedToken = display ? editorResetTokenById[display.id] ?? 0 : 0;

  const docForDisplay = display ? getDocForEntity(display, docById, selected) : undefined;
  const headerEntity = selected ?? display;
  const shouldShowLoadingMessage =
    !!display &&
    !!selected &&
    display.id === selected.id &&
    docById[selected.id] === undefined;

  useEffect(() => {
    if (!isLoadingWithoutDoc) {
      if (loadingDelayTimerRef.current) {
        clearTimeout(loadingDelayTimerRef.current);
        loadingDelayTimerRef.current = null;
      }
      setShowDelayedSpinner(false);
      return;
    }
    loadingDelayTimerRef.current = setTimeout(() => {
      loadingDelayTimerRef.current = null;
      setShowDelayedSpinner(true);
    }, LOADING_SPINNER_DELAY_MS);
    return () => {
      if (loadingDelayTimerRef.current) {
        clearTimeout(loadingDelayTimerRef.current);
        loadingDelayTimerRef.current = null;
      }
    };
  }, [isLoadingWithoutDoc]);

  const handleContentMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (!canEdit || mode !== 'read') return;
    if (event.button !== 0) return;
    const container = event.currentTarget;
    const rect = container.getBoundingClientRect();
    const scrollbarWidth = container.offsetWidth - container.clientWidth;
    const scrollbarHeight = container.offsetHeight - container.clientHeight;
    const clickedScrollbarX =
      scrollbarWidth > 0 && event.clientX >= rect.right - scrollbarWidth;
    const clickedScrollbarY =
      scrollbarHeight > 0 && event.clientY >= rect.bottom - scrollbarHeight;
    const targetEqContainer = event.target === container;
    const wouldSkip = targetEqContainer && (clickedScrollbarX || clickedScrollbarY);
    let clickedScrollbarOfDescendant = false;
    let el: HTMLElement | null = event.target as HTMLElement;
    while (el && container.contains(el)) {
      const ov = getComputedStyle(el).overflowY;
      if (ov === 'auto' || ov === 'scroll') {
        const r = el.getBoundingClientRect();
        const sbw = el.offsetWidth - el.clientWidth;
        const sbh = el.offsetHeight - el.clientHeight;
        const inVerticalBar = sbw > 0 && event.clientX >= r.right - sbw;
        const inHorizontalBar = sbh > 0 && event.clientY >= r.bottom - sbh;
        clickedScrollbarOfDescendant = inVerticalBar || inHorizontalBar;
        break;
      }
      el = el.parentElement;
    }
    if (wouldSkip || clickedScrollbarOfDescendant) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('a, [role="link"], [data-keel-task-link]')) {
      return;
    }
    const candidate = target?.closest?.('[data-id]');
    const blockElement =
      candidate && event.currentTarget.contains(candidate) ? (candidate as HTMLElement) : null;
    const blockId = blockElement?.getAttribute('data-id') ?? undefined;
    onEditStart({ blockId, clientX: event.clientX, clientY: event.clientY });
  };

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden p-6 gap-4">
      <div className="flex items-center justify-between gap-3">
        {mode === 'edit' && canEdit ? (
          <input
            value={
              headerEntity
                ? titleById[headerEntity.id] !== undefined
                  ? titleById[headerEntity.id]
                  : String(headerEntity.properties?.title ?? '')
                : ''
            }
            onChange={(e) => {
              if (headerEntity) {
                onTitleChange(headerEntity.id, e.target.value);
              }
            }}
            placeholder="Untitled"
            disabled={!headerEntity || !canEdit || isLoadingOverlay}
            className="flex-1 min-h-[2.5rem] bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-white disabled:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        ) : (
          <button
            type="button"
            onClick={headerEntity && !isLoadingOverlay ? onEditStart : undefined}
            disabled={!headerEntity || !canEdit}
            className={`flex-1 min-h-[2.5rem] text-left border rounded-md px-3 py-2 ${
              canEdit && headerEntity ? 'text-white hover:bg-zinc-950' : 'text-zinc-500'
            } bg-black border-zinc-800`}
            title={canEdit ? 'Click to edit title' : undefined}
          >
            {headerEntity
              ? titleById[headerEntity.id] !== undefined
                ? titleById[headerEntity.id]
                : String(headerEntity.properties?.title ?? 'Untitled')
              : ''}
          </button>
        )}

        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              type="button"
              disabled={!selected || isLoadingOverlay}
              onClick={mode === 'edit' ? onDone : onEditStart}
              className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-600 border border-zinc-800 rounded-md text-sm text-zinc-200 transition-colors flex items-center gap-2"
              title={mode === 'edit' ? 'Done' : 'Edit'}
            >
              {mode === 'edit' ? <Check className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
              <span>{mode === 'edit' ? 'Done' : 'Edit'}</span>
            </button>
          )}
          {!canEdit && (
            <div className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-md text-sm text-zinc-500 flex items-center gap-2">
              <Eye className="w-4 h-4" />
              <span>Read</span>
            </div>
          )}
        </div>
      </div>

      {display ? (
        docForDisplay !== undefined ? (
          <div
            className={`flex-1 min-h-0 overflow-hidden flex flex-col relative ${
              canEdit && mode === 'read' ? 'cursor-pointer' : ''
            }`}
            onMouseDown={mode === 'read' && !isLoadingOverlay ? handleContentMouseDown : undefined}
          >
            <WikiEditor
              key={`${display.id}:${selectedToken}`}
              projectId={projectId}
              page={display}
              docJson={docForDisplay}
              editable={canEdit && mode === 'edit' && !isLoadingOverlay}
              mode={mode}
              restoreScrollTop={restoreScrollTop}
              searchQuery={searchQuery}
              focusRequest={!isLoadingOverlay && focusRequest ? { blockId: focusRequest.blockId } : undefined}
              focusRequestToken={focusRequestToken}
              onScrollTopChange={onScrollTopChange}
              onUpdateDoc={(doc) => onDocChange(display.id, doc)}
              entities={entities}
              onEntityClick={onEntityClick}
              onServerEntity={onServerEntity}
              collabEnabled={collabEnabled}
              collabUserName={collabUserName}
              crdtBlob={crdtBlobById[display.id]}
              onCollabPersisted={onCollabPersisted}
              onPageDeleted={onPageDeleted}
              footer={
                mode === 'read' ? (
                  <div
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <CommentsSection
                      entity={display}
                      comments={comments}
                      canComment={canComment}
                      entities={entities}
                      onEntityClick={onEntityClick}
                      onAddComment={onAddComment}
                      user={user}
                      editingCommentId={editingCommentId}
                      commentDraftById={commentDraftById}
                      commentDirtyById={commentDirtyById}
                      onEditComment={onEditComment}
                      onCommentDraftChange={onCommentDraftChange}
                      onSaveComment={onSaveComment}
                      onCancelEditComment={onCancelEditComment}
                      onDeleteComment={onDeleteComment}
                      onNewCommentDraftChange={onNewCommentDraftChange}
                    />
                  </div>
                ) : undefined
              }
            />
            {isLoadingOverlay && (
              <div
                className="absolute inset-0 bg-black rounded-lg z-10 transition-opacity duration-150"
                aria-busy="true"
                aria-label="Loading page"
              >
                {showDelayedSpinner ? (
                  <div className="absolute inset-0 flex items-center justify-center gap-2 text-zinc-300">
                    <Loader2 className="w-5 h-5 animate-spin shrink-0" aria-hidden />
                    <span>Loading...</span>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center border border-zinc-800 rounded-lg bg-zinc-950 text-zinc-500 gap-2">
            {shouldShowLoadingMessage ? (
              <>
                {showDelayedSpinner && (
                  <Loader2 className="w-5 h-5 animate-spin shrink-0" aria-hidden />
                )}
                <span>Loading page...</span>
              </>
            ) : (
              'Failed to load page content'
            )}
          </div>
        )
      ) : (
        <div className="flex-1 flex items-center justify-center border border-zinc-800 rounded-lg bg-zinc-950 text-zinc-500">
          {pagesCount === 0 ? 'Create a page to get started' : 'Select a page'}
        </div>
      )}
    </div>
  );
}

