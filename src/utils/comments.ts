import type { Me } from '../auth/types';
import { randomUUID } from './uuid';

export type TaskCommentAuthor = {
  id?: string;
  name?: string;
};

export type TaskComment = {
  id: string;
  createdAt: number;
  author?: TaskCommentAuthor;
  /**
   * BlockNote JSON string (stringified editor.document)
   */
  doc: string;
  updatedAt?: number;
  updatedBy?: TaskCommentAuthor;
  deletedAt?: number;
  deletedBy?: TaskCommentAuthor;
};

/** BlockNote JSON string for "This comment was deleted." placeholder. */
export const DELETED_COMMENT_DOC = JSON.stringify([
  { type: 'paragraph', content: [{ type: 'text', text: 'This comment was deleted.', styles: {} }], children: [] },
]);

export const isCommentDeleted = (c: TaskComment): boolean =>
  typeof c.deletedAt === 'number' && Number.isFinite(c.deletedAt);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const coerceNumber = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return undefined;
    const n = Number(t);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
};

export const normalizeComments = (raw: unknown): TaskComment[] => {
  if (!Array.isArray(raw)) return [];
  const out: TaskComment[] = [];

  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    if (!isRecord(item)) continue;

    const doc = typeof item.doc === 'string' ? item.doc : '';
    const trimmedDoc = doc.trim();
    if (!trimmedDoc) continue;

    const createdAt = coerceNumber(item.createdAt) ?? 0;
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `comment-${createdAt}-${i}`;

    const authorRaw = item.author;
    const author: TaskCommentAuthor | undefined = (() => {
      if (!isRecord(authorRaw)) return undefined;
      const id = typeof authorRaw.id === 'string' ? authorRaw.id.trim() : '';
      const name = typeof authorRaw.name === 'string' ? authorRaw.name.trim() : '';
      if (!id && !name) return undefined;
      return { ...(id ? { id } : {}), ...(name ? { name } : {}) };
    })();

    const parseAuthor = (raw: unknown): TaskCommentAuthor | undefined => {
      if (!isRecord(raw)) return undefined;
      const aid = typeof raw.id === 'string' ? raw.id.trim() : '';
      const aname = typeof raw.name === 'string' ? raw.name.trim() : '';
      if (!aid && !aname) return undefined;
      return { ...(aid ? { id: aid } : {}), ...(aname ? { name: aname } : {}) };
    };
    const updatedAt = coerceNumber(item.updatedAt);
    const updatedBy = parseAuthor(item.updatedBy);
    const deletedAt = coerceNumber(item.deletedAt);
    const deletedBy = parseAuthor(item.deletedBy);

    out.push({
      id,
      createdAt,
      ...(author ? { author } : {}),
      doc: trimmedDoc,
      ...(updatedAt !== undefined ? { updatedAt } : {}),
      ...(updatedBy ? { updatedBy } : {}),
      ...(deletedAt !== undefined ? { deletedAt } : {}),
      ...(deletedBy ? { deletedBy } : {}),
    });
  }

  // Canonical order: newest first.
  out.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return out;
};

export const makeComment = (doc: string, user?: Me | null): TaskComment => {
  const now = Date.now();
  const author: TaskCommentAuthor | undefined = user
    ? { id: user.userId, name: user.email }
    : undefined;
  return {
    id: randomUUID(),
    createdAt: now,
    ...(author ? { author } : {}),
    doc: String(doc ?? '').trim(),
  };
};

export const getLatestCommentDoc = (comments: TaskComment[] | undefined): string => {
  const list = Array.isArray(comments) ? comments : [];
  if (list.length === 0) return '';
  // list is expected to be sorted already; but be defensive.
  let best = list[0];
  for (const c of list) {
    if ((c.createdAt ?? 0) >= (best.createdAt ?? 0)) best = c;
  }
  return typeof best.doc === 'string' ? best.doc : '';
};

