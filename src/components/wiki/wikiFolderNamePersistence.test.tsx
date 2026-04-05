/**
 * Reproduction test for: folder name disappears right after creation.
 * Bug: When creating a folder, useWikiSync's applyRemotePage overwrites
 * the local title with remote.title when fetchWikiPage returns empty title
 * (race: server has not persisted the title yet).
 *
 * This test should FAIL until the bug is fixed.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useRef, useState } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entity } from '../../types';
import { useWikiSync } from './useWikiSync';

const fetchWikiPage = vi.fn();
const fetchWikiPages = vi.fn();

vi.mock('../../api/projects', () => ({
  fetchWikiPage: (...args: unknown[]) => fetchWikiPage(...args),
  fetchWikiPages: (...args: unknown[]) => fetchWikiPages(...args),
}));

const page = (overrides?: Partial<Entity>): Entity => ({
  id: 'folder-1',
  entityId: 'wiki',
  createdAt: 0,
  updatedAt: 5,
  properties: { nodeType: 'folder', title: '', doc: '' },
  ...overrides,
});

function Harness({
  pages,
  selectedPageId,
  initialTitleById,
  initialLastSavedTitleById,
}: {
  pages: Entity[];
  selectedPageId: string | null;
  initialTitleById?: Record<string, string>;
  initialLastSavedTitleById?: Record<string, string | undefined>;
}) {
  const [docById, setDocById] = useState<Record<string, string | undefined>>({});
  const [lastSavedDocById, setLastSavedDocById] = useState<Record<string, string | undefined>>({});
  const [titleById, setTitleById] = useState<Record<string, string>>(initialTitleById ?? {});
  const [lastSavedTitleById, setLastSavedTitleById] = useState<Record<string, string | undefined>>(
    initialLastSavedTitleById ?? {}
  );
  const [, setMode] = useState<'edit' | 'read'>('read');
  const [, setCrdtBlobById] = useState<Record<string, number[] | undefined>>({});
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  const [, setEditorResetTokenById] = useState<Record<string, number>>({});
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
      data-title={JSON.stringify(titleById)}
      data-loading-doc-id={loadingDocId ?? ''}
    />
  );
}

describe('wiki folder name persistence (useWikiSync)', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    fetchWikiPage.mockReset();
    fetchWikiPages.mockResolvedValue([]);
  });

  it('keeps folder name when fetchWikiPage returns empty title (race: server not persisted yet)', async () => {
    const folderName = 'My New Folder';
    const folderId = 'folder-1';
    const folderPage = page({ id: folderId, updatedAt: 5 });

    fetchWikiPage.mockResolvedValue({
      doc: '[]',
      title: '',
      updatedAt: 100,
      comments: [],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Harness
          pages={[folderPage]}
          selectedPageId={folderId}
          initialTitleById={{ [folderId]: folderName }}
          initialLastSavedTitleById={{ [folderId]: folderName }}
        />
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    const dataTitle = container.firstElementChild?.getAttribute('data-title') ?? '{}';
    const titleById = JSON.parse(dataTitle) as Record<string, string>;
    const displayedTitle = titleById[folderId] ?? '';

    expect(displayedTitle).toBe(folderName);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
