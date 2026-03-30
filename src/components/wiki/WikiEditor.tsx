import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Entity } from '../../types';
import { RichTextEditor } from '../RichTextEditor';
import { useWikiCollaboration, type WikiCollabPersistPayload } from './wikiCollaboration';

type WikiEditorProps = {
  projectId: string;
  page: Entity;
  docJson: string | undefined;
  editable: boolean;
  mode: 'edit' | 'read';
  restoreScrollTop?: number;
  searchQuery?: string;
  focusRequest?: { blockId?: string };
  focusRequestToken?: number;
  onScrollTopChange?: (pageId: string, scrollTop: number) => void;
  onUpdateDoc: (docJson: string) => void;
  entities?: Entity[];
  onEntityClick?: (entity: Entity) => void;
  onServerEntity?: (entity: Entity, etag: string) => void;
  collabEnabled?: boolean;
  collabUserName?: string;
  crdtBlob?: number[];
  onCollabPersisted?: (pageId: string, payload: WikiCollabPersistPayload) => void;
  onPageDeleted?: () => void;
  className?: string;
  footer?: ReactNode;
};

export function WikiEditor({
  projectId,
  page,
  docJson,
  editable,
  mode,
  restoreScrollTop,
  searchQuery,
  focusRequest,
  focusRequestToken,
  onScrollTopChange,
  onUpdateDoc,
  entities,
  onEntityClick,
  onServerEntity,
  collabEnabled = false,
  collabUserName,
  crdtBlob,
  onCollabPersisted,
  onPageDeleted,
  className,
  footer,
}: WikiEditorProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lastModeRef = useRef<'edit' | 'read'>(mode);
  const lastHighlightRef = useRef<{ pageId: string; query: string } | null>(null);
  const getDocRef = useRef<(() => string) | null>(null);
  const collab = useWikiCollaboration({
    enabled: collabEnabled,
    projectId,
    pageId: page.id,
    docJson,
    crdtBlob,
    userName: collabUserName,
    onPersisted: (payload) => onCollabPersisted?.(page.id, payload),
    onPageDeleted,
    getCurrentDoc: () => getDocRef.current?.() ?? docJson ?? '',
  });

  const restoreScrollPosition = (target: number) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!scrollContainerRef.current) return;
        scrollContainerRef.current.scrollTop = target;
      });
    });
  };

  useLayoutEffect(() => {
    const wasEdit = lastModeRef.current === 'edit';
    lastModeRef.current = mode;
    if (mode !== 'edit' || wasEdit) return;
    if (typeof restoreScrollTop !== 'number') return;
    restoreScrollPosition(restoreScrollTop);
  }, [mode, restoreScrollTop]);

  useLayoutEffect(() => {
    if (mode !== 'edit') return;
    if (!focusRequestToken) return;
    if (typeof restoreScrollTop !== 'number') return;
    restoreScrollPosition(restoreScrollTop);
  }, [focusRequestToken, mode, restoreScrollTop]);

  useLayoutEffect(() => {
    if (mode !== 'read') return;
    const q = searchQuery?.trim();
    if (!q) return;
    const key = { pageId: page.id, query: q };
    const prev = lastHighlightRef.current;
    if (prev && prev.pageId === key.pageId && prev.query === key.query) {
      return;
    }
    const container = scrollContainerRef.current;
    if (!container) return;
    const didHighlight = highlightFirstMatch(container, q);
    if (didHighlight) {
      lastHighlightRef.current = key;
    }
  }, [mode, page.id, searchQuery, docJson]);

  const containerClassName = `flex-1 min-h-0 h-full overflow-hidden border rounded-lg ${
    editable ? 'bg-zinc-900 border-zinc-800' : 'bg-black border-zinc-800'
  } ${className ?? ''}`;
  return (
    <div className={containerClassName.trim()}>
      <div
        ref={scrollContainerRef}
        className="h-full min-h-0 overflow-auto overscroll-contain p-4"
        onScroll={() => {
          if (!scrollContainerRef.current) return;
          onScrollTopChange?.(page.id, scrollContainerRef.current.scrollTop);
        }}
      >
        <RichTextEditor
          // Re-mount editor when switching pages to ensure initialContent resets.
          key={`${page.id}:${collab.enabled ? 'collab' : 'legacy'}`}
          value={docJson}
          editable={editable}
          focusRequest={focusRequest}
          focusRequestToken={focusRequestToken}
          onChange={onUpdateDoc}
          className={
            editable
              ? 'bg-zinc-900 [&_.bn-editor]:!bg-zinc-900 [&_.bn-container]:!bg-zinc-900'
              : 'bg-black [&_.bn-editor]:!bg-black [&_.bn-container]:!bg-black'
          }
          entities={entities}
          onEntityClick={onEntityClick}
          attachmentContext={{
            projectId,
            entityPk: page.id,
            values: page.properties ?? {},
            onServerEntity,
          }}
          collaboration={
            collab.enabled
              ? {
                  provider: collab.provider,
                  fragment: collab.fragment,
                  user: collab.user,
                }
              : undefined
          }
          getDocRef={collab.enabled ? getDocRef : undefined}
        />
        {footer ? <div className="mt-6">{footer}</div> : null}
      </div>
    </div>
  );
}

function highlightFirstMatch(container: HTMLElement, query: string): boolean {
  const lowerQuery = query.toLowerCase();
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const text = node.textContent ?? '';
    const idx = text.toLowerCase().indexOf(lowerQuery);
    if (idx >= 0) {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + query.length);
      const highlight = document.createElement('span');
      highlight.className = 'bg-yellow-500/30 text-yellow-100 rounded-sm px-0.5';
      try {
        range.surroundContents(highlight);
      } catch {
        return false;
      }
      const parentElement = highlight.parentElement;
      if (parentElement) {
        const parentRect = container.getBoundingClientRect();
        const rect = highlight.getBoundingClientRect();
        container.scrollTop += rect.top - parentRect.top - parentRect.height / 3;
      } else {
        highlight.scrollIntoView({ block: 'center' });
      }
      window.setTimeout(() => {
        if (!highlight.parentNode) return;
        const parent = highlight.parentNode;
        while (highlight.firstChild) {
          parent.insertBefore(highlight.firstChild, highlight);
        }
        parent.removeChild(highlight);
        if (parent instanceof HTMLElement) parent.normalize();
      }, 1200);
      return true;
    }
    node = walker.nextNode();
  }
  return false;
}
