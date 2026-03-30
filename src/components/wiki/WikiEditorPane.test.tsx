import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import type { Entity } from '../../types';
import { WikiEditorPane } from './WikiEditorPane';

let lastWikiEditorProps: { page: Entity; docJson: string | undefined; onUpdateDoc: (doc: string) => void } | null = null;
vi.mock('./WikiEditor', () => ({
  WikiEditor: (props: { page: Entity; docJson?: string; onUpdateDoc: (doc: string) => void }) => {
    lastWikiEditorProps = props;
    return (
      <div>
        <div data-id="block-1">Block</div>
        <div data-id="block-2">
          <a href="/foo">Link text</a>
        </div>
        <span data-keel-task-link>REQ-1</span>
      </div>
    );
  },
}));

const page: Entity = {
  id: 'page-1',
  entityId: 'wiki',
  createdAt: 0,
  updatedAt: 0,
  properties: {},
};

const defaultPaneProps = {
  projectId: 'project-1' as const,
  canEdit: true,
  canComment: true,
  onAddComment: () => true,
  onEditComment: () => {},
  onCommentDraftChange: () => {},
  onSaveComment: () => {},
  onCancelEditComment: () => {},
  onDeleteComment: () => {},
  onNewCommentDraftChange: () => {},
  onTitleChange: () => {},
  onDocChange: () => {},
  onEditStart: () => {},
  onDone: () => {},
  entities: [] as Entity[],
  comments: [] as { id: string; doc: string; createdAt: number; authorId: string }[],
  editingCommentId: null as string | null,
  commentDraftById: {} as Record<string, string>,
  commentDirtyById: {} as Record<string, boolean>,
};

