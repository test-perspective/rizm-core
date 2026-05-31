import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { BlockNoteEditor } from '@blocknote/core';
import { useRichTextPasteAndUpload } from './useRichTextPasteAndUpload';

type PasteHandler = ReturnType<typeof useRichTextPasteAndUpload>['pasteHandler'];

function PasteHandlerProbe({ onReady }: { onReady: (handler: PasteHandler) => void }) {
  const { pasteHandler } = useRichTextPasteAndUpload(
    async () => {
      throw new Error('upload is not used in this test');
    },
    undefined,
    undefined
  );
  onReady(pasteHandler);
  return null;
}

describe('useRichTextPasteAndUpload result behavior', () => {
  it('pastes asterisk nested markdown lists as BlockNote bullet list blocks', async () => {
    let pasteHandler = null as unknown as PasteHandler;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<PasteHandlerProbe onReady={(handler) => { pasteHandler = handler; }} />);
    });

    const markdown = '* 455\n  * asasa\n  * fdfdf';
    const parserEditor = BlockNoteEditor.create();
    let parsedBlocks: any[] = [];

    pasteHandler?.({
      event: {
        preventDefault: () => {},
        clipboardData: {
          getData: (type: string) =>
            type === 'text/plain'
              ? markdown
              : type === 'text/html'
                ? '<div>* 455<br>&nbsp;&nbsp;* asasa<br>&nbsp;&nbsp;* fdfdf</div>'
                : '',
        },
      } as unknown as ClipboardEvent,
      editor: {
        pasteHTML: () => {},
        pasteMarkdown: (value: string) => {
          parsedBlocks = parserEditor.tryParseMarkdownToBlocks(value);
        },
        insertInlineContent: () => {},
        updateBlock: () => {},
      },
      defaultPasteHandler: () => {
        throw new Error('markdown paste should not fall back to default handler');
      },
    });

    expect(parsedBlocks[0]?.type).toBe('bulletListItem');
    expect(parsedBlocks[0]?.content).toEqual([{ type: 'text', text: '455', styles: {} }]);
    expect(parsedBlocks[0]?.children).toHaveLength(2);
    expect(parsedBlocks[0]?.children?.[0]?.type).toBe('bulletListItem');
    expect(parsedBlocks[0]?.children?.[0]?.content).toEqual([
      { type: 'text', text: 'asasa', styles: {} },
    ]);
    expect(parsedBlocks[0]?.children?.[1]?.type).toBe('bulletListItem');
    expect(parsedBlocks[0]?.children?.[1]?.content).toEqual([
      { type: 'text', text: 'fdfdf', styles: {} },
    ]);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('keeps Confluence HTML tables on the HTML path and parses them as table blocks', async () => {
    let pasteHandler = null as unknown as PasteHandler;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<PasteHandlerProbe onReady={(handler) => { pasteHandler = handler; }} />);
    });

    const confluenceHtml =
      '<table data-layout="default"><tbody>' +
      '<tr><th><p>Name</p></th><th><p>Value</p></th></tr>' +
      '<tr><td><p>alpha</p></td><td><p>1</p></td></tr>' +
      '</tbody></table>';
    const parserEditor = BlockNoteEditor.create();
    let parsedBlocks: any[] = [];

    pasteHandler({
      event: {
        preventDefault: () => {},
        clipboardData: {
          getData: (type: string) =>
            type === 'text/plain'
              ? 'Name\tValue\nalpha\t1'
              : type === 'text/html'
                ? confluenceHtml
                : '',
        },
      } as unknown as ClipboardEvent,
      editor: {
        pasteHTML: () => {
          throw new Error('Confluence table paste should use the default paste handler');
        },
        pasteMarkdown: () => {
          throw new Error('Confluence table paste should not be forced through markdown');
        },
        insertInlineContent: () => {},
        updateBlock: () => {},
      },
      defaultPasteHandler: () => {
        parsedBlocks = parserEditor.tryParseHTMLToBlocks(confluenceHtml);
        return true;
      },
    });

    expect(parsedBlocks[0]?.type).toBe('table');
    expect(parsedBlocks[0]?.content?.rows).toHaveLength(2);
    expect(parsedBlocks[0]?.content?.rows?.[0]?.cells?.[0]?.content).toEqual([
      { type: 'text', text: 'Name', styles: {} },
    ]);
    expect(parsedBlocks[0]?.content?.rows?.[0]?.cells?.[1]?.content).toEqual([
      { type: 'text', text: 'Value', styles: {} },
    ]);
    expect(parsedBlocks[0]?.content?.rows?.[1]?.cells?.[0]?.content).toEqual([
      { type: 'text', text: 'alpha', styles: {} },
    ]);
    expect(parsedBlocks[0]?.content?.rows?.[1]?.cells?.[1]?.content).toEqual([
      { type: 'text', text: '1', styles: {} },
    ]);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('pastes wiki BlockNote HTML through the plain text path to avoid HTML parser hangs', async () => {
    let pasteHandler = null as unknown as PasteHandler;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<PasteHandlerProbe onReady={(handler) => { pasteHandler = handler; }} />);
    });

    const plainText = 'First wiki line\nSecond wiki line';
    const wikiHtml = '<div data-pm-slice="1 1 []"><p>First wiki line</p><p>Second wiki line</p></div>';
    const parserEditor = BlockNoteEditor.create();
    let parsedBlocks: any[] = [];
    let preventedDefault = false;

    pasteHandler({
      event: {
        preventDefault: () => {
          preventedDefault = true;
        },
        clipboardData: {
          getData: (type: string) =>
            type === 'text/plain'
              ? plainText
              : type === 'text/html'
                ? wikiHtml
                : '',
        },
      } as unknown as ClipboardEvent,
      editor: {
        pasteHTML: () => {
          throw new Error('wiki BlockNote paste should avoid the HTML parser');
        },
        pasteMarkdown: (value: string) => {
          parsedBlocks = parserEditor.tryParseMarkdownToBlocks(value);
        },
        insertInlineContent: () => {},
        updateBlock: () => {},
      },
      defaultPasteHandler: () => {
        throw new Error('wiki BlockNote paste should not fall back to default HTML handler');
      },
    });

    expect(preventedDefault).toBe(true);
    expect(parsedBlocks[0]?.type).toBe('paragraph');
    expect(parsedBlocks[0]?.content).toEqual([
      { type: 'text', text: 'First wiki line\n Second wiki line', styles: {} },
    ]);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
