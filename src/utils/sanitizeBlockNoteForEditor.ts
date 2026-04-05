/**
 * Normalize imported BlockNote JSON so @blocknote/react can mount without throwing.
 * - Flattens link → link (same href) nesting (Jira markdown rehydration bug).
 * - Ensures quote blocks have inline content when they only had children (ADF import).
 * - Repairs Jira import bug: ordered-list steps stored as `heading` level 1 (TPD-196); sub-bullets as `*` + text.
 */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Keys allowed by @blocknote/core `defaultStyleSpecs` on text nodes. */
const ALLOWED_BLOCKNOTE_TEXT_STYLE_KEYS = new Set([
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'textColor',
  'backgroundColor',
]);

/**
 * Jira/ADF import historically used `strikethrough`; BlockNote expects `strike`.
 * Drop unknown keys so `initialContent` never references missing styleSchema entries.
 */
function normalizeInlineTextStyles(styles: unknown): Record<string, unknown> {
  if (!isRecord(styles)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(styles)) {
    if (k === 'strikethrough') {
      if (v === true) out.strike = true;
      continue;
    }
    if (ALLOWED_BLOCKNOTE_TEXT_STYLE_KEYS.has(k)) {
      out[k] = v;
    }
  }
  return out;
}

const DEFAULT_LIST_PROPS: Record<string, unknown> = {
  backgroundColor: 'default',
  textColor: 'default',
  textAlignment: 'left',
};

function listItemPropsFrom(blockProps: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = { ...DEFAULT_LIST_PROPS };
  for (const k of ['backgroundColor', 'textColor', 'textAlignment'] as const) {
    if (k in blockProps) o[k] = blockProps[k];
  }
  return o;
}

/** `heading` level 1 with inline `[{text:'*'},{text:' sub…'}]` from botched markdown re-parse. */
function isSplitAsteriskSubbulletHeading(block: Record<string, unknown>): boolean {
  if (block.type !== 'heading') return false;
  const lev = (block.props as Record<string, unknown> | undefined)?.level;
  if (Number(lev) !== 1) return false;
  const c = block.content;
  if (!Array.isArray(c) || c.length !== 2) return false;
  const a = c[0];
  const b = c[1];
  if (!isRecord(a) || !isRecord(b)) return false;
  if (a.type !== 'text' || b.type !== 'text') return false;
  if (a.text !== '*') return false;
  return typeof b.text === 'string' && b.text.startsWith(' ');
}

function asteriskHeadingToBulletListItem(block: Record<string, unknown>): Record<string, unknown> {
  const content = block.content as unknown[];
  const second = content[1] as Record<string, unknown>;
  const text = typeof second.text === 'string' ? second.text.trim() : '';
  const styles = isRecord(second.styles) ? second.styles : {};
  return {
    id: block.id,
    type: 'bulletListItem',
    props: { ...DEFAULT_LIST_PROPS },
    content: [{ type: 'text', text, styles }],
    children: [],
  };
}

function misimportedHeadingToNumberedListItem(block: Record<string, unknown>): Record<string, unknown> {
  const props = isRecord(block.props) ? block.props : {};
  return {
    id: block.id,
    type: 'numberedListItem',
    props: listItemPropsFrom(props),
    content: Array.isArray(block.content) ? block.content : [],
    children: Array.isArray(block.children) ? block.children : [],
  };
}

function isTopLevelHeadingLevel1(block: unknown): block is Record<string, unknown> {
  if (!isRecord(block) || block.type !== 'heading') return false;
  const lev = (block.props as Record<string, unknown> | undefined)?.level;
  return Number(lev) === 1;
}

/**
 * TPD-4 pattern: Jira ADF has no headings, only `paragraph` + `orderedList`. A bad import/re-parse
 * produced consecutive `heading` level 1 blocks after a normal paragraph (no preceding h2).
 */
function repairParagraphFollowedByConsecutiveH1AsNumbered(blocks: unknown[]): unknown[] {
  const out: unknown[] = [];
  let i = 0;
  while (i < blocks.length) {
    const cur = blocks[i];
    const next = blocks[i + 1];
    if (
      isRecord(cur) &&
      cur.type === 'paragraph' &&
      isTopLevelHeadingLevel1(next)
    ) {
      out.push(cur);
      i += 1;
      while (i < blocks.length && isTopLevelHeadingLevel1(blocks[i])) {
        out.push(misimportedHeadingToNumberedListItem(blocks[i] as Record<string, unknown>));
        i += 1;
      }
      continue;
    }
    out.push(cur);
    i += 1;
  }
  return out;
}

