import type { PartialBlock } from '@blocknote/core';

/**
 * REQ-313: Representative BlockNote document used to detect schema drift across
 * BlockNote upgrades.
 *
 * It covers every block/inline type this app actually persists, with fixed ids so
 * the produced Yjs update and the produced document JSON are deterministic and can
 * be frozen as golden constants. Do not change these blocks without regenerating
 * the goldens in wikiCollabCompat.test.ts.
 */
export const COMPAT_FIXTURE_BLOCKS: PartialBlock<any, any, any>[] = [
  {
    id: 'fx-heading',
    type: 'heading',
    props: { level: 2 },
    content: [{ type: 'text', text: 'Compat heading', styles: {} }],
  },
  {
    id: 'fx-paragraph',
    type: 'paragraph',
    content: [
      { type: 'text', text: 'plain ', styles: {} },
      { type: 'text', text: 'bold', styles: { bold: true } },
      { type: 'text', text: ' and ', styles: {} },
      { type: 'text', text: 'italic', styles: { italic: true } },
      { type: 'text', text: ' and ', styles: {} },
      { type: 'text', text: 'colored', styles: { textColor: 'red' } },
    ],
  },
  {
    id: 'fx-code',
    type: 'codeBlock',
    props: { language: 'typescript' },
    content: [{ type: 'text', text: 'const answer = 42;', styles: {} }],
  },
  {
    id: 'fx-bullet',
    type: 'bulletListItem',
    content: [{ type: 'text', text: 'outer bullet', styles: {} }],
    children: [
      {
        id: 'fx-bullet-child',
        type: 'bulletListItem',
        content: [{ type: 'text', text: 'nested bullet', styles: {} }],
      },
    ],
  },
  {
    id: 'fx-check',
    type: 'checkListItem',
    props: { checked: true },
    content: [{ type: 'text', text: 'done item', styles: {} }],
  },
  {
    id: 'fx-quote',
    type: 'quote',
    content: [{ type: 'text', text: 'quoted text', styles: {} }],
  },
  {
    id: 'fx-image',
    type: 'image',
    props: { url: '/api/projects/p1/entities/e1/attachments/a1', caption: 'shot' },
  },
  {
    id: 'fx-table',
    type: 'table',
    content: {
      type: 'tableContent',
      rows: [
        {
          cells: [
            [{ type: 'text', text: 'r1c1', styles: {} }],
            [{ type: 'text', text: 'r1c2', styles: {} }],
          ],
        },
        {
          cells: [
            [{ type: 'text', text: 'r2c1', styles: {} }],
            [{ type: 'text', text: 'r2c2', styles: {} }],
          ],
        },
      ],
    },
  },
  {
    id: 'fx-inline-custom',
    type: 'paragraph',
    content: [
      { type: 'text', text: 'see ', styles: {} },
      { type: 'taskLink', props: { taskKey: 'REQ-313' } },
      { type: 'text', text: ' with ', styles: {} },
      { type: 'status', props: { id: 'st-1', text: 'In Progress', color: 'blue' } },
    ],
  },
];
