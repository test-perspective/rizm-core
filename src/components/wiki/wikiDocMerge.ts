import { resolveRelativeApiUrlsInBlockNoteBlocks } from '../richText/richTextEditorHelpers';

type UnknownBlock = Record<string, any> & { id?: string };

type MergeArgs = {
  baseDocJson?: string;
  localDocJson?: string;
  remoteDocJson?: string;
};

type DocInfo = {
  order: string[];
  map: Record<string, UnknownBlock>;
};

const parseDoc = (raw: string | undefined): UnknownBlock[] | null => {
  if (raw === undefined) return null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return null;
    return parsed as UnknownBlock[];
  } catch {
    return null;
  }
};

const stableStringify = (value: unknown): string => {
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
};

const deepEqual = (a: unknown, b: unknown): boolean => stableStringify(a) === stableStringify(b);

const buildDocInfo = (doc: UnknownBlock[], prefix: string): DocInfo => {
  const map: Record<string, UnknownBlock> = {};
  const order: string[] = [];
  doc.forEach((block, index) => {
    let id = typeof block?.id === 'string' ? block.id : `${prefix}-${index}`;
    while (map[id]) {
      id = `${id}-${index}`;
    }
    map[id] = block;
    order.push(id);
  });
  return { order, map };
};

const resolveBlock = (
  id: string,
  base: DocInfo,
  local: DocInfo,
  remote: DocInfo
): UnknownBlock | null => {
  const baseBlock = base.map[id];
  const localBlock = local.map[id];
  const remoteBlock = remote.map[id];

  if (remoteBlock) {
    if (!baseBlock && !localBlock) return remoteBlock;
    if (!baseBlock && localBlock) return remoteBlock;

    if (baseBlock) {
      const localChanged = localBlock ? !deepEqual(localBlock, baseBlock) : true;
      const remoteChanged = !deepEqual(remoteBlock, baseBlock);
      if (remoteChanged) return remoteBlock;
      if (localChanged && localBlock) return localBlock;
      return remoteBlock;
    }
  }

  if (!remoteBlock) {
    if (baseBlock) {
      // Remote deletion wins.
      return null;
    }
    if (localBlock) return localBlock;
  }

  return null;
};

export const mergeWikiDoc = ({ baseDocJson, localDocJson, remoteDocJson }: MergeArgs): string => {
  const baseDoc =
    resolveRelativeApiUrlsInBlockNoteBlocks(parseDoc(baseDocJson) ?? undefined) ?? null;
  const localDoc =
    resolveRelativeApiUrlsInBlockNoteBlocks(parseDoc(localDocJson) ?? undefined) ?? null;
  const remoteDoc =
    resolveRelativeApiUrlsInBlockNoteBlocks(parseDoc(remoteDocJson ?? '') ?? undefined) ?? null;

  if (!remoteDoc || !baseDoc || !localDoc) {
    return remoteDocJson ?? '';
  }

  const baseInfo = buildDocInfo(baseDoc, 'base');
  const localInfo = buildDocInfo(localDoc, 'local');
  const remoteInfo = buildDocInfo(remoteDoc, 'remote');

  const result: UnknownBlock[] = [];
  const used = new Set<string>();

  for (const id of remoteInfo.order) {
    const resolved = resolveBlock(id, baseInfo, localInfo, remoteInfo);
    if (!resolved) continue;
    used.add(id);
    result.push(resolved);
  }

  for (const id of localInfo.order) {
    if (used.has(id)) continue;
    if (remoteInfo.map[id]) continue;
    if (baseInfo.map[id]) continue;
    const resolved = resolveBlock(id, baseInfo, localInfo, remoteInfo);
    if (!resolved) continue;
    used.add(id);
    result.push(resolved);
  }

  return JSON.stringify(result);
};
