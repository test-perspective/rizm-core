import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useRef, useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Entity } from '../../types';
import { useWikiSync } from './useWikiSync';

const fetchWikiPage = vi.fn();
const fetchWikiPages = vi.fn();

vi.mock('../../api/projects', () => ({
  fetchWikiPage: (...args: unknown[]) => fetchWikiPage(...args),
  fetchWikiPages: (...args: unknown[]) => fetchWikiPages(...args),
}));

const page = (overrides?: Partial<Entity>): Entity => ({
  id: 'page-1',
  entityId: 'wiki',
  createdAt: 0,
  updatedAt: 10,
  properties: {},
  ...overrides,
});

function Harness({ pages, selectedPageId }: { pages: Entity[]; selectedPageId: string | null }) {
  const [mode, setMode] = useState<'edit' | 'read'>('read');
  const [docById, setDocById] = useState<Record<string, string | undefined>>({});
  const [lastSavedDocById, setLastSavedDocById] = useState<Record<string, string | undefined>>({});
  const [titleById, setTitleById] = useState<Record<string, string>>({});
  const [lastSavedTitleById, setLastSavedTitleById] = useState<Record<string, string | undefined>>({});
  const [crdtBlobById, setCrdtBlobById] = useState<Record<string, number[] | undefined>>({});
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  const [editorResetTokenById, setEditorResetTokenById] = useState<Record<string, number>>({});
  const [commentValues, setCommentValues] = useState<Record<string, any>>({});

  const docByIdRef = useRef(docById);
  const lastSavedDocByIdRef = useRef(lastSavedDocById);
  const titleByIdRef = useRef(titleById);
  const lastSavedTitleByIdRef = useRef(lastSavedTitleById);
  const lastSyncedUpdatedAtByIdRef = useRef<Record<string, number>>({});
  const pagesRef = useRef(pages);
  const projectIdRef = useRef('project-1');
  const listSyncInFlightRef = useRef(false);
  const pageSyncInFlightRef = useRef(false);
  const onRefreshProjectRef = useRef<(() => void | Promise<unknown>) | undefined>(undefined);
  const selectedPageIdRef = useRef<string | null>(null);
  const autoEditPageIdRef = useRef<string | null>(null);
  const commentValuesRef = useRef<Record<string, any>>({});
  const commentValuesPageIdRef = useRef<string | null>(null);
  const editingCommentIdRef = useRef<string | null>(null);
  const commentDirtyByIdRef = useRef<Record<string, boolean>>({});
  const newCommentDraftRef = useRef({ hasDraft: false });

  docByIdRef.current = docById;
  lastSavedDocByIdRef.current = lastSavedDocById;
  titleByIdRef.current = titleById;
  lastSavedTitleByIdRef.current = lastSavedTitleById;
  pagesRef.current = pages;
  commentValuesRef.current = commentValues;

  useWikiSync({
    canEditPage: true,
    setMode,
    selectedPageId,
    projectId: 'project-1',
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
    includeDocSaves: true,
    setEditorResetTokenById,
  });

  return (
    <div
      data-mode={mode}
      data-doc={JSON.stringify(docById)}
      data-last-saved-doc={JSON.stringify(lastSavedDocById)}
      data-loading-doc-id={loadingDocId ?? ''}
      data-title={JSON.stringify(titleById)}
      data-crdt={JSON.stringify(crdtBlobById)}
      data-editor-reset={JSON.stringify(editorResetTokenById)}
    />
  );
}

describe('useWikiSync', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('does not seed selected page with [] when properties.doc is empty', async () => {
    fetchWikiPage.mockReturnValue(new Promise(() => {}));
    fetchWikiPages.mockResolvedValue([]);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness pages={[page()]} selectedPageId="page-1" />);
    });

    expect(container.firstElementChild?.getAttribute('data-doc')).toBe('{}');
    expect(container.firstElementChild?.getAttribute('data-last-saved-doc')).toBe('{}');
    expect(container.firstElementChild?.getAttribute('data-loading-doc-id')).toBe('page-1');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('seeds selected page when properties.doc already has content', async () => {
    fetchWikiPage.mockReturnValue(new Promise(() => {}));
    fetchWikiPages.mockResolvedValue([]);
    const seededPage = page({
      properties: {
        doc: '[{"id":"b1","type":"paragraph","content":[{"type":"text","text":"Hello"}]}]',
        title: 'Title',
      },
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness pages={[seededPage]} selectedPageId="page-1" />);
    });

    expect(container.firstElementChild?.getAttribute('data-doc')).toContain('Hello');
    expect(container.firstElementChild?.getAttribute('data-last-saved-doc')).toContain('Hello');
    expect(container.firstElementChild?.getAttribute('data-title')).toContain('Title');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
