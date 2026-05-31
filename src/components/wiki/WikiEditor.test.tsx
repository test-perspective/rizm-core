import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { createRoot } from 'react-dom/client';
import type { Entity } from '../../types';
import { WikiEditor } from './WikiEditor';

vi.mock('../RichTextEditor', () => ({
  RichTextEditor: ({ className }: { className?: string }) => (
    <div data-testid="rich-text-editor" className={className ?? ''} />
  ),
}));

const page: Entity = {
  id: 'page-1',
  entityId: 'wiki',
  createdAt: 0,
  updatedAt: 0,
  properties: {},
};

describe('WikiEditor', () => {
  let rafSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    rafSpy.mockRestore();
  });

  it('passes wiki-rich-text-editor class to RichTextEditor', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <WikiEditor
          projectId="project-1"
          page={page}
          docJson="[]"
          editable={false}
          mode="read"
          onUpdateDoc={() => {}}
        />
      );
    });

    const editor = container.querySelector('[data-testid="rich-text-editor"]');
    expect(editor?.className).toContain('wiki-rich-text-editor');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('includes scroll container classes for internal scrolling', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <WikiEditor
          projectId="project-1"
          page={page}
          docJson="[]"
          editable={false}
          mode="read"
          onUpdateDoc={() => {}}
        />
      );
    });

    const scrollContainer = container.querySelector('.overflow-auto');
    expect(scrollContainer?.className).toContain('overflow-auto');
    expect(scrollContainer?.className).toContain('overscroll-contain');
    expect(scrollContainer?.className).toContain('min-h-0');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('restores scroll position when entering edit mode', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <WikiEditor
          projectId="project-1"
          page={page}
          docJson="[]"
          editable={false}
          mode="read"
          restoreScrollTop={120}
          onUpdateDoc={() => {}}
        />
      );
    });

    const scrollContainer = container.querySelector('.overflow-auto') as HTMLDivElement | null;
    expect(scrollContainer).not.toBeNull();
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }

    await act(async () => {
      root.render(
        <WikiEditor
          projectId="project-1"
          page={page}
          docJson="[]"
          editable={true}
          mode="edit"
          restoreScrollTop={120}
          onUpdateDoc={() => {}}
        />
      );
    });

    expect(scrollContainer?.scrollTop).toBe(120);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