export const isBlockNoteDocBlank = (raw: unknown): boolean => {
  const text = blockNoteToPlainText(raw).replace(/\s+/g, ' ').trim();
  return !text;
};

/**
 * Check if a string is valid BlockNote document format (array of blocks).
 * Used to avoid passing malformed docs (e.g. from Jira ADF import) to RichTextEditor.
 */
export function isValidBlockNoteDoc(doc: unknown): boolean {
  if (doc === null || doc === undefined || typeof doc !== 'string') return false;
  const trimmed = doc.trim();
  if (!trimmed) return true; // empty string is valid (no content)
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return false;
    for (const block of parsed) {
      if (!block || typeof block !== 'object') return false;
      if (typeof (block as { type?: unknown }).type !== 'string') return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Compare BlockNote documents by content, ignoring block IDs and property order.
 * Used for dirty-checking so that BlockNote's re-serialization (different IDs, defaults)
 * does not falsely mark unchanged content as dirty.
 */
export function isBlockNoteDocContentEqual(docA: string, docB: string): boolean {
  const a = blockNoteDocContentForComparison(docA);
  const b = blockNoteDocContentForComparison(docB);
  const strA = stableStringify(a);
  const strB = stableStringify(b);
  return strA === strB;
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function blockNoteDocContentForComparison(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return parsed;
    return parsed.map((block: unknown) => blockContentWithoutId(block));
  } catch {
    return raw;
  }
}

/** BlockNote default block props - omit when comparing so stored docs match re-serialized output. */
const BLOCKNOTE_DEFAULT_PROPS: Record<string, string> = {
  backgroundColor: 'default',
  textColor: 'default',
  textAlignment: 'left',
};

function blockContentWithoutId(block: unknown): unknown {
  if (!block || typeof block !== 'object') return block;
  const b = block as Record<string, unknown>;
  const { id: _id, ...rest } = b;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (k === 'children' && Array.isArray(v)) {
      result[k] = v.map((child) => blockContentWithoutId(child));
    } else if (k === 'content' && Array.isArray(v)) {
      result[k] = v.map((item) => normalizeInlineContentForComparison(item));
    } else if (BLOCKNOTE_DEFAULT_PROPS[k] !== undefined && v === BLOCKNOTE_DEFAULT_PROPS[k]) {
      continue;
    } else {
      result[k] = v;
    }
  }
  return result;
}

function normalizeInlineContentForComparison(item: unknown): unknown {
  if (!item || typeof item !== 'object') return item;
  const obj = item as Record<string, unknown>;
  const { id: _id, ...rest } = obj;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (k === 'content' && Array.isArray(v)) {
      result[k] = v.map((c) => normalizeInlineContentForComparison(c));
    } else {
      result[k] = v;
    }
  }
  return result;
}

const isTableContent = (v: unknown): v is { type: 'tableContent'; rows?: Array<{ cells?: unknown[] }> } =>
  isRecord(v) && (v as { type?: string }).type === 'tableContent';

const blockNoteToPlainText = (raw: unknown): string => {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return '';
    try {
      return blockNoteToPlainText(JSON.parse(t));
    } catch {
      return raw;
    }
  }
  if (Array.isArray(raw)) return raw.map((x) => blockNoteToPlainText(x)).filter(Boolean).join('\n');
  if (isRecord(raw)) {
    const t = raw.text;
    if (typeof t === 'string') return t;
    const parts: string[] = [];
    if (Array.isArray(raw.content)) parts.push(blockNoteToPlainText(raw.content));
    if (isTableContent(raw.content)) {
      const rows = raw.content.rows ?? [];
      for (const row of rows) {
        const cells = row.cells ?? [];
        for (const cell of cells) {
          parts.push(blockNoteToPlainText(cell));
        }
      }
    }
    if (Array.isArray(raw.children)) parts.push(blockNoteToPlainText(raw.children));
    return parts.filter(Boolean).join('');
  }
  return '';
};

