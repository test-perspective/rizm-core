import type { Entity, PropertyDefinition, BoardDivider, ViewConfig, UserSummary, ScmProjectConfig } from '../../types';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BoardColumn } from './BoardColumn';

interface SortableBoardColumnProps {
  columnId: string;
  title: string;
  count: number;
  items: string[];
  entityById: Record<string, Entity>;
  visibleProps: PropertyDefinition[];
  onEntityClick: (entity: Entity) => void;
  onEntityUpdate: (entityId: string, patch: Record<string, unknown>) => void;
  allEntities?: Entity[];
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
  onInlineCreate?: (
    columnId: string,
    title: string,
    options?: { order?: number }
  ) => string | undefined;
  titleLikeProperty?: string;
  isDragActive?: boolean;
}

export const SortableBoardColumn = ({
  columnId,
  title,
  count,
  items,
  entityById,
  visibleProps,
  onEntityClick,
  onEntityUpdate,
  allEntities = [],
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
  isDragActive,
}: SortableBoardColumnProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: columnId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={isSingleColumn ? "w-full" : ""}>
      <BoardColumn
        columnId={columnId}
        title={title}
        count={count}
        items={items}
        entityById={entityById}
        visibleProps={visibleProps}
        onEntityClick={onEntityClick}
        onEntityUpdate={onEntityUpdate}
        allEntities={allEntities}
        dragHandleProps={{ ...attributes, ...listeners }}
        isSingleColumn={isSingleColumn}
        boardDividers={boardDividers}
        view={view}
        onViewConfigUpdate={onViewConfigUpdate}
        usersById={usersById}
        projectId={projectId}
        scmIntegrationEnabled={scmIntegrationEnabled}
        scmConfig={scmConfig}
        scmConnected={scmConnected}
        scmLoading={scmLoading}
        onScmRefresh={onScmRefresh}
        onRenameColumn={onRenameColumn}
        onInlineCreate={onInlineCreate}
        titleLikeProperty={titleLikeProperty}
        isDragActive={isDragActive}
      />
    </div>
  );
};
