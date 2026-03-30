/**
 * REQ-240: Tests for arrow (->) and symbol conversion in RichTextEditor.
 * Verifies conversion runs with collaboration enabled and is not blocked by mayLose.
 */
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { RichTextEditor } from './RichTextEditor';
import type { ReactNode } from 'react';

const updateBlockMock = vi.fn();
const setTextCursorPositionMock = vi.fn();
let editorRef: Record<string, unknown> | null = null;
let editorChangeCallbacks: Array<(editor: unknown, ctx: { getChanges: () => unknown[] }) => void> = [];

const uploadAttachmentsApiMock = vi.fn();
vi.mock('../api/attachments', () => ({
  uploadAttachmentsApi: (...args: unknown[]) => uploadAttachmentsApiMock(...args),
}));

vi.mock('../auth/api', () => ({
  apiBaseUrl: () => 'http://test.example',
}));

vi.mock('@blocknote/react', () => ({
  useCreateBlockNote: (options: Record<string, unknown>) => {
    editorRef = {
      setTextCursorPosition: setTextCursorPositionMock,
      getTextCursorPosition: vi.fn(),
      updateBlock: updateBlockMock,
      document: [],
    };
    return editorRef;
  },
  useEditorChange: (callback: (editor: unknown, ctx: { getChanges: () => unknown[] }) => void, _editor: unknown) => {
    editorChangeCallbacks.push(callback);
  },
  createReactInlineContentSpec: () => ({}),
  createReactBlockSpec: () => () => ({ config: {}, implementation: {} }),
  getDefaultReactSlashMenuItems: () => [],
  SuggestionMenuController: () => null,
}));

vi.mock('@blocknote/ariakit', () => ({
  BlockNoteView: (props: Record<string, unknown> & { children?: ReactNode }) => (
    <div data-testid="blocknote-view">
      <div contentEditable="true" />
      {props.children}
    </div>
  ),
}));

vi.mock('./richText/StableFormattingToolbarController', () => ({
  StableFormattingToolbarController: () => <div data-testid="stable-formatting-toolbar-controller" />,
}));

vi.mock('./richText/StatusDialog', () => ({
  StatusDialog: () => null,
}));

vi.mock('@blocknote/core', () => ({
  BlockNoteSchema: { create: () => ({}) },
  defaultInlineContentSpecs: {},
}));

vi.mock('@blocknote/core/extensions', () => ({
  filterSuggestionItems: (items: unknown[]) => items,
}));

const mockCollaboration = {
  provider: {},
  fragment: {},
  user: { name: 'Test', color: '#000' },
};

describe('RichTextEditor symbol conversion (REQ-240)', () => {
  let rafSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    updateBlockMock.mockClear();
    setTextCursorPositionMock.mockClear();
    editorRef = null;
    editorChangeCallbacks = [];
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    rafSpy.mockRestore();
  });

  const runConversionCallback = (
    blockContent: unknown[],
    sourceType = 'input',
    documentBlocks: Array<{ id: string; content?: unknown }> = []
  ) => {
    const blockId = 'block-1';
    const change = {
      block: { id: blockId, content: blockContent },
      source: { type: sourceType },
    };
    const editor = {
      ...editorRef,
      document: documentBlocks.length
        ? documentBlocks
        : [{ id: blockId, content: blockContent, type: 'paragraph' }],
    };
    const conversionCallback = editorChangeCallbacks[0];
    if (!conversionCallback) throw new Error('useEditorChange callback not registered');
    conversionCallback(editor, { getChanges: () => [change] });
  };

  it('converts "->" to arrow symbol when collaboration is enabled', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RichTextEditor
          value="[]"
          editable={true}
          onChange={() => {}}
          collaboration={mockCollaboration}
        />
      );
    });

    runConversionCallback([{ type: 'text', text: 'a ->' }], 'input', [
      { id: 'block-1', content: [{ type: 'text', text: 'a ->' }] },
    ]);

    expect(updateBlockMock).toHaveBeenCalledWith(
      'block-1',
      expect.objectContaining({
        content: [{ type: 'text', text: 'a →', styles: {} }],
      })
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('converts "->" to arrow even when mayLose would block (symbol conversion shortens content)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RichTextEditor
          value="[]"
          editable={true}
          onChange={() => {}}
          collaboration={mockCollaboration}
        />
      );
    });

    const blockContent = [{ type: 'text', text: 'a ->', styles: {} as Record<string, unknown> }];
    runConversionCallback(blockContent, 'input', [
      { id: 'block-1', content: blockContent },
    ]);

    expect(updateBlockMock).toHaveBeenCalledWith(
      'block-1',
      expect.objectContaining({
        content: [{ type: 'text', text: 'a →', styles: {} }],
      })
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('converts "=>" to double arrow when collaboration is enabled', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RichTextEditor
          value="[]"
          editable={true}
          onChange={() => {}}
          collaboration={mockCollaboration}
        />
      );
    });

    runConversionCallback([{ type: 'text', text: 'test =>' }], 'input', [
      { id: 'block-1', content: [{ type: 'text', text: 'test =>' }] },
    ]);

    expect(updateBlockMock).toHaveBeenCalledWith(
      'block-1',
      expect.objectContaining({
        content: [{ type: 'text', text: 'test ⇒', styles: {} }],
      })
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('skips yjs-remote changes', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RichTextEditor
          value="[]"
          editable={true}
          onChange={() => {}}
          collaboration={mockCollaboration}
        />
      );
    });

    runConversionCallback([{ type: 'text', text: 'a ->' }], 'yjs-remote', [
      { id: 'block-1', content: [{ type: 'text', text: 'a ->' }] },
    ]);

    expect(updateBlockMock).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
