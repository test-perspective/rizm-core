import { useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '../../auth/AuthContext';
import { getEntityApi } from '../../api/entities';
import { normalizeComments } from '../../utils/comments';
import { isBlankTitle } from '../../utils/taskDraft';
import { useAppDialog } from '../dialogs';
import { getDeferredChanges, getDeferredSaveProperties } from './deferredSave';
import { mergeEntityValues, syncEntityComments } from './entitySyncMerge';
import { useEntityComments } from './useEntityComments';
import type { EntityDetailPanelProps } from './entityDetailPanelTypes';

export function useEntityDetailPanelModel({
  entity,
  projectId,
  properties,
  titleLikeProperty,
  onClose,
  onUpdate,
  onServerEntity,
  onDelete,
}: Pick<
  EntityDetailPanelProps,
  'entity' | 'projectId' | 'properties' | 'titleLikeProperty' | 'onClose' | 'onUpdate' | 'onServerEntity' | 'onDelete'
>) {
  const dialog = useAppDialog();
  const { user } = useAuth();
  const canEditSchema = !!user && user.role !== 'viewer';
  const canComment = !!user && user.role !== 'viewer';
  const canAttach = !!user && user.role !== 'viewer';

  const [values, setValues] = useState<Record<string, any>>({});
  const [lastSavedValues, setLastSavedValues] = useState<Record<string, any>>({});
  const [valuesEntityId, setValuesEntityId] = useState<string | null>(null);
  const [richtextResetToken, setRichtextResetToken] = useState<Record<string, number>>({});
  const [schemaOpen, setSchemaOpen] = useState(false);

  const {
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
  } = useEntityComments({
    entity,
    values,
    setValues,
    onUpdate,
    user,
    dialog,
  });

  const deferredSaveProps = useMemo(() => getDeferredSaveProperties(properties), [properties]);

  const valuesRef = useRef<Record<string, any>>({});
  const lastSavedValuesRef = useRef<Record<string, any>>({});
  const entityIdRef = useRef<string | null>(null);
  const initializedEntityIdRef = useRef<string | null>(null);
  const onUpdateRef = useRef(onUpdate);
  const deferredSavePropsRef = useRef(deferredSaveProps);

  useEffect(() => {
    valuesRef.current = values;
    lastSavedValuesRef.current = lastSavedValues;
    entityIdRef.current = entity?.id ?? null;
    onUpdateRef.current = onUpdate;
    deferredSavePropsRef.current = deferredSaveProps;
    commentDirtyByIdRef.current = commentDirtyById;
    editingCommentIdRef.current = editingCommentId;
  }, [
    values,
    lastSavedValues,
    entity?.id,
    onUpdate,
    deferredSaveProps,
    commentDirtyById,
    editingCommentId,
    commentDirtyByIdRef,
    editingCommentIdRef,
  ]);

  useEffect(() => {
    if (!entity) {
      setValues({});
      setLastSavedValues({});
      setValuesEntityId(null);
      setRichtextResetToken({});
      initializedEntityIdRef.current = null;
      resetCommentState();
      return;
    }

    const prevEntityId = initializedEntityIdRef.current;
    if (prevEntityId && prevEntityId !== entity.id) {
      const changes = getDeferredChanges(valuesRef.current, lastSavedValuesRef.current, deferredSavePropsRef.current);
      if (Object.keys(changes).length > 0) {
        onUpdateRef.current(prevEntityId, changes);
        setLastSavedValues((prev) => ({ ...prev, ...changes }));
      }
    }
    if (prevEntityId === entity.id) {
      return;
    }

    setValues(entity.properties);
    setLastSavedValues(entity.properties);
    setValuesEntityId(entity.id);
    initializedEntityIdRef.current = entity.id;
    resetCommentState();
  }, [entity, entity?.id, resetCommentState]);

  useEffect(() => {
    if (!entity) return;
    let cancelled = false;
    (async () => {
      try {
        const latest = await getEntityApi(projectId, entity.id);
        if (cancelled) return;
        const currentComments = normalizeComments(valuesRef.current?.comments);
        const remoteComments = normalizeComments(latest.entity.properties?.comments);
        const commentSync = syncEntityComments({
          currentComments,
          remoteComments,
          hasEditing: editingCommentIdRef.current != null,
          hasDirty: Object.values(commentDirtyByIdRef.current).some(Boolean),
          hasNewDraft: newCommentDraftRef.current.hasDraft,
        });
        if (commentSync.shouldUpdate) {
          setValues((prev) => ({ ...(prev ?? {}), comments: commentSync.nextComments }));
          setLastSavedValues((prev) => ({ ...(prev ?? {}), comments: commentSync.nextComments }));
        }

        if (latest.entity.updatedAt <= entity.updatedAt) return;
        onServerEntity(latest.entity, latest.etag);

        const merged = mergeEntityValues({
          currentValues: valuesRef.current,
          lastSavedValues: lastSavedValuesRef.current,
          remoteValues: latest.entity.properties,
          properties,
        });
        if (Object.keys(merged.nextValues).length > 0) {
          setValues(merged.nextValues);
        }
        if (Object.keys(merged.nextLastSavedValues).length > 0) {
          setLastSavedValues(merged.nextLastSavedValues);
        }
        if (merged.updatedRichtextProps.length > 0) {
          setRichtextResetToken((prev) => {
            const next = { ...prev };
            for (const propName of merged.updatedRichtextProps) {
              next[propName] = (next[propName] ?? 0) + 1;
            }
            return next;
          });
        }
      } catch (e) {
        console.error('[detail] failed to sync entity', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    commentDirtyByIdRef,
    editingCommentIdRef,
    entity,
    entity?.id,
    entity?.updatedAt,
    newCommentDraftRef,
    projectId,
    properties,
    onServerEntity,
  ]);

  useEffect(() => {
    if (!entity) return;
    const interval = setInterval(() => {
      const currentEntityId = entityIdRef.current;
      if (!currentEntityId) return;
      const changes = getDeferredChanges(valuesRef.current, lastSavedValuesRef.current, deferredSavePropsRef.current);
      if (Object.keys(changes).length > 0) {
        onUpdateRef.current(currentEntityId, changes);
        setLastSavedValues((prev) => ({ ...prev, ...changes }));
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [entity, entity?.id]);

  useEffect(() => {
    return () => {
      const currentEntityId = entityIdRef.current;
      if (!currentEntityId) return;
      const changes = getDeferredChanges(valuesRef.current, lastSavedValuesRef.current, deferredSavePropsRef.current);
      if (Object.keys(changes).length > 0) {
        try {
          onUpdateRef.current(currentEntityId, changes);
        } catch (e) {
          console.error(`[EntityDetailPanel] Failed to save entity ${currentEntityId} on unmount:`, e);
        }
      }
    };
  }, []);

  const handleChange = (propName: string, value: any) => {
    setValues((prev) => ({ ...prev, [propName]: value }));
    if (!entity) return;
    if (!deferredSaveProps.has(propName)) {
      onUpdate(entity.id, { [propName]: value });
    }
  };

  const commitDeferredProp = (propName: string) => {
    if (!entity) return;
    if (!deferredSavePropsRef.current.has(propName)) return;
    const nextValue = valuesRef.current[propName];
    if (nextValue === undefined || nextValue === lastSavedValuesRef.current[propName]) return;
    onUpdate(entity.id, { [propName]: nextValue });
    setLastSavedValues((prev) => ({ ...prev, [propName]: nextValue }));
  };

  const handleClose = async () => {
    if (!entity) {
      onClose();
      return;
    }

    const hasCommentEditOpen =
      Object.values(commentDirtyByIdRef.current).some(Boolean);
    const hasNewCommentDraft = newCommentDraftRef.current.hasDraft;
    if (hasCommentEditOpen || hasNewCommentDraft) {
      const confirmed = await dialog.confirm({
        title: 'Discard changes?',
        message: 'You have a comment open for editing. Discard and close?',
        confirmText: 'Discard and close',
        cancelText: 'Keep editing',
        danger: true,
      });
      if (!confirmed) return;
      resetCommentState();
    }

    const currentValues = valuesRef.current;
    const propToCheck = titleLikeProperty ?? (properties.some((p) => p.name === 'title') ? 'title' : undefined);
    if (propToCheck && isBlankTitle(currentValues[propToCheck])) {
      const confirmed = await dialog.confirm({
        title: 'Discard Task',
        message: 'Cannot save without a title. Discard this task?',
        confirmText: 'Discard',
        danger: true,
      });
      if (confirmed) {
        onDelete(entity.id);
        onClose();
        return;
      }
      return;
    }

    const changes = getDeferredChanges(currentValues, lastSavedValuesRef.current, deferredSavePropsRef.current);
    if (Object.keys(changes).length > 0) {
      try {
        onUpdate(entity.id, changes);
      } catch (e) {
        console.error(`[EntityDetailPanel] Failed to save entity ${entity.id} on close:`, e);
      }
    }
    onClose();
  };

  const handleDelete = async () => {
    if (!entity) return;
    const currentValues = valuesRef.current;
    const propToCheck = titleLikeProperty ?? (properties.some((p) => p.name === 'title') ? 'title' : undefined);

    if (propToCheck && isBlankTitle(currentValues[propToCheck])) {
      const confirmed = await dialog.confirm({
        title: 'Discard Task',
        message: 'Cannot save without a title. Discard this task?',
        confirmText: 'Discard',
        danger: true,
      });
      if (confirmed) {
        onDelete(entity.id);
        onClose();
      }
      return;
    }

    const changes = getDeferredChanges(currentValues, lastSavedValuesRef.current, deferredSavePropsRef.current);
    if (Object.keys(changes).length > 0) {
      try {
        onUpdate(entity.id, changes);
      } catch (e) {
        console.error(`[EntityDetailPanel] Failed to save entity ${entity.id} before delete:`, e);
      }
    }

    const confirmed = await dialog.confirm({
      title: 'Delete Entity',
      message: 'Are you sure you want to delete this entity?',
      confirmText: 'Delete',
      danger: true,
    });
    if (confirmed) {
      onDelete(entity.id);
      onClose();
    }
  };

  const taskKey = typeof values.taskKey === 'string' ? values.taskKey.trim() : '';
  const panelTitle = taskKey ? taskKey : 'New Task';
  const isTask = entity?.entityId === 'task' || entity?.entityId === 'item';

  return {
    user,
    canEditSchema,
    canComment,
    canAttach,
    values,
    setValues,
    setLastSavedValues,
    valuesEntityId,
    richtextResetToken,
    schemaOpen,
    setSchemaOpen,
    comments,
    editingCommentId,
    commentDraftById,
    commentDirtyById,
    handleAddComment,
    handleEditComment,
    handleCommentDraftChange,
    handleSaveComment,
    handleCancelEditComment,
    handleDeleteComment,
    handleNewCommentDraftChange,
    handleChange,
    commitDeferredProp,
    handleClose,
    handleDelete,
    panelTitle,
    isTask,
  };
}
