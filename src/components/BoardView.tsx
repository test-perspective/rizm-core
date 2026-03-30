import { useCallback, useEffect, useMemo, useState } from 'react';
import { CircularProgress } from '@mui/material';
import { Entity, ViewConfig, PropertyDefinition, UserSummary, ScmProjectConfig } from '../types';
import {
  DndContext,
  DragOverlay,
  closestCorners,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CardContent } from './board/BoardCard';
import { SortableBoardColumn } from './board/SortableBoardColumn';
import { getVisibleBoardColumns } from '../utils/boardColumns';
import { extractTaskIds } from './board/boardDividers';
import { fetchBitbucketOAuthStatus, fetchProjectScmConfig } from '../api/scm';
import { useBoardViewDnd } from './board/useBoardViewDnd';

interface BoardViewProps {
  entities: Entity[];
  view: ViewConfig;
  properties: PropertyDefinition[];
  projectId: string;
  scmIntegrationEnabled: boolean;
  onEntityClick: (entity: Entity) => void;
  onEntityUpdate: (entityId: string, patch: Record<string, any>) => void;
  onViewConfigUpdate?: (view: ViewConfig) => void;
  allEntities?: Entity[]; // All entities in the project for link resolution
  usersById?: Record<string, UserSummary>; // User info for assignee display
  onRenameBoardColumn?: (from: string, to: string) => void | Promise<void>;
  /** Full-board loading overlay while a column rename is in progress */
  columnRenameInProgress?: boolean;
}

export const BoardView = ({
  entities,
  view,
  properties,
  projectId,
  scmIntegrationEnabled,
  onEntityClick,
  onEntityUpdate,
  onViewConfigUpdate,
  allEntities = [],
  usersById = {},
  onRenameBoardColumn,
  columnRenameInProgress = false,
}: BoardViewProps) => {
  const groupByProp = useMemo(
    () => (view.groupBy ? properties.find((p) => p.name === view.groupBy) : undefined),
    [properties, view.groupBy]
  );
  const hasValidGroupBy = Boolean(view.groupBy && groupByProp?.options);

  const orderedColumns = useMemo(() => {
    const allColumns = groupByProp?.options ?? [];
    if (view.columnOrder && view.columnOrder.length > 0) {
      const ordered = view.columnOrder.filter((col) => allColumns.includes(col));
      const unordered = allColumns.filter((col) => !view.columnOrder!.includes(col));
      return [...ordered, ...unordered];
    }
    return allColumns;
  }, [groupByProp?.options, view.columnOrder]);

  const columns = useMemo(() => getVisibleBoardColumns(view, properties), [view, properties]);

  const isSingleColumn = columns.length === 1;

  const visibleProps = properties.filter(
    (p) => view.visibleProperties.includes(p.name) && p.name !== view.groupBy && p.type !== 'richtext'
  );

  const [scmConfig, setScmConfig] = useState<ScmProjectConfig | null>(null);
  const [scmConnected, setScmConnected] = useState(false);
  const [scmLoading, setScmLoading] = useState(false);

  const refreshScmState = useCallback(async () => {
    if (!scmIntegrationEnabled) return;
    setScmLoading(true);
    try {
      const [config, status] = await Promise.all([
        fetchProjectScmConfig(projectId),
        fetchBitbucketOAuthStatus(),
      ]);
      setScmConfig(config);
      setScmConnected(status.connected);
    } catch (e) {
      console.error('Failed to load SCM state:', e);
      setScmConfig(null);
      setScmConnected(false);
    } finally {
      setScmLoading(false);
    }
  }, [projectId, scmIntegrationEnabled]);

  useEffect(() => {
    if (!scmIntegrationEnabled) {
      setScmConfig(null);
      setScmConnected(false);
      return;
    }
    refreshScmState();
  }, [scmIntegrationEnabled, projectId, refreshScmState]);

  const {
    entityById,
    itemsByColumn,
    activeEntity,
    activeDivider,
    activeColumnId,
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  } = useBoardViewDnd({
    columns,
    orderedColumns,
    entities,
    view,
    onEntityUpdate,
    onViewConfigUpdate,
  });

  if (!hasValidGroupBy) return null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="relative h-full min-h-0">
        <div
          className={[
            'h-full overflow-auto p-6',
            columnRenameInProgress ? 'pointer-events-none select-none' : '',
          ].join(' ')}
          aria-busy={columnRenameInProgress}
        >
          <SortableContext items={columns} strategy={horizontalListSortingStrategy}>
            <div className={isSingleColumn ? 'flex gap-4' : 'flex gap-4 min-w-max'}>
              {columns.map((column) => (
                <SortableBoardColumn
                  key={column}
                  columnId={column}
                  title={column}
                  count={extractTaskIds(itemsByColumn[column] ?? []).length}
                  items={itemsByColumn[column] ?? []}
                  entityById={entityById}
                  visibleProps={visibleProps}
                  onEntityClick={onEntityClick}
                  onEntityUpdate={onEntityUpdate}
                  allEntities={allEntities}
                  isSingleColumn={isSingleColumn}
                  boardDividers={view.boardDividers ?? []}
                  onViewConfigUpdate={onViewConfigUpdate}
                  view={view}
                  usersById={usersById}
                  projectId={projectId}
                  scmIntegrationEnabled={scmIntegrationEnabled}
                  scmConfig={scmConfig}
                  scmConnected={scmConnected}
                  scmLoading={scmLoading}
                  onScmRefresh={refreshScmState}
                  onRenameColumn={onRenameBoardColumn}
                />
              ))}
            </div>
          </SortableContext>
        </div>
        {columnRenameInProgress ? (
          <div
            className="absolute inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-zinc-950/80 backdrop-blur-sm"
            role="status"
            aria-live="polite"
            aria-label="Renaming column"
          >
            <CircularProgress size={40} sx={{ color: 'rgb(196 181 253)' }} />
            <p className="text-sm text-zinc-300">Renaming column…</p>
          </div>
        ) : null}
      </div>

      <DragOverlay>
        {activeEntity ? (
          <div className={isSingleColumn ? "w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 shadow-lg" : "w-80 bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-lg"}>
            <CardContent
              entity={activeEntity}
              visibleProps={visibleProps}
              allEntities={allEntities}
              onEntityClick={onEntityClick}
              variant={isSingleColumn ? 'row' : 'card'}
              usersById={usersById}
            />
          </div>
        ) : activeDivider ? (
          <div className={isSingleColumn ? "w-full shadow-lg" : "w-80 shadow-lg"}>
            <div className="relative flex items-center">
              <div className="flex-1 h-px bg-zinc-700"></div>
              <span className="px-3 text-zinc-300 text-sm font-medium">{activeDivider.title}</span>
              <div className="flex-1 h-px bg-zinc-700"></div>
            </div>
          </div>
        ) : activeColumnId ? (
          <div className="w-80 bg-zinc-950 border border-zinc-800 rounded-lg p-4 shadow-lg">
            <div className="font-semibold text-white">{activeColumnId}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
