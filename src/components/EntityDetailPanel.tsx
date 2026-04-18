import { useCallback, useEffect, useRef, useState } from 'react';
import type { Entity, PropertyDefinition } from '../types';
import { SlidersHorizontal, Trash2, X } from 'lucide-react';
import { SchemaEditorDialog } from './SchemaEditorDialog';
import { AttachmentsSection } from './entityDetail/attachments/AttachmentsSection';
import { CommentsSection } from './entityDetail/comments/CommentsSection';
import { PropertyInput } from './entityDetail/inputs/PropertyInput';
import type { EntityDetailPanelProps } from './entityDetail/entityDetailPanelTypes';
import { useEntityDetailPanelModel } from './entityDetail/useEntityDetailPanelModel';
import { shouldSuppressAdjacentEntityNavigation } from '../utils/entityDetailKeyboardGuards';

const DEFAULT_WIDTH = 672;
const MIN_WIDTH = 360;

function getMaxWidth() {
  return Math.floor(typeof window !== 'undefined' ? window.innerWidth * 0.95 : 1200);
}

export const EntityDetailPanel = ({
  entity,
  projectId,
  entityTypeId,
  viewId,
  properties,
  titleLikeProperty,
  entities = [],
  onClose,
  onUpdate,
  onServerEntity,
  onDelete,
  onAddPropertyDefinition,
  onRemovePropertyDefinition,
  onReorderProperties,
  onUpsertPropertyOption,
  onEntityClick,
  usersById = {},
  onResolveUsers,
  allowSchemaEdit = true,
  onNavigateDetailPrev,
  onNavigateDetailNext,
  backdropExcludeLeftPx = 0,
}: EntityDetailPanelProps) => {
  const {
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
  } = useEntityDetailPanelModel({
    entity,
    projectId,
    properties,
    titleLikeProperty,
    onClose,
    onUpdate,
    onServerEntity,
    onDelete,
  });

  const [panelWidth, setPanelWidth] = useState(() =>
    Math.min(DEFAULT_WIDTH, typeof window !== 'undefined' ? window.innerWidth : DEFAULT_WIDTH)
  );
  const panelWidthRef = useRef(panelWidth);
  panelWidthRef.current = panelWidth;

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelWidthRef.current;
    const maxW = getMaxWidth();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      const next = Math.max(MIN_WIDTH, Math.min(maxW, startWidth + delta));
      setPanelWidth(next);
    };
    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        if (schemaOpen) {
          setSchemaOpen(false);
        } else {
          void handleClose();
        }
        return;
      }

      if (schemaOpen) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (shouldSuppressAdjacentEntityNavigation(e)) return;

      if (e.key === 'ArrowLeft') {
        if (!onNavigateDetailPrev) return;
        onNavigateDetailPrev();
      } else {
        if (!onNavigateDetailNext) return;
        onNavigateDetailNext();
      }
      e.preventDefault();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [schemaOpen, setSchemaOpen, handleClose, onNavigateDetailPrev, onNavigateDetailNext]);

  useEffect(() => {
    if (!allowSchemaEdit && schemaOpen) {
      setSchemaOpen(false);
    }
  }, [allowSchemaEdit, schemaOpen, setSchemaOpen]);

  const applyEntityPropertiesFromServer = useCallback((props: Record<string, unknown>) => {
    setValues(props as Record<string, any>);
    setLastSavedValues(props as Record<string, any>);
  }, [setValues, setLastSavedValues]);

  const onServerEntityWithPanelPropertySync = useCallback(
    (updated: Entity, etag: string) => {
      onServerEntity(updated, etag);
      applyEntityPropertiesFromServer(updated.properties ?? {});
    },
    [onServerEntity, applyEntityPropertiesFromServer]
  );

  const richtextAttachmentContext =
    canAttach && entity
      ? {
          projectId,
          entityPk: entity.id,
          values,
          onServerEntity: onServerEntityWithPanelPropertySync,
        }
      : undefined;

  if (!entity) return null;

  const renderInput = (prop: PropertyDefinition) => {
    const isValuesReady = valuesEntityId === entity.id;
    const value = values[prop.name] ?? '';
    return (
      <PropertyInput
        entityId={entity.id}
        entityTypeId={entityTypeId}
        prop={prop}
        value={value}
        isValuesReady={isValuesReady}
        resetKey={richtextResetToken[prop.name] ?? 0}
        entities={entities}
        usersById={usersById}
        onEntityClick={onEntityClick}
        onResolveUsers={onResolveUsers}
        onUpsertPropertyOption={onUpsertPropertyOption}
        onChange={(next) => handleChange(prop.name, next)}
        onCommit={(propName) => commitDeferredProp(propName)}
        richtextAttachmentContext={richtextAttachmentContext}
      />
    );
  };

  const excludeLeft = Math.max(0, Math.floor(backdropExcludeLeftPx));

  return (
    <div className="fixed inset-0 z-40 flex w-full min-w-0 flex-row">
      {excludeLeft > 0 ? (
        <div
          className="h-full shrink-0 pointer-events-none"
          style={{ width: excludeLeft }}
          aria-hidden
        />
      ) : null}
      <div
        className="min-w-0 flex-1 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        title="Resize panel"
        data-testid="entity-detail-resize-handle"
        className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-zinc-700/50 transition-colors"
        onMouseDown={handleResizeStart}
      />
      <div
        data-testid="entity-detail-panel"
        className="shrink-0 bg-zinc-950 border-l border-zinc-800 flex flex-col"
        style={{ width: panelWidth }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white font-mono">{panelTitle}</h2>
          <div className="flex items-center gap-2">
            {canEditSchema && allowSchemaEdit && (
              <button
                data-testid="entity-detail-edit-fields"
                onClick={() => setSchemaOpen(true)}
                className="px-3 py-2 text-zinc-300 hover:text-white hover:bg-zinc-900 border border-zinc-800 rounded-md transition-colors flex items-center gap-2"
                type="button"
                title="Edit Fields (Schema)"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span className="text-sm">Edit Fields</span>
              </button>
            )}
            <button
              onClick={handleDelete}
              className="p-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-900 rounded-md transition-colors"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button
              onClick={handleClose}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-md transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {properties.filter((p) => p.name !== 'taskKey').map((prop) => (
            <div key={prop.name}>
              {prop.type === 'richtext' ? (
                renderInput(prop)
              ) : (
                <>
                  <label className="block text-sm font-medium text-zinc-400 mb-2 capitalize">{prop.name}</label>
                  {renderInput(prop)}
                </>
              )}
            </div>
          ))}

          {isTask && (
            <AttachmentsSection
              projectId={projectId}
              entity={entity}
              values={values}
              canAttach={canAttach}
              onServerEntity={onServerEntity}
              onApplyProperties={applyEntityPropertiesFromServer}
            />
          )}

          <CommentsSection
            entity={entity}
            comments={comments}
            canComment={canComment}
            entities={entities}
            onEntityClick={onEntityClick}
            onAddComment={handleAddComment}
            user={user}
            editingCommentId={editingCommentId}
            commentDraftById={commentDraftById}
            commentDirtyById={commentDirtyById}
            onEditComment={handleEditComment}
            onCommentDraftChange={handleCommentDraftChange}
            onSaveComment={handleSaveComment}
            onCancelEditComment={handleCancelEditComment}
            onDeleteComment={handleDeleteComment}
            onNewCommentDraftChange={handleNewCommentDraftChange}
          />
        </div>
      </div>

      {canEditSchema && allowSchemaEdit && (
        <SchemaEditorDialog
          isOpen={schemaOpen}
          onClose={() => setSchemaOpen(false)}
          entityTypeId={entityTypeId}
          viewId={viewId}
          properties={properties}
          onAddPropertyDefinition={onAddPropertyDefinition}
          onRemovePropertyDefinition={onRemovePropertyDefinition}
          onReorderProperties={onReorderProperties}
        />
      )}
    </div>
  );
};