/** Empty ADF `listItem` + markdown re-parse became a lone `#` paragraph (TPD-4). */
function stripLoneHashOnlyParagraphs(blocks: unknown[]): unknown[] {
  return blocks.filter((raw) => {
    if (!isRecord(raw) || raw.type !== 'paragraph') return true;
    const c = raw.content;
    if (!Array.isArray(c) || c.length !== 1) return true;
    const only = c[0];
    if (!isRecord(only) || only.type !== 'text') return true;
    return only.text !== '#';
  });
}

/**
 * Flat Markdown re-parse turned Jira `orderedList` steps into `# …` headings. BlockNote then
 * receives invalid-looking sequences (h2 section, then many h1 “steps”) and may throw in plugins.
 */
function repairJiraMisimportedTopLevelHeadings(blocks: unknown[]): unknown[] {
  const out: unknown[] = [];

  for (const raw of blocks) {
    if (!isRecord(raw)) {
      out.push(raw);
      continue;
    }

    if (isSplitAsteriskSubbulletHeading(raw)) {
      // Do not nest under `numberedListItem`: BlockNote's PM schema / numbered-list plugin expects
      // nested list items of the same kind; `bulletListItem` children caused runtime throws (TPD-196).
      out.push(asteriskHeadingToBulletListItem(raw));
      continue;
    }

    if (raw.type === 'heading' && Number((raw.props as Record<string, unknown> | undefined)?.level) === 1) {
      const prev = out[out.length - 1];
      const prevIsH2 =
        isRecord(prev) &&
        prev.type === 'heading' &&
        Number((prev.props as Record<string, unknown> | undefined)?.level) === 2;
      const prevIsNumbered = isRecord(prev) && prev.type === 'numberedListItem';
      // Misimported `*` sub-lines become top-level `bulletListItem`; the following h1 step must stay in the list.
      const prevIsBullet = isRecord(prev) && prev.type === 'bulletListItem';
      if (prevIsH2 || prevIsNumbered || prevIsBullet) {
        out.push(misimportedHeadingToNumberedListItem(raw));
        continue;
      }
    }

    out.push(raw);
  }

  return out;
}

function peelSameHrefNestedLink(node: Record<string, unknown>): Record<string, unknown> {
  let n = node;
  while (n.type === 'link' && typeof n.href === 'string') {
    const outerHref = n.href;
    const content = n.content;
    if (!Array.isArray(content) || content.length !== 1) break;
    const only = content[0];
    if (!isRecord(only)) break;
    if (only.type !== 'link' || only.href !== outerHref) break;
    n = only;
  }
  return n;
}

function sanitizeInlineArray(items: unknown[]): unknown[] {
  return items.map((item) => {
    if (!isRecord(item)) return item;
    if (item.type === 'link' && Array.isArray(item.content)) {
      const inner = sanitizeInlineArray(item.content as unknown[]);
      const withInner = { ...item, content: inner };
      return peelSameHrefNestedLink(withInner);
    }
    if (item.type === 'text') {
      return { ...item, styles: normalizeInlineTextStyles(item.styles) };
    }
    return item;
  });
}

function sanitizeBlockTree(block: unknown): unknown {
  if (!isRecord(block)) return block;
  const out: Record<string, unknown> = { ...block };

  if (Array.isArray(out.content)) {
    out.content = sanitizeInlineArray(out.content as unknown[]);
  }

  if (out.type === 'quote' && Array.isArray(out.content) && (out.content as unknown[]).length === 0) {
    const ch = out.children;
    if (Array.isArray(ch) && ch.length > 0) {
      out.content = [{ type: 'text', text: '', styles: {} }];
    }
  }

  if (Array.isArray(out.children)) {
    const repairedChildren = repairJiraMisimportedTopLevelHeadings(out.children as unknown[]);
    out.children = repairedChildren.map((ch) => sanitizeBlockTree(ch));
  }

  return out;
}

/**
 * Deep-clone via JSON; returns undefined if not a BlockNote block array.
 */
export function sanitizeBlockNoteBlocksForEditor(raw: unknown): unknown[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const pass0 = repairParagraphFollowedByConsecutiveH1AsNumbered(raw);
  const pass1 = repairJiraMisimportedTopLevelHeadings(pass0);
  const pass2 = stripLoneHashOnlyParagraphs(pass1);
  return pass2.map((b) => sanitizeBlockTree(b)) as unknown[];
}

export function sanitizeBlockNoteDocString(doc: string): string | undefined {
  const trimmed = doc.trim();
  if (!trimmed) return doc;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const fixed = sanitizeBlockNoteBlocksForEditor(parsed);
    if (!fixed) return undefined;
    return JSON.stringify(fixed);
  } catch {
    return undefined;
  }
}
