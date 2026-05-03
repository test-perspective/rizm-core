import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import type { Entity } from '../../types';
import { WikiEditorPane } from './WikiEditorPane';
import { defaultPaneProps, page } from './WikiEditorPane.test.helpers';

vi.mock('./WikiEditor', () => ({
  WikiEditor: (_props: { page: Entity; docJson: string | undefined; onUpdateDoc: (doc: string) => void }) => (
    <div>
      <div data-id="block-1">Block</div>
    </div>
  ),
}));

describe('WikiEditorPane loading / empty states', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
