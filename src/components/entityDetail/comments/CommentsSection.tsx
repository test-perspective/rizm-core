import { useState } from 'react';
import type { Entity } from '../../../types';
import type { Me } from '../../../auth/types';
import type { TaskComment } from '../../../utils/comments';
import {
  isBlockNoteDocBlank,
  isBlockNoteDocContentEqual,
  isCommentDeleted,
  isValidBlockNoteDoc,
} from '../../../utils/comments';
import { InvalidBlockNoteLogger } from '../InvalidBlockNoteLogger';
import { DELETED_USER_LABEL } from '../../../utils/userDisplay';
import { Trash2 } from 'lucide-react';
import { RichTextEditor } from '../../RichTextEditor';

type CommentsSectionProps = {
  entity: Entity;
  comments: TaskComment[];
  canComment: boolean;
  entities: Entity[];
  onEntityClick?: (entity: Entity) => void;
  onAddComment: (doc: string) => boolean;
  user?: Me | null;
  editingCommentId: string | null;
  commentDraftById: Record<string, string>;
  commentDirtyById: Record<string, boolean>;
  onEditComment: (id: string) => void;
  onCommentDraftChange: (id: string, doc: string, isDirty: boolean) => void;
  onSaveComment: (id: string) => void;
  onCancelEditComment: (id: string) => void;
  onDeleteComment: (id: string) => void;
  onNewCommentDraftChange: (doc: string) => void;
};

const canEditComment = (c: TaskComment, user?: Me | null): boolean => {
  if (!user || isCommentDeleted(c)) return false;
  if (user.role === 'admin') return true;
  return c.author?.id != null && c.author.id === user.userId;
};

export const CommentsSection = ({
  entity,
  comments,
  canComment,
  entities,
  onEntityClick,
  onAddComment,
  user,
  editingCommentId,
  commentDraftById,
  commentDirtyById,
  onEditComment,
  onCommentDraftChange,
  onSaveComment,
  onCancelEditComment,
  onDeleteComment,
  onNewCommentDraftChange,
}: CommentsSectionProps) => {
  const [commentDraft, setCommentDraft] = useState<string>('');
  const [commentDraftRev, setCommentDraftRev] = useState(0);

  const handleAdd = () => {
    const doc = String(commentDraft ?? '').trim();
    if (!doc || isBlockNoteDocBlank(doc)) return;
    if (onAddComment(doc)) {
      setCommentDraft('');
      setCommentDraftRev((r) => r + 1);
      onNewCommentDraftChange('');
    }
  };

  return (
    <div className="pt-6 border-t border-zinc-800 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-200">Comments</h3>
        <div className="text-xs text-zinc-500">
          {comments.length} comment{comments.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="p-3 border-b border-zinc-800 bg-zinc-900/30">
          <div className="text-xs text-zinc-500 mb-2">Add a comment</div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden">
            <div className="p-3 bg-zinc-950">
              <RichTextEditor
                key={`${entity.id}:commentDraft:${commentDraftRev}`}
                value={commentDraft}
                editable={canComment}
                onChange={(docJson) => {
                  setCommentDraft(docJson);
                  onNewCommentDraftChange(docJson);
                }}
                entities={entities}
                onEntityClick={onEntityClick}
              />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="text-xs text-zinc-600">
              {canComment ? 'Enter in Wiki format (BlockNote).' : 'Read-only access cannot add comments.'}
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!canComment || !commentDraft.trim() || isBlockNoteDocBlank(commentDraft)}
              className="px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-md transition-colors text-sm"
            >
              Add
            </button>
          </div>
        </div>

        <div className="p-3 space-y-3">
          {comments.length === 0 ? (
            <div className="text-sm text-zinc-500">No comments yet.</div>
          ) : (
            comments.map((c) => {
              const isEditing = editingCommentId === c.id;
              const canEdit = canEditComment(c, user);
              const draft = commentDraftById[c.id] ?? c.doc;
              const dirty = commentDirtyById[c.id] ?? false;
              const deleted = isCommentDeleted(c);
              return (
                <div
                  key={c.id}
                  className={`border border-zinc-800 rounded-lg overflow-hidden ${
                    canEdit && !deleted && !isEditing ? 'cursor-pointer hover:border-zinc-700' : ''
                  }`}
                  onClick={
                    canEdit && !deleted && !isEditing
                      ? (e) => {
                          e.stopPropagation();
                          onEditComment(c.id);
                        }
                      : undefined
                  }
                  role={canEdit && !deleted && !isEditing ? 'button' : undefined}
                >
                  <div className="px-3 py-2 bg-zinc-900/40 border-b border-zinc-800 flex items-center justify-between gap-3">
                    <div className="text-xs text-zinc-400">
                      {c.author?.name ? (
                        <span className="text-zinc-300">{c.author.name}</span>
                      ) : c.author?.id ? (
                        <span className="text-zinc-500">{DELETED_USER_LABEL}</span>
                      ) : (
                        <span className="text-zinc-500">Unknown</span>
                      )}
                      <span className="text-zinc-600"> · </span>
                      <span className="text-zinc-500">{new Date(c.createdAt).toLocaleString()}</span>
                      {c.updatedAt != null && (
                        <>
                          <span className="text-zinc-600"> · </span>
                          <span className="text-zinc-500">Edited {new Date(c.updatedAt).toLocaleString()}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isEditing && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSaveComment(c.id);
                            }}
                            disabled={!dirty || isBlockNoteDocBlank(draft)}
                            className="px-2 py-1 text-xs bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 rounded transition-colors"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCancelEditComment(c.id);
                            }}
                            className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteComment(c.id);
                            }}
                            className="p-1 text-zinc-400 hover:text-red-400 rounded transition-colors"
                            title="Delete comment"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <div className="text-[11px] text-zinc-600 font-mono">{c.id}</div>
                    </div>
                  </div>
                  <div className="p-3 bg-zinc-950" onClick={isEditing ? (e) => e.stopPropagation() : undefined}>
                    {isValidBlockNoteDoc(isEditing ? draft : c.doc) ? (
                      <RichTextEditor
                        key={`comment-${c.id}-${isEditing ? 'edit' : 'read'}-${c.deletedAt ?? 'active'}-${
                          c.updatedAt ?? 'na'
                        }`}
                        value={isEditing ? draft : c.doc}
                        editable={isEditing}
                        onChange={
                          isEditing
                            ? (doc) =>
                                onCommentDraftChange(
                                  c.id,
                                  doc,
                                  !isBlockNoteDocContentEqual(doc ?? '', c.doc ?? '')
                                )
                            : () => {}
                        }
                        entities={entities}
                        onEntityClick={onEntityClick}
                      />
                    ) : (
                      <>
                        {typeof window !== 'undefined' && (
                          <InvalidBlockNoteLogger
                            source="comment"
                            id={c.id}
                            raw={isEditing ? draft : c.doc}
                          />
                        )}
                        <div className="text-sm text-zinc-500 italic">
                          Comment content could not be displayed (imported content may use unsupported format).
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="text-xs text-zinc-500 space-y-1">
        <div>Created: {new Date(entity.createdAt).toLocaleString()}</div>
        <div>Updated: {new Date(entity.updatedAt).toLocaleString()}</div>
        <div>ID: {entity.id}</div>
      </div>
    </div>
  );
};
