import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DELETED_COMMENT_DOC,
  isBlockNoteDocBlank,
  isCommentDeleted,
  makeComment,
  normalizeComments,
} from '../../utils/comments';
import type { Entity } from '../../types';
import type { Me } from '../../auth/types';

type CommentAuthor = { id: string; name: string } | undefined;

type UseEntityCommentsParams = {
  entity: Entity | null;
  values: Record<string, any>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  onUpdate: (id: string, properties: Record<string, any>) => void;
  user: Me | null;
  dialog: { confirm: (opts: { title: string; message: string; confirmText: string; danger?: boolean; cancelText?: string }) => Promise<boolean> };
};

export function useEntityComments({
  entity,
  values,
  setValues,
  onUpdate,
  user,
  dialog,
}: UseEntityCommentsParams) {
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentDraftById, setCommentDraftById] = useState<Record<string, string>>({});
  const [commentDirtyById, setCommentDirtyById] = useState<Record<string, boolean>>({});
  const commentDirtyByIdRef = useRef<Record<string, boolean>>({});
  const editingCommentIdRef = useRef<string | null>(null);
  const newCommentDraftRef = useRef<{ hasDraft: boolean; docLength: number }>({
    hasDraft: false,
    docLength: 0,
  });

  const comments = useMemo(() => normalizeComments(values?.comments), [values?.comments]);

  const resetCommentState = useCallback(() => {
    setEditingCommentId(null);
    setCommentDraftById({});
    setCommentDirtyById({});
    commentDirtyByIdRef.current = {};
    editingCommentIdRef.current = null;
    newCommentDraftRef.current = { hasDraft: false, docLength: 0 };
  }, []);

  const handleAddComment = useCallback(
    (doc: string): boolean => {
      if (!entity) return false;
      const trimmed = String(doc ?? '').trim();
      if (!trimmed || isBlockNoteDocBlank(trimmed)) return false;
      const next = [makeComment(trimmed, user), ...comments];
      setValues((prev) => ({ ...(prev ?? {}), comments: next }));
      onUpdate(entity.id, { comments: next });
      return true;
    },
    [comments, entity, onUpdate, setValues, user]
  );

  const handleEditComment = useCallback(
    (id: string) => {
      const c = comments.find((x) => x.id === id);
      if (!c || isCommentDeleted(c)) return;
      setEditingCommentId(id);
      editingCommentIdRef.current = id;
      setCommentDraftById((prev) => ({ ...prev, [id]: c.doc }));
      setCommentDirtyById((prev) => ({ ...prev, [id]: false }));
      commentDirtyByIdRef.current = { ...commentDirtyByIdRef.current, [id]: false };
    },
    [comments]
  );

  const handleCommentDraftChange = useCallback((id: string, doc: string, isDirty: boolean) => {
    setCommentDraftById((prev) => ({ ...prev, [id]: doc }));
    setCommentDirtyById((prev) => ({ ...prev, [id]: isDirty }));
    commentDirtyByIdRef.current = { ...commentDirtyByIdRef.current, [id]: isDirty };
  }, []);

  const handleSaveComment = useCallback(
    (id: string) => {
      if (!entity) return;
      const draft = commentDraftById[id];
      if (draft == null || isBlockNoteDocBlank(draft)) return;
      const c = comments.find((x) => x.id === id);
      if (!c) return;
      const now = Date.now();
      const author: CommentAuthor = user ? { id: user.userId, name: user.email } : undefined;
      const updated = { ...c, doc: draft.trim(), updatedAt: now, updatedBy: author };
      const next = comments.map((x) => (x.id === id ? updated : x));
      setValues((prev) => ({ ...(prev ?? {}), comments: next }));
      onUpdate(entity.id, { comments: next });
      setEditingCommentId((prev) => (prev === id ? null : prev));
      editingCommentIdRef.current = null;
      setCommentDraftById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setCommentDirtyById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [commentDraftById, comments, entity, onUpdate, setValues, user]
  );

  const handleCancelEditComment = useCallback((id: string) => {
    setEditingCommentId((prev) => (prev === id ? null : prev));
    editingCommentIdRef.current = null;
    setCommentDraftById((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setCommentDirtyById((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleDeleteComment = useCallback(
    async (id: string) => {
      if (!entity) return;
      const confirmed = await dialog.confirm({
        title: 'Delete comment',
        message: 'Mark this comment as deleted? The placeholder "This comment was deleted." will remain.',
        confirmText: 'Delete',
        danger: true,
      });
      if (!confirmed) return;
      const c = comments.find((x) => x.id === id);
      if (!c) return;
      const now = Date.now();
      const author: CommentAuthor = user ? { id: user.userId, name: user.email } : undefined;
      const updated = { ...c, doc: DELETED_COMMENT_DOC, deletedAt: now, deletedBy: author };
      const next = comments.map((x) => (x.id === id ? updated : x));
      setValues((prev) => ({ ...(prev ?? {}), comments: next }));
      onUpdate(entity.id, { comments: next });
      setEditingCommentId((prev) => (prev === id ? null : prev));
      editingCommentIdRef.current = null;
      setCommentDraftById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setCommentDirtyById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [comments, dialog, entity, onUpdate, setValues, user]
  );

  const handleNewCommentDraftChange = useCallback((doc: string) => {
    const trimmed = String(doc ?? '').trim();
    const hasDraft = !!trimmed && !isBlockNoteDocBlank(trimmed);
    newCommentDraftRef.current = { hasDraft, docLength: trimmed.length };
  }, []);

  return {
    comments,
    editingCommentId,
    commentDraftById,
    commentDirtyById,
    editingCommentIdRef,
    commentDirtyByIdRef,
    newCommentDraftRef,
    resetCommentState,
    handleAddComment,
    handleEditComment,
    handleCommentDraftChange,
    handleSaveComment,
    handleCancelEditComment,
    handleDeleteComment,
    handleNewCommentDraftChange,
  };
}

