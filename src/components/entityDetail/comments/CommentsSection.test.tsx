import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import type { Entity } from '../../../types';
import { CommentsSection } from './CommentsSection';

vi.mock('../../RichTextEditor', () => ({
  RichTextEditor: ({
    onChange,
  }: {
    onChange?: (doc: string) => void;
  }) => (
    <div data-testid="comment-composer-richtext-mock">
      <button
        type="button"
        data-testid="comment-composer-simulate-type"
        onClick={() =>
          onChange?.(
            JSON.stringify([
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'hello', styles: {} }],
                children: [],
              },
            ])
          )
        }
      >
        Simulate type
      </button>
    </div>
  ),
}));

const entity: Entity = {
  id: 'entity-1',
  entityId: 'task',
  createdAt: 0,
  updatedAt: 0,
  properties: {},
};

const defaultHandlers = {
  onAddComment: () => true,
  onEditComment: () => {},
  onCommentDraftChange: () => {},
  onSaveComment: () => {},
  onCancelEditComment: () => {},
  onDeleteComment: () => {},
  onNewCommentDraftChange: () => {},
};

describe('CommentsSection', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('shows collapsed composer and hides rich text editor until expanded', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommentsSection
          entity={entity}
          comments={[]}
          canComment
          entities={[]}
          {...defaultHandlers}
          editingCommentId={null}
          commentDraftById={{}}
          commentDirtyById={{}}
        />
      );
    });

    expect(container.querySelector('[data-testid="comment-composer-collapsed"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="comment-composer-expanded"]')).toBeNull();
    expect(container.querySelector('[data-testid="comment-composer-richtext-mock"]')).toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('expands composer on collapsed control click', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommentsSection
          entity={entity}
          comments={[]}
          canComment
          entities={[]}
          {...defaultHandlers}
          editingCommentId={null}
          commentDraftById={{}}
          commentDirtyById={{}}
        />
      );
    });

    const collapsed = container.querySelector('[data-testid="comment-composer-collapsed"]') as HTMLButtonElement;
    expect(collapsed).not.toBeNull();

    await act(async () => {
      collapsed.click();
    });

    expect(container.querySelector('[data-testid="comment-composer-expanded"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="comment-composer-richtext-mock"]')).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('keeps composer expanded when draft has content', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommentsSection
          entity={entity}
          comments={[]}
          canComment
          entities={[]}
          {...defaultHandlers}
          editingCommentId={null}
          commentDraftById={{}}
          commentDirtyById={{}}
        />
      );
    });

    await act(async () => {
      (container.querySelector('[data-testid="comment-composer-collapsed"]') as HTMLButtonElement).click();
    });

    await act(async () => {
      (container.querySelector('[data-testid="comment-composer-simulate-type"]') as HTMLButtonElement).click();
    });

    expect(container.querySelector('[data-testid="comment-composer-expanded"]')).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('resets composer when entity id changes', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommentsSection
          entity={entity}
          comments={[]}
          canComment
          entities={[]}
          {...defaultHandlers}
          editingCommentId={null}
          commentDraftById={{}}
          commentDirtyById={{}}
        />
      );
    });

    await act(async () => {
      (container.querySelector('[data-testid="comment-composer-collapsed"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      (container.querySelector('[data-testid="comment-composer-simulate-type"]') as HTMLButtonElement).click();
    });

    const other: Entity = { ...entity, id: 'entity-2' };
    await act(async () => {
      root.render(
        <CommentsSection
          entity={other}
          comments={[]}
          canComment
          entities={[]}
          {...defaultHandlers}
          editingCommentId={null}
          commentDraftById={{}}
          commentDirtyById={{}}
        />
      );
    });

    expect(container.querySelector('[data-testid="comment-composer-collapsed"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="comment-composer-expanded"]')).toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('collapses composer after successful add', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommentsSection
          entity={entity}
          comments={[]}
          canComment
          entities={[]}
          {...defaultHandlers}
          onAddComment={() => true}
          editingCommentId={null}
          commentDraftById={{}}
          commentDirtyById={{}}
        />
      );
    });

    await act(async () => {
      (container.querySelector('[data-testid="comment-composer-collapsed"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      (container.querySelector('[data-testid="comment-composer-simulate-type"]') as HTMLButtonElement).click();
    });

    const addBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Add');
    expect(addBtn).toBeDefined();

    await act(async () => {
      addBtn!.click();
    });

    expect(container.querySelector('[data-testid="comment-composer-collapsed"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="comment-composer-expanded"]')).toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows read-only hint without expand control when cannot comment', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommentsSection
          entity={entity}
          comments={[]}
          canComment={false}
          entities={[]}
          {...defaultHandlers}
          editingCommentId={null}
          commentDraftById={{}}
          commentDirtyById={{}}
        />
      );
    });

    expect(container.textContent).toContain('Read-only access cannot add comments.');
    expect(container.querySelector('[data-testid="comment-composer-collapsed"]')).toBeNull();
    expect(container.querySelector('[data-testid="comment-composer-expanded"]')).toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
