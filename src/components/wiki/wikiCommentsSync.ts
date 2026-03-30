import { normalizeComments } from '../../utils/comments';
import { syncEntityComments } from '../entityDetail/entitySyncMerge';

type SyncWikiCommentsArgs = {
  currentComments: unknown;
  remoteComments: unknown;
  hasEditing: boolean;
  hasDirty: boolean;
  hasNewDraft: boolean;
};

export const syncWikiComments = ({
  currentComments,
  remoteComments,
  hasEditing,
  hasDirty,
  hasNewDraft,
}: SyncWikiCommentsArgs) => {
  if (remoteComments === undefined) {
    return {
      shouldUpdate: false,
      nextComments: normalizeComments(currentComments),
    };
  }
  return syncEntityComments({
    currentComments: normalizeComments(currentComments),
    remoteComments: normalizeComments(remoteComments),
    hasEditing,
    hasDirty,
    hasNewDraft,
  });
};
