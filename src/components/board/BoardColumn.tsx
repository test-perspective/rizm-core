import { useCallback, useState } from 'react';
import type { Entity, PropertyDefinition, BoardDivider, ViewConfig, UserSummary, ScmProjectConfig } from '../../types';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableCard } from './BoardCard';
import { SortableDivider } from './BoardDivider';
import { BoardColumnHeaderTitle } from './BoardColumnHeaderTitle';
import { BoardColumnShell } from './BoardColumnShell';
import { getColumnDropId } from './boardDnd';
import { extractTaskIds, insertDividersIntoItems, deriveDividersFromItems, isDividerId } from './boardDividers';
import { computeOrderForMove, ORDER_KEY } from './boardOrder';
import { randomUUID } from '../../utils/uuid';
import { useAppDialog } from '../dialogs';
import { GripVertical } from 'lucide-react';
import { BoardInlineCreateCard } from './BoardInlineCreateCard';

export const BoardColumn = ({
  columnId,
  title,
  count,
  items,
  entityById,
  visibleProps,
  onEntityClick,
  onEntityUpdate,
  allEntities = [],
  dragHandleProps,
  isSingleColumn = false,
  boardDividers = [],
  view,
  onViewConfigUpdate,
  usersById = {},
  projectId,
  scmIntegrationEnabled,
  scmConfig,
  scmConnected,
  scmLoading,
  onScmRefresh,
  onRenameColumn,
  onInlineCreate,
  titleLikeProperty,
}: {
  columnId: string;
  title: string;
  count: number;
  items: string[];
  entityById: Record<string, Entity>;
  visibleProps: PropertyDefinition[];
  onEntityClick: (entity: Entity) => void;
  onEntityUpdate: (entityId: string, patch: Record<string, unknown>) => void;
  allEntities?: Entity[];
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  isSingleColumn?: boolean;
  boardDividers?: BoardDivider[];
  view: ViewConfig;
  onViewConfigUpdate?: (view: ViewConfig) => void;
  usersById?: Record<string, UserSummary>;
  projectId: string;
  scmIntegrationEnabled: boolean;
  scmConfig?: ScmProjectConfig | null;
  scmConnected?: boolean;
  scmLoading?: boolean;
  onScmRefresh?: () => void;
  onRenameColumn?: (from: string, to: string) => void | Promise<void>;
  onInlineCreate?: (columnId: string, title: string) => void;
  titleLikeProperty?: string;
}) => {
  const dialog = useAppDialog();
  const [isCreating, setIsCreating] = useState(false);
  // Keep the typed-but-unsubmitted title in memory so Escape/blur doesn't lose it (REQ-308).
  const [createDraft, setCreateDraft] = useState('');
  const dividerById = new Map<string, BoardDivider>();
  for (const d of boardDividers) {
    if (d.columnId === columnId) {
      dividerById.set(d.id, d);
    }
  }
  // Use a distinct droppable id so it doesn't collide with column sortable ids.
  const { setNodeRef, isOver } = useDroppable({ id: getColumnDropId(columnId) });

  const handleMoveCard = useCallback(
    (entityId: string, position: 'top' | 'bottom') => {
      const taskIds = extractTaskIds(items);
      const newTaskIds =
        position === 'top'
          ? [entityId, ...taskIds.filter((id) => id !== entityId)]
          : [...taskIds.filter((id) => id !== entityId), entityId];
      const { order, reindex } = computeOrderForMove(newTaskIds, entityId, entityById);
      onEntityUpdate(entityId, { [ORDER_KEY]: order });
      for (const r of reindex) {
        if (r.entityId !== entityId) {
          onEntityUpdate(r.entityId, { [ORDER_KEY]: r.order });
        }
      }
      if (onViewConfigUpdate && view.boardDividers && view.boardDividers.length > 0) {
        const newMixedIds = insertDividersIntoItems(newTaskIds, view.boardDividers, columnId);
        const updatedDividers = deriveDividersFromItems(newMixedIds, view.boardDividers, columnId);
        const otherDividers = (view.boardDividers ?? []).filter((d) => d.columnId !== columnId);
        const nextDividers = [...otherDividers, ...updatedDividers];
        onViewConfigUpdate({ ...view, boardDividers: nextDividers.length > 0 ? nextDividers : undefined });
      }
    },
    [items, entityById, onEntityUpdate, onViewConfigUpdate, view, columnId]
  );

  const columnTaskIds = extractTaskIds(items);

  const handleAddDivider = async () => {
    if (!onViewConfigUpdate) return;
    const sectionTitle = await dialog.prompt({
      title: 'Add Section',
      message: 'Enter section title:',
      placeholder: 'e.g. High Priority',
      confirmText: 'Add',
    });
    if (!sectionTitle || !sectionTitle.trim()) return;

    const newDividerId = `divider::${randomUUID()}`;
    const newDivider: BoardDivider = {
      id: newDividerId,
      title: sectionTitle.trim(),
      columnId,
    };

    const currentDividers = view.boardDividers ?? [];
    const nextView: ViewConfig = {
      ...view,
      boardDividers: [...currentDividers, newDivider],
    };
    onViewConfigUpdate(nextView);
  };

  return (
    <BoardColumnShell
      isSingleColumn={isSingleColumn}
      headerStart={
        <>
          <span
            className="inline-flex shrink-0 cursor-grab touch-none select-none items-center text-zinc-500 active:cursor-grabbing"
            {...dragHandleProps}
            aria-label="Drag to reorder column"
          >
            <GripVertical className="h-4 w-4" aria-hidden />
          </span>
          {onRenameColumn ? (
            <BoardColumnHeaderTitle title={title} onRename={onRenameColumn} />
          ) : (
            <h3 className="min-w-0 flex-1 truncate font-semibold text-white">{title}</h3>
          )}
        </>
      }
      headerEnd={
        <>
          {isSingleColumn && onViewConfigUpdate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAddDivider();
              }}
              className="px-2 py-1 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
              type="button"
              title="Add section"
            >
              + Section
            </button>
          )}
          <span className="text-xs text-zinc-500">{count}</span>
        </>
      }
      bodyRef={setNodeRef}
      isDropOver={isOver}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {items.map((id) => {
          if (isDividerId(id)) {
            const divider = dividerById.get(id);
            if (!divider) {
              return null;
            }
            return (
              <SortableDivider
                key={id}
                divider={divider}
                isSingleColumn={isSingleColumn}
                view={view}
                onViewConfigUpdate={onViewConfigUpdate}
              />
            );
          }
          const entity = entityById[id];
          if (!entity) return null;
          return (
            <SortableCard
              key={id}
              entity={entity}
              visibleProps={visibleProps}
              onClick={() => onEntityClick(entity)}
              onEntityUpdate={onEntityUpdate}
              allEntities={allEntities}
              onEntityClick={onEntityClick}
              variant={isSingleColumn ? 'row' : 'card'}
              columnTaskIds={columnTaskIds}
              onMoveCard={handleMoveCard}
              usersById={usersById}
              projectId={projectId}
              scmIntegrationEnabled={scmIntegrationEnabled}
              scmConfig={scmConfig ?? null}
              scmConnected={Boolean(scmConnected)}
              scmLoading={Boolean(scmLoading)}
              onScmRefresh={onScmRefresh}
            />
          );
        })}
      </SortableContext>
      {isCreating && onInlineCreate ? (
        <div className="mt-1">
          <BoardInlineCreateCard
            columnId={columnId}
            variant={isSingleColumn ? 'row' : 'card'}
            placeholder={
              titleLikeProperty === 'name' ? 'Enter a name...' : 'What needs to be done?'
            }
            initialValue={createDraft}
            onSubmit={(title) => {
              onInlineCreate(columnId, title);
              setCreateDraft('');
              setIsCreating(false);
            }}
            onCancel={(draft) => {
              setCreateDraft(draft);
              setIsCreating(false);
            }}
          />
        </div>
      ) : (
        onInlineCreate && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsCreating(true);
            }}
            className="mt-1 w-full rounded-md px-2 py-2 text-left text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            type="button"
            title="Create in this lane"
            data-testid={`board-lane-create-${columnId}`}
          >
            + Create
          </button>
        )
      )}
    </BoardColumnShell>
  );
};

