import React, { act, useState } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { useLocation } from 'react-router-dom';
import type { Entity } from '../types';
import { WikiView } from './WikiView';
import { useWikiAutosave } from './wiki/useWikiAutosave';
import { ApiError } from '../auth/api';

const fetchWikiPageMock = vi.fn();
vi.mock('react-router-dom', () => ({
  useLocation: vi.fn().mockReturnValue({
    pathname: '/',
    search: '',
    hash: '',
    state: null,
    key: 'default',
  }),
  useNavigate: () => vi.fn(),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', userId: 'u1', email: 'a@b.c', role: 'admin' } }),
}));

vi.mock('../api/projects', () => ({
  fetchWikiPage: (...args: unknown[]) => fetchWikiPageMock(...args),
  fetchWikiPages: vi.fn().mockResolvedValue([]),
}));

vi.mock('./dialogs', () => ({
  useAppDialog: () => ({ confirm: vi.fn().mockResolvedValue(false), alert: vi.fn() }),
}));

vi.mock('./wiki/useWikiAutosave', () => ({ useWikiAutosave: vi.fn() }));

const noop = () => {};
const noopRef = { current: null as string | null };
vi.mock('./entityDetail/useEntityComments', () => ({
  useEntityComments: () => ({
    comments: [],
    editingCommentId: null,
    commentDraftById: {},
    commentDirtyById: {},
    editingCommentIdRef: noopRef,
    commentDirtyByIdRef: { current: {} },
    newCommentDraftRef: { current: { hasDraft: false } },
    resetCommentState: noop,
    handleAddComment: () => false,
    handleEditComment: noop,
    handleCommentDraftChange: noop,
    handleSaveComment: noop,
    handleCancelEditComment: noop,
    handleDeleteComment: noop,
    handleNewCommentDraftChange: noop,
  }),
}));

let lastWikiEditorPaneProps: Record<string, unknown> | null = null;
vi.mock('./wiki/WikiEditorPane', () => ({
  WikiEditorPane: (props: Record<string, unknown> & { mode: string }) => {
    lastWikiEditorPaneProps = props;
    return React.createElement('div', { 'data-testid': 'wiki-editor-pane', 'data-mode': props.mode });
  },
}));

const basePage: Entity = {
  id: 'page-1',
  entityId: 'wikiPage',
  createdAt: 0,
  updatedAt: 0,
  properties: { title: 'Untitled', doc: '' },
};

function SidebarCreateWrapper() {
  const [pages, setPages] = useState<Entity[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  return (
    <WikiView
      projectId="p1"
      pages={pages}
      selectedPageId={selectedPageId}
      onSelectPage={setSelectedPageId}
      onCreatePage={(opts) => {
        const created = { ...basePage, id: 'new-page-1', properties: { ...basePage.properties, ...opts } };
        setPages((prev) => [...prev, created]);
        return created;
      }}
      onDeletePage={noop}
      onUpdatePage={noop}
    />
  );
}

describe('WikiView', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    fetchWikiPageMock.mockResolvedValue({ doc: '[]', title: 'Untitled', updatedAt: 0, comments: [] });
  });

  it('disables classic doc saves immediately after collab persist returns a CRDT blob', () => {
    const page = { ...basePage, id: 'page-collab', properties: { title: 'Untitled', doc: '[]' } };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <WikiView
          projectId="p1"
          pages={[page]}
          selectedPageId={page.id}
          onSelectPage={noop}
          onCreatePage={(opts) => ({ ...basePage, id: 'x', properties: { ...basePage.properties, ...opts } })}
          onDeletePage={noop}
          onUpdatePage={noop}
        />
      );
    });

    const calls = vi.mocked(useWikiAutosave).mock.calls;
    const autosaveBefore = (calls[calls.length - 1] as [unknown] | undefined)?.[0] as
      | { includeDocSaves?: boolean }
      | undefined;
    expect(autosaveBefore?.includeDocSaves).toBe(true);

    act(() => {
      (lastWikiEditorPaneProps?.onCollabPersisted as
        | ((pageId: string, payload: { doc: string; crdtBlob: number[] }) => void)
        | undefined)?.(page.id, {
        doc: '[{"id":"a","type":"paragraph","content":[{"type":"text","text":"hello","styles":{}}],"children":[]}]',
        crdtBlob: [1, 2, 3],
      });
    });

    const callsAfter = vi.mocked(useWikiAutosave).mock.calls;
    const autosaveAfter = (callsAfter[callsAfter.length - 1] as [unknown] | undefined)?.[0] as
      | { includeDocSaves?: boolean }
      | undefined;
    expect(autosaveAfter?.includeDocSaves).toBe(false);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('opens in edit mode when new page is created from sidebar (Add menu)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<SidebarCreateWrapper />);
    });

    const addButton = container.querySelector('button[aria-label="Add menu"]') as HTMLButtonElement | null;
    expect(addButton).not.toBeNull();

    act(() => {
      addButton?.click();
    });

    const createPageItem = Array.from(document.querySelectorAll('[role="menuitem"]')).find(
      (el) => el.textContent === 'Create top-level page'
    );
    expect(createPageItem).not.toBeNull();
    act(() => {
      (createPageItem as HTMLElement)?.click();
    });
    act(() => {});

    const pane = container.querySelector('[data-testid="wiki-editor-pane"]');
    expect(pane).not.toBeNull();
    expect(pane?.getAttribute('data-mode')).toBe('edit');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('opens in edit mode when navigating with state.wikiAutoEditEntityId (header New Page)', () => {
    const newPageId = 'header-created-page';
    const pages: Entity[] = [
      { ...basePage, id: newPageId, properties: { title: 'Untitled', doc: '' } },
    ];
    vi.mocked(useLocation).mockReturnValue({
      pathname: '/',
      search: '',
      hash: '',
      state: { wikiAutoEditEntityId: newPageId },
      key: 'default',
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <WikiView
          projectId="p1"
          pages={pages}
          selectedPageId={newPageId}
          onSelectPage={noop}
          onCreatePage={(opts) => ({ ...basePage, id: 'x', properties: { ...basePage.properties, ...opts } })}
          onDeletePage={noop}
          onUpdatePage={noop}
        />
      );
    });

    const pane = container.querySelector('[data-testid="wiki-editor-pane"]');
    expect(pane).not.toBeNull();
    expect(pane?.getAttribute('data-mode')).toBe('edit');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it.skip('REQ-241: sets docById to "[]" for newly created page when fetchWikiPage returns 404', () => {
    fetchWikiPageMock.mockRejectedValue(new ApiError(404, 'Not found'));

    const newPageId = 'header-created-page';
    const pages: Entity[] = [
      { ...basePage, id: newPageId, properties: { title: 'Untitled', doc: '' } },
    ];
    vi.mocked(useLocation).mockReturnValue({
      pathname: '/',
      search: '',
      hash: '',
      state: { wikiAutoEditEntityId: newPageId },
      key: 'default',
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <WikiView
          projectId="p1"
          pages={pages}
          selectedPageId={newPageId}
          onSelectPage={noop}
          onCreatePage={(opts) => ({ ...basePage, id: 'x', properties: { ...basePage.properties, ...opts } })}
          onDeletePage={noop}
          onUpdatePage={noop}
        />
      );
    });

    const docById = lastWikiEditorPaneProps?.docById as Record<string, string | undefined> | undefined;
    expect(docById).toBeDefined();
    expect(docById?.[newPageId]).toBe('[]');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
