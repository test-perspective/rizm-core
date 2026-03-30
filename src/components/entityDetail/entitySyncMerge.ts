import type { PropertyDefinition } from '../../types';
import type { TaskComment } from '../../utils/comments';

type MergeArgs = {
  currentValues: Record<string, any>;
  lastSavedValues: Record<string, any>;
  remoteValues: Record<string, any>;
  properties: PropertyDefinition[];
};

type MergeResult = {
  nextValues: Record<string, any>;
  nextLastSavedValues: Record<string, any>;
  updatedRichtextProps: string[];
};

type CommentSyncArgs = {
  currentComments: TaskComment[];
  remoteComments: TaskComment[];
  hasEditing: boolean;
  hasDirty: boolean;
  hasNewDraft: boolean;
};

type CommentSyncResult = {
  shouldUpdate: boolean;
  nextComments: TaskComment[];
};

const serializeComment = (c: TaskComment): string =>
  JSON.stringify([
    c.id,
    c.createdAt,
    c.author?.id ?? '',
    c.author?.name ?? '',
    c.doc,
    c.updatedAt ?? null,
    c.updatedBy?.id ?? '',
    c.updatedBy?.name ?? '',
    c.deletedAt ?? null,
    c.deletedBy?.id ?? '',
    c.deletedBy?.name ?? '',
  ]);

const areCommentsEqual = (a: TaskComment[], b: TaskComment[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (serializeComment(a[i]) !== serializeComment(b[i])) return false;
  }
  return true;
};

export const syncEntityComments = ({
  currentComments,
  remoteComments,
  hasEditing,
  hasDirty,
  hasNewDraft,
}: CommentSyncArgs): CommentSyncResult => {
  if (hasEditing || hasDirty || hasNewDraft) {
    return { shouldUpdate: false, nextComments: currentComments };
  }
  if (areCommentsEqual(currentComments, remoteComments)) {
    return { shouldUpdate: false, nextComments: currentComments };
  }
  return { shouldUpdate: true, nextComments: remoteComments };
};

export const mergeEntityValues = ({
  currentValues,
  lastSavedValues,
  remoteValues,
  properties,
}: MergeArgs): MergeResult => {
  const nextValues = { ...currentValues };
  const nextLastSavedValues = { ...lastSavedValues };
  const updatedRichtextProps: string[] = [];

  for (const prop of properties) {
    const name = prop.name;
    if (currentValues[name] !== lastSavedValues[name]) {
      continue;
    }
    const remoteValue = remoteValues[name];
    if (remoteValue === currentValues[name]) {
      continue;
    }
    nextValues[name] = remoteValue;
    nextLastSavedValues[name] = remoteValue;
    if (prop.type === 'richtext') {
      updatedRichtextProps.push(name);
    }
  }

  return { nextValues, nextLastSavedValues, updatedRichtextProps };
};
