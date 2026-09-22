import type { PartialBlock } from '@blocknote/core';
import { BlockNoteSchema, defaultInlineContentSpecs } from '@blocknote/core';
import { createReactInlineMathSpec, createReactMathBlockSpec } from '@blocknote/math-block';
import type { Entity } from '../../types';
import { sanitizeBlockNoteBlocksForEditor } from '../../utils/sanitizeBlockNoteForEditor';
import { getBackendUrl, isBackendEnabled } from '../../utils/storage';
import { createStatusInlineSpec } from './StatusInline';
import { createTaskLinkInlineSpec } from './TaskLinkInline';

/** Convert a data URL or blob URL to a File for upload. */
async function urlToFile(url: string, defaultName = 'image.png'): Promise<File | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    return new File([blob], defaultName, { type: blob.type });
  } catch {
    return null;
  }
}

/**
 * Replace img src attributes that are data:image/... or blob:... with uploaded attachment URLs.
 * Returns modified HTML string. Non-image or failed uploads keep the original src.
 */
export async function replaceTransientImageUrlsInHtml(
  html: string,
  uploadFile: (file: File) => Promise<string>
): Promise<string> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const images = doc.querySelectorAll('img[src]');
  const replacements: Array<{ src: string; url: string }> = [];

  for (const img of images) {
    const src = (img.getAttribute('src') ?? '').trim();
    if (!src || (!src.startsWith('data:image/') && !src.startsWith('blob:'))) continue;
    const file = await urlToFile(src, `pasted-${replacements.length}.png`);
    if (!file) continue;
    try {
      const url = await uploadFile(file);
      replacements.push({ src, url });
    } catch {
      // Keep original src on upload failure
    }
  }

  if (replacements.length === 0) return html;
  let out = html;
  for (const { src, url } of replacements) {
    out = out.replace(src, url);
  }
  return out;
}

export const parseDoc = (raw: unknown): PartialBlock[] | undefined => {
  if (raw === null || raw === undefined) return undefined;
  if (Array.isArray(raw)) {
    const fixed = sanitizeBlockNoteBlocksForEditor(raw);
    return (fixed ?? raw) as PartialBlock[];
  }
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return undefined;
    const fixed = sanitizeBlockNoteBlocksForEditor(parsed);
    return (fixed ?? parsed) as PartialBlock[];
  } catch {
    return undefined;
  }
};

/**
 * Jira import stores image `props.url` as `/api/projects/...`. When the SPA host differs from the
 * API host, prefix the backend base URL so `<img>` loads the attachment.
 */
export function resolveRelativeApiUrlsInBlockNoteBlocks(
  blocks: PartialBlock[] | undefined
): PartialBlock[] | undefined {
  if (!blocks?.length) return blocks;
  if (!isBackendEnabled()) return blocks;
  const base = getBackendUrl();
  if (!base) return blocks;

  const mapBlockDeep = (block: unknown): unknown => {
    if (!block || typeof block !== 'object') return block;
    const b = block as Record<string, unknown>;
    const out: Record<string, unknown> = { ...b };
    const type = out.type;
    const props = out.props;
    if (
      type === 'image' &&
      props &&
      typeof props === 'object' &&
      typeof (props as { url?: unknown }).url === 'string'
    ) {
      const p = props as { url: string; [k: string]: unknown };
      const u = p.url.trim();
      if (u.startsWith('/api/')) {
        out.props = { ...p, url: `${base}${u}` };
      }
    }
    if (Array.isArray(out.children) && out.children.length > 0) {
      out.children = (out.children as unknown[]).map(mapBlockDeep);
    }
    return out;
  };

  return blocks.map((block) => mapBlockDeep(block) as PartialBlock);
}

export type TaskLinkSchemaParams = {
  entitiesRef: { current: Entity[] };
  onEntityClickRef: { current: ((entity: Entity) => void) | undefined };
  isMountedRef: { current: boolean };
};

export function createTaskLinkSchema(params: TaskLinkSchemaParams) {
  const { entitiesRef, onEntityClickRef, isMountedRef } = params;
  const taskLinkSpec = createTaskLinkInlineSpec({ entitiesRef, onEntityClickRef, isMountedRef });

  return BlockNoteSchema.create({
    inlineContentSpecs: {
      ...defaultInlineContentSpecs,
      taskLink: taskLinkSpec,
      status: createStatusInlineSpec(),
    },
  }).extend({
    // Math lives in an optional package, so it has to be opted into the schema.
    // Both the editor and the headless editor used to seed Yjs go through this
    // function, so they cannot drift apart.
    blockSpecs: { mathBlock: createReactMathBlockSpec() },
    inlineContentSpecs: { math: createReactInlineMathSpec() },
  });
}
