export const TEMP_PASTE_GUARD_CHAR = '\u200B';
export const LIST_ITEM_TYPES = new Set([
  'bulletListItem',
  'numberedListItem',
  'checkListItem',
  'toggleListItem',
]);

const MARKDOWN_BLOCK_PATTERNS = [
  /^\s{0,3}#{1,6}\s+\S/m,
  /^\s{0,3}(?:[-*+])\s+\S/m,
  /^\s{0,3}\d+[.)]\s+\S/m,
  /^\s{0,3}>\s+\S/m,
  /^\s{0,3}(?:```|~~~)/m,
  /^\s*\|.+\|\s*$/m,
  /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/m,
  /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/m,
];

const MARKDOWN_INLINE_PATTERNS = [
  /(^|[^\w])(?:\*\*|__)[^\s][\s\S]{0,200}?[^\s](?:\*\*|__)([^\w]|$)/,
  /(^|[^\w])(?:~~)[^\s][\s\S]{0,200}?[^\s](?:~~)([^\w]|$)/,
  /(^|[^\w])`[^`\s][^`]*`([^\w]|$)/,
  /!?\[[^\]]+\]\([^)]+\)/,
];

const HTML_RICH_STRUCTURE_PATTERN = /<(?:table|img|figure|picture|video|audio|iframe|svg)\b/i;
const BLOCKNOTE_CLIPBOARD_PATTERN = /\b(?:data-pm-slice|ProseMirror|bn-(?:block|editor|inline-content))\b/i;

export function looksLikeMarkdownPlainText(text: unknown): text is string {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  return (
    MARKDOWN_BLOCK_PATTERNS.some((pattern) => pattern.test(trimmed)) ||
    MARKDOWN_INLINE_PATTERNS.some((pattern) => pattern.test(trimmed))
  );
}

export function shouldPastePlainTextInsteadOfHtml(plainText: unknown, html: unknown): plainText is string {
  if (typeof plainText !== 'string' || !plainText.trim()) return false;
  if (typeof html !== 'string' || !html.trim()) return false;
  if (HTML_RICH_STRUCTURE_PATTERN.test(html)) return false;
  return BLOCKNOTE_CLIPBOARD_PATTERN.test(html);
}

export function isInlineContentEmpty(content: unknown): boolean {
  if (!Array.isArray(content)) return true;
  if (content.length === 0) return true;
  return content.every((item) => {
    if (!item || typeof item !== 'object') return true;
    if ((item as { type?: string }).type !== 'text') return false;
    const text = (item as { text?: string }).text;
    return !text || text.length === 0;
  });
}

export function stripFirstTemporaryPasteGuard(content: unknown): unknown {
  if (!Array.isArray(content)) return content;
  let removed = false;
  const next = content.reduce<any[]>((acc, item) => {
    if (!item || typeof item !== 'object') {
      acc.push(item);
      return acc;
    }
    if ((item as { type?: string }).type !== 'text' || removed) {
      acc.push(item);
      return acc;
    }
    const text = (item as { text?: string }).text;
    if (typeof text !== 'string') {
      acc.push(item);
      return acc;
    }
    const guardIdx = text.indexOf(TEMP_PASTE_GUARD_CHAR);
    if (guardIdx === -1) {
      acc.push(item);
      return acc;
    }
    removed = true;
    const withoutGuard = text.slice(0, guardIdx) + text.slice(guardIdx + TEMP_PASTE_GUARD_CHAR.length);
    if (withoutGuard.length > 0) {
      acc.push({ ...(item as Record<string, unknown>), text: withoutGuard });
    }
    return acc;
  }, []);
  return removed ? next : content;
}

export function findBlockById(
  doc: Array<{ id?: string; children?: unknown[] }> | undefined,
  id: string
): { id?: string; content?: unknown; children?: unknown[] } | null {
  if (!doc) return null;
  for (const b of doc) {
    if (b.id === id) return b as { id?: string; content?: unknown; children?: unknown[] };
    const found = findBlockById(
      b.children as Array<{ id?: string; children?: unknown[] }> | undefined,
      id
    );
    if (found) return found;
  }
  return null;
}
