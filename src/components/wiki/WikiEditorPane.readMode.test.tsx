import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import type { Entity } from '../../types';
import { WikiEditorPane } from './WikiEditorPane';
import { page } from './WikiEditorPane.test.helpers';

vi.mock('./WikiEditor', () => ({
  WikiEditor: (_props: { page: Entity; docJson: string | undefined; onUpdateDoc: (doc: string) => void }) => (
    <div>
      <div data-id="block-1">Block</div>
      <div data-id="block-2">
        <a href="/foo">Link text</a>
      </div>
      <span data-keel-task-link>REQ-1</span>
    </div>
  ),
}));

describe('WikiEditorPane read-mode click handling', () => {
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
});
