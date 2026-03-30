import { describe, it, expect } from 'vitest';
import { convertBlockContent, findTrailingTaskKey, isTableContent, replaceTaskLinkWithText } from './richTextTaskLinking';

const block = (content: any) => ({ id: 'block-1', content });

describe('richTextTaskLinking', () => {
  it('does not convert when task key has no boundary', () => {
    const result = convertBlockContent(
      block([{ type: 'text', text: 'REQ-5', styles: {} }]),
      new Set()
    );
    expect(result.changed).toBe(false);
  });

  it('converts when task key is followed by a boundary', () => {
    const result = convertBlockContent(
      block([{ type: 'text', text: 'REQ-54 ', styles: {} }]),
      new Set()
    );
    expect(result.changed).toBe(true);
    expect(result.content).toEqual([
      { type: 'taskLink', props: { taskKey: 'REQ-54' } },
      { type: 'text', text: ' ', styles: {} },
    ]);
  });

  it('skips conversion when task key is suppressed', () => {
    const result = convertBlockContent(
      block([{ type: 'text', text: 'REQ-54 ', styles: {} }]),
      new Set(['REQ-54'])
    );
    expect(result.changed).toBe(false);
  });

  it('converts task keys inside table cells', () => {
    const result = convertBlockContent(
      block({
        type: 'tableContent',
        rows: [
          {
            cells: [[{ type: 'text', text: 'REQ-88 ', styles: {} }]],
          },
        ],
      }),
      new Set()
    );
    expect(result.changed).toBe(true);
    const table = result.content && isTableContent(result.content) ? result.content : null;
    expect(table?.rows?.[0]?.cells?.[0]).toEqual([
      { type: 'taskLink', props: { taskKey: 'REQ-88' } },
      { type: 'text', text: ' ', styles: {} },
    ]);
  });

  it('finds trailing task key and can revert taskLink', () => {
    const content = [
      { type: 'text', text: 'See ', styles: {} },
      { type: 'taskLink', props: { taskKey: 'REQ-77' } },
      { type: 'text', text: ' ', styles: {} },
    ];
    expect(findTrailingTaskKey(content)).toBe('REQ-77');

    const reverted = replaceTaskLinkWithText(content, 'REQ-77');
    expect(reverted.changed).toBe(true);
    expect(reverted.content).toEqual([
      { type: 'text', text: 'See ', styles: {} },
      { type: 'text', text: 'REQ-77', styles: {} },
      { type: 'text', text: ' ', styles: {} },
    ]);
  });
});
