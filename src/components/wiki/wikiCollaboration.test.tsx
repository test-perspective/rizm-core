import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { useWikiCollaboration } from './wikiCollaboration';

const saveWikiCollabStateMock = vi.fn();

vi.mock('../../api/projects', () => ({
  saveWikiCollabState: (...args: unknown[]) => saveWikiCollabStateMock(...args),
}));

vi.mock('../../utils/storage', () => ({
  getBackendUrl: () => 'http://test.example',
}));

vi.mock('@hocuspocus/provider', () => ({
  HocuspocusProvider: class {
    destroy() {}
  },
}));

function HookHarness(props: {
  docJson: string;
  onPersisted?: (payload: { doc: string; crdtBlob: number[] }) => void;
}) {
  useWikiCollaboration({
    enabled: true,
    projectId: 'project-1',
    pageId: 'page-1',
    docJson: props.docJson,
    onPersisted: props.onPersisted,
    getCurrentDoc: () => props.docJson,
  });
  return null;
}

function BlobHarness(props: { crdtBlob: number[] }) {
  const collab = useWikiCollaboration({
    enabled: true,
    projectId: 'project-1',
    pageId: 'page-1',
    docJson: '[]',
    crdtBlob: props.crdtBlob,
    getCurrentDoc: () => '[]',
  });
  return <div data-testid="fragment-length" data-length={String(collab.fragment.length)} />;
}

describe('useWikiCollaboration', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('flushes a pending collab persist on unmount', async () => {
    saveWikiCollabStateMock.mockReset().mockResolvedValue(undefined);
    const onPersisted = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<HookHarness docJson="[]" onPersisted={onPersisted} />);
    });

    act(() => {
      root.unmount();
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveWikiCollabStateMock).toHaveBeenCalledTimes(1);
    expect(saveWikiCollabStateMock).toHaveBeenCalledWith(
      'project-1',
      'page-1',
      expect.objectContaining({
        doc: '[]',
        crdtBlob: expect.any(Array),
      })
    );
    expect(onPersisted).toHaveBeenCalledWith(
      expect.objectContaining({
        doc: '[]',
        crdtBlob: expect.any(Array),
      })
    );

    container.remove();
  });

  it('applies initial CRDT blob before first render when blob already exists', async () => {
    const sourceDoc = new Y.Doc();
    sourceDoc.getXmlFragment('document-store').insert(0, [new Y.XmlElement('blockContainer')]);
    const crdtBlob = Array.from(Y.encodeStateAsUpdate(sourceDoc));

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<BlobHarness crdtBlob={crdtBlob} />);
    });

    expect(container.querySelector('[data-testid="fragment-length"]')?.getAttribute('data-length')).toBe('1');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
