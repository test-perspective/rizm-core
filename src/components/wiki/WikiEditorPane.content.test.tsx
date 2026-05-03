import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import type { Entity } from '../../types';
import { WikiEditorPane } from './WikiEditorPane';
import { defaultPaneProps, page } from './WikiEditorPane.test.helpers';

let lastWikiEditorProps: {
  page: Entity;
  docJson: string | undefined;
  onUpdateDoc: (doc: string) => void;
} | null = null;

vi.mock('./WikiEditor', () => ({
  WikiEditor: (props: { page: Entity; docJson: string | undefined; onUpdateDoc: (doc: string) => void }) => {
    lastWikiEditorProps = props;
    return (
      <div>
        <div data-id="block-1">Block</div>
      </div>
    );
  },
}));

describe('WikiEditorPane content / title propagation', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
});
