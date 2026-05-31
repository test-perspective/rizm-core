import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { RichTextEditor } from './RichTextEditor';
import type { ReactNode } from 'react';

const setTextCursorPosition = vi.fn();
let lastCreateOptions: Record<string, any> | null = null;
let lastBlockNoteViewProps: Record<string, any> | null = null;

const uploadAttachmentsApiMock = vi.fn();
vi.mock('../api/attachments', () => ({
  uploadAttachmentsApi: (...args: unknown[]) => uploadAttachmentsApiMock(...args),
}));

vi.mock('../auth/api', () => ({
  apiBaseUrl: () => 'http://test.example',
}));

vi.mock('@blocknote/react', () => ({
  useCreateBlockNote: (options: Record<string, any>) => {
    lastCreateOptions = options ?? null;
    return {
      setTextCursorPosition,
      getTextCursorPosition: vi.fn(),
      updateBlock: vi.fn(),
      document: [],
    };
  },
  useEditorChange: () => {},
  createReactInlineContentSpec: () => ({}),
  createReactBlockSpec: () => () => ({ config: {}, implementation: {} }),
  getDefaultReactSlashMenuItems: () => [],
  SuggestionMenuController: () => null,
}));

vi.mock('@blocknote/ariakit', () => ({
  BlockNoteView: (props: Record<string, unknown> & { children?: ReactNode }) => {
    lastBlockNoteViewProps = props;
    return (
    <div data-testid="blocknote-view">
      <div contentEditable="true" />
      {props.children}
    </div>
    );
  },
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

describe('RichTextEditor', () => {
  let rafSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    setTextCursorPosition.mockClear();
    lastCreateOptions = null;
    lastBlockNoteViewProps = null;
    uploadAttachmentsApiMock.mockReset();
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    rafSpy.mockRestore();
  });

  it('moves cursor to block when focus request token is set', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RichTextEditor
          value="[]"
          editable={true}
          focusRequest={{ blockId: 'block-1' }}
          focusRequestToken={1}
          onChange={() => {}}
        />
      );
    });

    expect(setTextCursorPosition).toHaveBeenCalledWith('block-1', 'end');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('does not move cursor without focus request token', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<RichTextEditor value="[]" editable={true} onChange={() => {}} />);
    });

    expect(setTextCursorPosition).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('provides uploadFile when attachment context exists', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RichTextEditor
          value="[]"
          editable={true}
          onChange={() => {}}
          attachmentContext={{ projectId: 'p1', entityPk: 'e1', values: {} }}
        />
      );
    });

    expect(typeof lastCreateOptions?.uploadFile).toBe('function');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('forces dark theme and uses custom formatting toolbar controller', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<RichTextEditor value="[]" editable={true} onChange={() => {}} />);
    });

    expect(lastBlockNoteViewProps?.theme).toBe('dark');
    expect(lastBlockNoteViewProps?.formattingToolbar).toBe(false);
    expect(container.querySelector('[data-testid="stable-formatting-toolbar-controller"]')).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('provides pasteHandler when attachment context exists', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RichTextEditor
          value="[]"
          editable={true}
          onChange={() => {}}
          attachmentContext={{ projectId: 'p1', entityPk: 'e1', values: {} }}
        />
      );
    });

    expect(typeof lastCreateOptions?.pasteHandler).toBe('function');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('pasteHandler uploads data:image in HTML and calls pasteHTML with persistent URL', async () => {
    const uploadedUrl = 'http://test.example/api/projects/p1/entities/e1/attachments/att-1';
    uploadAttachmentsApiMock.mockResolvedValue({
      entity: {
        id: 'e1',
        properties: {
          attachments: [
            { id: 'att-1', fileName: 'pasted-0.png', size: 100, createdAt: 0 },
          ],
        },
      },
      etag: '"1"',
    });

    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      if (typeof input === 'string' && input.startsWith('data:')) {
        return Promise.resolve({
          blob: () => Promise.resolve(new Blob([''], { type: 'image/png' })),
        } as Response);
      }
      return Promise.reject(new Error('unexpected fetch'));
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RichTextEditor
          value="[]"
          editable={true}
          onChange={() => {}}
          attachmentContext={{ projectId: 'p1', entityPk: 'e1', values: {} }}
        />
      );
    });

    const pasteHandler = lastCreateOptions?.pasteHandler;
    expect(pasteHandler).toBeDefined();

    const pasteHTMLMock = vi.fn();
    const defaultPasteHandlerMock = vi.fn().mockReturnValue(true);
    const event = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: (t: string) => (t === 'text/html' ? `<p>text</p><img src="${dataUrl}">` : ''),
      },
    } as unknown as ClipboardEvent;

    const result = pasteHandler({
      event,
      editor: { pasteHTML: pasteHTMLMock },
      defaultPasteHandler: defaultPasteHandlerMock,
    });

    expect(result).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(defaultPasteHandlerMock).not.toHaveBeenCalled();

    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(uploadAttachmentsApiMock).toHaveBeenCalled();
    expect(pasteHTMLMock).toHaveBeenCalledWith(expect.stringContaining(uploadedUrl));
    expect(pasteHTMLMock.mock.calls[0][0]).not.toContain('data:image/');

    fetchSpy.mockRestore();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('pasteHandler delegates to defaultPasteHandler when HTML has no data/blob image', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RichTextEditor
          value="[]"
          editable={true}
          onChange={() => {}}
          attachmentContext={{ projectId: 'p1', entityPk: 'e1', values: {} }}
        />
      );
    });

    const defaultPasteHandlerMock = vi.fn().mockReturnValue(true);
    const event = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: (t: string) => (t === 'text/html' ? '<p>plain text only</p>' : ''),
      },
    } as unknown as ClipboardEvent;

    const result = lastCreateOptions?.pasteHandler({
      event,
      editor: { pasteHTML: vi.fn() },
      defaultPasteHandler: defaultPasteHandlerMock,
    });

    expect(result).toBe(true);
    expect(defaultPasteHandlerMock).toHaveBeenCalled();
    expect(uploadAttachmentsApiMock).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('pasteHandler prefers markdown for asterisk lists even when clipboard also has HTML', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<RichTextEditor value="[]" editable={true} onChange={() => {}} />);
    });

    const insertInlineContentMock = vi.fn();
    const pasteMarkdownMock = vi.fn();
    const defaultPasteHandlerMock = vi.fn().mockReturnValue(true);
    const markdown = '* 455\n  * asasa\n  * fdfdf';
    const event = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: (t: string) =>
          t === 'text/plain'
            ? markdown
            : t === 'text/html'
              ? '<div>* 455<br>&nbsp;&nbsp;* asasa<br>&nbsp;&nbsp;* fdfdf</div>'
              : '',
      },
    } as unknown as ClipboardEvent;

    const result = lastCreateOptions?.pasteHandler({
      event,
      editor: {
        getTextCursorPosition: () => ({
          block: { id: 'list-1', type: 'bulletListItem', content: [] },
        }),
        insertInlineContent: insertInlineContentMock,
        pasteHTML: vi.fn(),
        pasteMarkdown: pasteMarkdownMock,
      },
      defaultPasteHandler: defaultPasteHandlerMock,
    });

    expect(result).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(pasteMarkdownMock).toHaveBeenCalledWith(markdown);
    expect(insertInlineContentMock).not.toHaveBeenCalled();
    expect(defaultPasteHandlerMock).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('pasteHandler prefers markdown tables from generated answers even when HTML exists', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<RichTextEditor value="[]" editable={true} onChange={() => {}} />);
    });

    const pasteMarkdownMock = vi.fn();
    const defaultPasteHandlerMock = vi.fn().mockReturnValue(true);
    const markdown = '| Name | Value |\n| --- | --- |\n| alpha | 1 |';
    const event = {
      preventDefault: vi.fn(),
      clipboardData: {
        getData: (t: string) =>
          t === 'text/plain'
            ? markdown
            : t === 'text/html'
              ? '<div><pre>| Name | Value |<br>| --- | --- |<br>| alpha | 1 |</pre></div>'
              : '',
      },
    } as unknown as ClipboardEvent;

    const result = lastCreateOptions?.pasteHandler({
      event,
      editor: {
        pasteHTML: vi.fn(),
        pasteMarkdown: pasteMarkdownMock,
      },
      defaultPasteHandler: defaultPasteHandlerMock,
    });

    expect(result).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(pasteMarkdownMock).toHaveBeenCalledWith(markdown);
    expect(defaultPasteHandlerMock).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('pasteHandler keeps Confluence HTML table paste on the default HTML path', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<RichTextEditor value="[]" editable={true} onChange={() => {}} />);
    });

    const pasteMarkdownMock = vi.fn();
    const defaultPasteHandlerMock = vi.fn().mockReturnValue(true);
    const event = {
      clipboardData: {
        getData: (t: string) =>
          t === 'text/plain'
            ? 'Name\tValue\nalpha\t1'
            : t === 'text/html'
              ? '<table><tbody><tr><th>Name</th><th>Value</th></tr><tr><td>alpha</td><td>1</td></tr></tbody></table>'
              : '',
      },
    } as unknown as ClipboardEvent;

    const result = lastCreateOptions?.pasteHandler({
      event,
      editor: {
        pasteHTML: vi.fn(),
        pasteMarkdown: pasteMarkdownMock,
      },
      defaultPasteHandler: defaultPasteHandlerMock,
    });

    expect(result).toBe(true);
    expect(pasteMarkdownMock).not.toHaveBeenCalled();
    expect(defaultPasteHandlerMock).toHaveBeenCalledWith({
      prioritizeMarkdownOverHTML: true,
      plainTextAsMarkdown: true,
    });

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('keeps empty bullet list item type by using temporary paste guard and then cleans it up', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<RichTextEditor value="[]" editable={true} onChange={() => {}} />);
    });

    const pasteHandler = lastCreateOptions?.pasteHandler;
    expect(typeof pasteHandler).toBe('function');

    const insertInlineContentMock = vi.fn();
    const updateBlockMock = vi.fn();
    const getBlockMock = vi.fn().mockReturnValue({
      id: 'list-1',
      type: 'bulletListItem',
      content: [{ type: 'text', text: '\u200Bpasted text' }],
    });
    const defaultPasteHandlerMock = vi.fn().mockReturnValue(true);

    const result = pasteHandler({
      event: {
        clipboardData: {
          getData: () => '',
        },
      } as unknown as ClipboardEvent,
      editor: {
        getTextCursorPosition: () => ({
          block: { id: 'list-1', type: 'bulletListItem', content: [] },
        }),
        insertInlineContent: insertInlineContentMock,
        getBlock: getBlockMock,
        updateBlock: updateBlockMock,
        document: [],
      },
      defaultPasteHandler: defaultPasteHandlerMock,
    });

    expect(result).toBe(true);
    expect(insertInlineContentMock).toHaveBeenCalledWith('\u200B');
    expect(defaultPasteHandlerMock).toHaveBeenCalled();

    await new Promise((r) => setTimeout(r, 0));
    expect(getBlockMock).toHaveBeenCalledWith('list-1');
    expect(updateBlockMock).toHaveBeenCalledWith('list-1', {
      content: [{ type: 'text', text: 'pasted text' }],
    });

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('passes linkToolbar=false and sideMenu=false when editable=false', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<RichTextEditor value="[]" editable={false} onChange={() => {}} />);
    });

    expect(lastBlockNoteViewProps?.linkToolbar).toBe(false);
    expect(lastBlockNoteViewProps?.sideMenu).toBe(false);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('unmounts without throwing when unmounted before deferred callbacks run', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<RichTextEditor value="[]" editable={true} onChange={() => {}} />);
    });

    act(() => {
      root.unmount();
    });
    container.remove();

    await new Promise((r) => setTimeout(r, 50));
  });
});