describe('WikiEditorPane', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('passes click anchor to onEditStart in read mode', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onEditStart = vi.fn();

    await act(async () => {
      root.render(
        <WikiEditorPane
          projectId="project-1"
          canEdit={true}
          canComment={true}
          mode="read"
          selected={page}
          titleById={{}}
          docById={{ [page.id]: '[]' }}
          editorResetTokenById={{}}
          loadingDocId={null}
          comments={[]}
          editingCommentId={null}
          commentDraftById={{}}
          commentDirtyById={{}}
          onAddComment={() => true}
          onEditComment={() => {}}
          onCommentDraftChange={() => {}}
          onSaveComment={() => {}}
          onCancelEditComment={() => {}}
          onDeleteComment={() => {}}
          onNewCommentDraftChange={() => {}}
          onTitleChange={() => {}}
          onDocChange={() => {}}
          onEditStart={onEditStart}
          onDone={() => {}}
          entities={[]}
        />
      );
    });

    const block = container.querySelector('[data-id="block-1"]') as HTMLElement | null;
    expect(block).not.toBeNull();
    act(() => {
      block?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 20 }));
    });

    expect(onEditStart).toHaveBeenCalledWith({
      blockId: 'block-1',
      clientX: 10,
      clientY: 20,
    });

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('does not call onEditStart when clicking link element in read mode', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onEditStart = vi.fn();

    await act(async () => {
      root.render(
        <WikiEditorPane
          projectId="project-1"
          canEdit={true}
          canComment={true}
          mode="read"
          selected={page}
          titleById={{}}
          docById={{ [page.id]: '[]' }}
          editorResetTokenById={{}}
          loadingDocId={null}
          comments={[]}
          editingCommentId={null}
          commentDraftById={{}}
          commentDirtyById={{}}
          onAddComment={() => true}
          onEditComment={() => {}}
          onCommentDraftChange={() => {}}
          onSaveComment={() => {}}
          onCancelEditComment={() => {}}
          onDeleteComment={() => {}}
          onNewCommentDraftChange={() => {}}
          onTitleChange={() => {}}
          onDocChange={() => {}}
          onEditStart={onEditStart}
          onDone={() => {}}
          entities={[]}
        />
      );
    });

    const link = container.querySelector('a[href="/foo"]') as HTMLElement | null;
    expect(link).not.toBeNull();
    act(() => {
      link?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 20 }));
    });

    expect(onEditStart).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('does not call onEditStart when clicking task link element in read mode', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onEditStart = vi.fn();

    await act(async () => {
      root.render(
        <WikiEditorPane
          projectId="project-1"
          canEdit={true}
          canComment={true}
          mode="read"
          selected={page}
          titleById={{}}
          docById={{ [page.id]: '[]' }}
          editorResetTokenById={{}}
          loadingDocId={null}
          comments={[]}
          editingCommentId={null}
          commentDraftById={{}}
          commentDirtyById={{}}
          onAddComment={() => true}
          onEditComment={() => {}}
          onCommentDraftChange={() => {}}
          onSaveComment={() => {}}
          onCancelEditComment={() => {}}
          onDeleteComment={() => {}}
          onNewCommentDraftChange={() => {}}
          onTitleChange={() => {}}
          onDocChange={() => {}}
          onEditStart={onEditStart}
          onDone={() => {}}
          entities={[]}
        />
      );
    });

    const taskLink = container.querySelector('[data-keel-task-link]') as HTMLElement | null;
    expect(taskLink).not.toBeNull();
    act(() => {
      taskLink?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 20 }));
    });

    expect(onEditStart).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows loading state when selected doc is unresolved', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <WikiEditorPane
          {...defaultPaneProps}
          mode="read"
          selected={page}
          titleById={{ [page.id]: 'Untitled' }}
          docById={{}}
          editorResetTokenById={{}}
          loadingDocId={page.id}
        />
      );
    });

    expect(container.textContent).toContain('Loading page...');
    expect(container.textContent).not.toContain('Failed to load page content');
    expect(container.querySelector('[data-id="block-1"]')).toBeNull();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('does not show spinner when doc is defined even if loading', async () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <WikiEditorPane
          {...defaultPaneProps}
          mode="read"
          selected={page}
          titleById={{ [page.id]: 'Untitled' }}
          docById={{ [page.id]: '[]' }}
          editorResetTokenById={{}}
          loadingDocId={page.id}
        />
      );
    });

    expect(container.querySelector('.animate-spin')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(container.querySelector('.animate-spin')).toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it('does not show spinner when not loading', async () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <WikiEditorPane
          {...defaultPaneProps}
          mode="read"
          selected={page}
          titleById={{ [page.id]: 'Untitled' }}
          docById={{ [page.id]: '[]' }}
          editorResetTokenById={{}}
          loadingDocId={null}
        />
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(container.querySelector('.animate-spin')).toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it('REQ-226: shows "Create a page to get started" when selected is null and pagesCount is 0', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <WikiEditorPane
          {...defaultPaneProps}
          mode="read"
          selected={null}
          titleById={{}}
          docById={{}}
          editorResetTokenById={{}}
          loadingDocId={null}
          pagesCount={0}
        />
      );
    });

    expect(container.textContent).toContain('Create a page to get started');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('REQ-226: shows "Select a page" when selected is null and pagesCount > 0', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <WikiEditorPane
          {...defaultPaneProps}
          mode="read"
          selected={null}
          titleById={{}}
          docById={{}}
          editorResetTokenById={{}}
          loadingDocId={null}
          pagesCount={1}
        />
      );
    });

    expect(container.textContent).toContain('Select a page');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows editor when docById has content for selected page', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const docWithContent = '[{"id":"b1","type":"paragraph","content":[{"type":"text","text":"Hello"}]}]';

    await act(async () => {
      root.render(
        <WikiEditorPane
          {...defaultPaneProps}
          mode="read"
          selected={page}
          titleById={{ [page.id]: 'Test' }}
          docById={{ [page.id]: docWithContent }}
          editorResetTokenById={{}}
          loadingDocId={null}
        />
      );
    });

    expect(container.querySelector('[data-id="block-1"]')).not.toBeNull();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows editor when docById empty but selected.properties.doc has content (from list)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const pageWithDoc = { ...page, properties: { doc: '[{"id":"b1","type":"paragraph","content":[]}]' } };

    await act(async () => {
      root.render(
        <WikiEditorPane
          {...defaultPaneProps}
          mode="read"
          selected={pageWithDoc}
          titleById={{ [page.id]: 'Test' }}
          docById={{}}
          editorResetTokenById={{}}
          loadingDocId={null}
        />
      );
    });

    expect(container.querySelector('[data-id="block-1"]')).not.toBeNull();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('content loss prevention: passes correct page and doc to editor for displayed page', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const pageA = { ...page, id: 'page-a' };
    const pageB = { ...page, id: 'page-b' };
    const docA = '[{"id":"a1","type":"paragraph","content":[{"type":"text","text":"Page A"}]}]';
    const docB = '[{"id":"b1","type":"paragraph","content":[{"type":"text","text":"Page B"}]}]';
    const docById = { 'page-a': docA, 'page-b': docB };
    const onDocChange = vi.fn();

    await act(async () => {
      root.render(
        <WikiEditorPane
          {...defaultPaneProps}
          mode="read"
          selected={pageA}
          titleById={{ [pageA.id]: 'A', [pageB.id]: 'B' }}
          docById={docById}
          editorResetTokenById={{}}
          loadingDocId={null}
          onDocChange={onDocChange}
        />
      );
    });
    expect(lastWikiEditorProps?.page.id).toBe('page-a');
    expect(lastWikiEditorProps?.docJson).toBe(docA);

    await act(async () => {
      root.render(
        <WikiEditorPane
          {...defaultPaneProps}
          mode="read"
          selected={pageB}
          titleById={{ [pageA.id]: 'A', [pageB.id]: 'B' }}
          docById={docById}
          editorResetTokenById={{}}
          loadingDocId={null}
          onDocChange={onDocChange}
        />
      );
    });
    expect(lastWikiEditorProps?.page.id).toBe('page-b');
    expect(lastWikiEditorProps?.docJson).toBe(docB);

    lastWikiEditorProps?.onUpdateDoc('[{"id":"b1","type":"paragraph","content":[{"type":"text","text":"Page B edited"}]}]');
    expect(onDocChange).toHaveBeenLastCalledWith('page-b', expect.any(String));

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows selected title immediately and overlays previous page during switch', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const pageA = { ...page, id: 'page-a', properties: { title: 'Page A' } };
    const pageB = { ...page, id: 'page-b', properties: { title: 'Page B' } };

    await act(async () => {
      root.render(
        <WikiEditorPane
          {...defaultPaneProps}
          mode="read"
          selected={pageA}
          titleById={{ 'page-a': 'Page A', 'page-b': 'Page B' }}
          docById={{ 'page-a': '[]' }}
          editorResetTokenById={{}}
          loadingDocId={null}
        />
      );
    });

    await act(async () => {
      root.render(
        <WikiEditorPane
          {...defaultPaneProps}
          mode="read"
          selected={pageB}
          titleById={{ 'page-a': 'Page A', 'page-b': 'Page B' }}
          docById={{ 'page-a': '[]' }}
          editorResetTokenById={{}}
          loadingDocId={null}
        />
      );
    });

    expect(container.textContent).toContain('Page B');
    expect(lastWikiEditorProps?.page.id).toBe('page-a');
    const overlay = container.querySelector('[aria-label="Loading page"]') as HTMLElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay?.className).toContain('bg-black');
    expect(overlay?.textContent).toBe('');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows loading instead of empty editor when docById empty and no properties.doc', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <WikiEditorPane
          {...defaultPaneProps}
          mode="read"
          selected={page}
          titleById={{ [page.id]: 'Test' }}
          docById={{}}
          editorResetTokenById={{}}
          loadingDocId={page.id}
        />
      );
    });

    expect(container.querySelector('[data-id="block-1"]')).toBeNull();
    expect(container.textContent).toContain('Loading page...');
    expect(container.textContent).not.toContain('Failed to load');
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('REQ-226: title has min-height when selected is null (0 wiki pages)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <WikiEditorPane
          {...defaultPaneProps}
          mode="read"
          selected={null}
          titleById={{}}
          docById={{}}
          editorResetTokenById={{}}
          loadingDocId={null}
          pagesCount={0}
        />
      );
    });

    const titleButton = container.querySelector('button[type="button"]');
    expect(titleButton).not.toBeNull();
    expect(titleButton?.className).toContain('min-h-[2.5rem]');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
