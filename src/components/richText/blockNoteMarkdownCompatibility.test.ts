import { describe, expect, it } from 'vitest';
import { BlockNoteEditor } from '@blocknote/core';

describe('BlockNote markdown compatibility', () => {
  it('parses asterisk nested bullet lists from pasted markdown', () => {
    const editor = BlockNoteEditor.create();

    const blocks = editor.tryParseMarkdownToBlocks('* 455\n  * asasa\n  * fdfdf');

    expect(blocks[0]?.type).toBe('bulletListItem');
    expect(blocks[0]?.content).toEqual([{ type: 'text', text: '455', styles: {} }]);
    expect(blocks[0]?.children).toHaveLength(2);
    expect(blocks[0]?.children?.[0]?.type).toBe('bulletListItem');
    expect(blocks[0]?.children?.[0]?.content).toEqual([
      { type: 'text', text: 'asasa', styles: {} },
    ]);
    expect(blocks[0]?.children?.[1]?.type).toBe('bulletListItem');
    expect(blocks[0]?.children?.[1]?.content).toEqual([
      { type: 'text', text: 'fdfdf', styles: {} },
    ]);
  });
});
