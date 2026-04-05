import type { BoardDivider, Entity, PropertyDefinition, UserSummary } from '../../types';
import { GripVertical } from 'lucide-react';
import { CardContent } from './BoardCard';
import { BoardColumnShell } from './BoardColumnShell';
import { isDividerId } from './boardDividers';

export type BoardColumnDragPreviewProps = {
  columnTitle: string;
  taskCount: number;
  items: string[];
  entityById: Record<string, Entity>;
  visibleProps: PropertyDefinition[];
  allEntities?: Entity[];
  usersById?: Record<string, UserSummary>;
  isSingleColumn: boolean;
  boardDividers?: BoardDivider[];
};

/**
 * Non-interactive full-column preview shown in DragOverlay while reordering columns.
 */
export function BoardColumnDragPreview({
  columnTitle,
  taskCount,
  items,
  entityById,
  visibleProps,
  allEntities = [],
  usersById = {},
  isSingleColumn,
  boardDividers = [],
}: BoardColumnDragPreviewProps) {
  const dividerById = new Map<string, BoardDivider>();
  for (const d of boardDividers) {
    dividerById.set(d.id, d);
  }

  const variant = isSingleColumn ? 'row' : 'card';
  const cardShellClass =
    variant === 'row'
      ? 'bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2'
      : 'bg-zinc-900 border border-zinc-800 rounded-lg p-3';

  return (
    <div
      className={isSingleColumn ? 'w-full pointer-events-none shadow-lg' : 'pointer-events-none shadow-lg'}
      data-testid="board-column-drag-preview"
      aria-hidden
    >
      <BoardColumnShell
        isSingleColumn={isSingleColumn}
        headerStart={
          <>
            <span
              className="inline-flex shrink-0 cursor-grabbing touch-none select-none items-center text-zinc-500"
              aria-hidden
            >
              <GripVertical className="h-4 w-4" aria-hidden />
            </span>
            <h3 className="min-w-0 flex-1 truncate font-semibold text-white">{columnTitle}</h3>
          </>
        }
        headerEnd={<span className="text-xs text-zinc-500">{taskCount}</span>}
      >
        {items.map((id) => {
          if (isDividerId(id)) {
            const divider = dividerById.get(id);
            if (!divider) return null;
            return (
              <div key={id} className="relative flex items-center">
                <div className="flex-1 h-px bg-zinc-700" />
                <span className="px-3 text-zinc-300 text-sm font-medium">{divider.title}</span>
                <div className="flex-1 h-px bg-zinc-700" />
              </div>
            );
          }
          const entity = entityById[id];
          if (!entity) return null;
          return (
            <div key={id} className={`${cardShellClass} relative`}>
              <CardContent
                entity={entity}
                visibleProps={visibleProps}
                allEntities={allEntities}
                variant={variant}
                usersById={usersById}
                scmIntegrationEnabled={false}
              />
            </div>
          );
        })}
      </BoardColumnShell>
    </div>
  );
}
