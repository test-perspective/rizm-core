import type { Entity } from '../../types';

export const page: Entity = {
  id: 'page-1',
  entityId: 'wiki',
  createdAt: 0,
  updatedAt: 0,
  properties: {},
};

export const defaultPaneProps = {
  projectId: 'project-1' as const,
  canEdit: true,
  canComment: true,
  onAddComment: () => true,
  onEditComment: () => {},
  onCommentDraftChange: () => {},
  onSaveComment: () => {},
  onCancelEditComment: () => {},
  onDeleteComment: () => {},
  onNewCommentDraftChange: () => {},
  onTitleChange: () => {},
  onDocChange: () => {},
  onEditStart: () => {},
  onDone: () => {},
  entities: [] as Entity[],
  comments: [] as { id: string; doc: string; createdAt: number; authorId: string }[],
  editingCommentId: null as string | null,
  commentDraftById: {} as Record<string, string>,
  commentDirtyById: {} as Record<string, boolean>,
};
