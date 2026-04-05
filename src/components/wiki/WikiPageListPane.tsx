import { Fragment, useState } from 'react';
import type { Entity } from '../../types';
import type { WikiTreeRow } from './wikiTreeHelpers';
import { Menu, MenuItem } from '@mui/material';
import { FilePlus, FolderPlus, MoreVertical, Search } from 'lucide-react';
import {
  CollisionDetection,
  DragCancelEvent,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { WikiPageRow } from './WikiPageRow';
import { buildAfterDropId, buildBeforeDropId } from './wikiDndTarget';

type WikiPageListPaneProps = {
  width: number;
  canEdit: boolean;
  query: string;
  onQueryChange: (next: string) => void;
  pages: Entity[];
  treeRows: WikiTreeRow[];
  sortedPages: Entity[];
  selectedPageId: string | null;
  expandedFolderIds: Set<string>;
  onToggleFolder: (folderId: string) => void;
  titleById: Record<string, string>;
  onSelectPage: (id: string) => void;
  onCreateTopLevelPage: () => void;
  onCreateTopLevelFolder: () => void;
  onCreateChildPage: (parentId: string) => void;
  onCreateChildFolder: (parentId: string) => void;
  onDeletePage: (id: string) => void;
  onRename: (pageId: string, currentTitle: string) => void | Promise<void>;
  onMovePage?: (id: string) => void;
  pageListContainerRef: React.RefObject<HTMLDivElement>;
  activeId: string | null;
  onDragStart: (event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: (event: DragCancelEvent) => void;
  entityById: Record<string, Entity>;
};

type WikiDropGapProps = {
  id: string;
  canDrop: boolean;
};

function WikiDropGap({ id, canDrop }: WikiDropGapProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    disabled: !canDrop,
  });

  if (!canDrop) {
    return <div className="h-0" />;
  }

  return (
    <div
      ref={setNodeRef}
      className={`h-2 transition-colors duration-100 ${
        isOver ? 'bg-violet-500/70' : 'bg-transparent'
      }`}
      aria-hidden="true"
    />
  );
}

export function WikiPageListPane({
  width,
  canEdit,
  query,
  onQueryChange,
  pages,
  treeRows,
  sortedPages: _sortedPages,
  selectedPageId,
  expandedFolderIds,
  onToggleFolder,
  titleById,
  onSelectPage,
  onCreateTopLevelPage,
  onCreateTopLevelFolder,
  onCreateChildPage,
  onCreateChildFolder,
  onDeletePage,
  onRename,
  onMovePage,
  pageListContainerRef,
  activeId,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDragCancel,
  entityById,
}: WikiPageListPaneProps) {
  const [headerMenuAnchor, setHeaderMenuAnchor] = useState<HTMLElement | null>(null);
  const canDnD = canEdit && query.trim() === '';
  const canEditMenu = canEdit;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );
  const collisionDetection: CollisionDetection = (args) => {
    const pointerHits = pointerWithin(args);
    if (pointerHits.length > 0) return pointerHits;
    return closestCenter(args);
  };

  return (
    <div
      className="shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col"
      style={{ width }}
    >
      <div className="p-4 border-b border-zinc-800 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search pages..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <button
            onClick={(e) => setHeaderMenuAnchor(e.currentTarget)}
            disabled={!canEdit}
            className="p-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-md transition-colors"
            title="Add"
            type="button"
            aria-label="Add menu"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          <Menu
            open={!!headerMenuAnchor}
            onClose={() => setHeaderMenuAnchor(null)}
            anchorEl={headerMenuAnchor}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            sx={{
              '& .MuiPaper-root': {
                bgcolor: 'rgb(24 24 27)',
                color: 'rgb(244 244 245)',
                border: '1px solid rgb(39 39 42)',
              },
              '& .MuiMenuItem-root': { fontSize: '0.875rem' },
              '& .MuiMenuItem-root:hover': { bgcolor: 'rgb(39 39 42)' },
            }}
          >
            <MenuItem
              onClick={() => {
                onCreateTopLevelPage();
                setHeaderMenuAnchor(null);
              }}
            >
              <FilePlus className="w-4 h-4 mr-2 shrink-0" />
              Create top-level page
            </MenuItem>
            <MenuItem
              onClick={() => {
                onCreateTopLevelFolder();
                setHeaderMenuAnchor(null);
              }}
            >
              <FolderPlus className="w-4 h-4 mr-2 shrink-0" />
              Create top-level folder
            </MenuItem>
          </Menu>
        </div>
        <div className="text-xs text-zinc-500">
          {pages.length} page{pages.length === 1 ? '' : 's'}
        </div>
      </div>

      <div
        ref={pageListContainerRef}
        className="flex-1 overflow-auto p-2"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <div>
              {treeRows.length > 0 && (
                <WikiDropGap
                  id={buildBeforeDropId(treeRows[0].entity.id)}
                  canDrop={canDnD}
                />
              )}
              {treeRows.map((row, index) => {
                const { entity: p, depth, isFolder, hasChildren } = row;
                const isActive = p.id === selectedPageId;
                const displayTitle = titleById[p.id] !== undefined
                  ? titleById[p.id]
                  : String(p.properties?.title ?? 'Untitled');
                return (
                  <Fragment key={p.id}>
                    <WikiPageRow
                      page={p}
                      depth={depth}
                      isFolder={isFolder}
                      hasChildren={hasChildren}
                      isExpanded={expandedFolderIds.has(p.id)}
                      onToggleFolder={onToggleFolder}
                      isActive={isActive}
                      onSelectPage={onSelectPage}
                    onCreateChildPage={onCreateChildPage}
                    onCreateChildFolder={onCreateChildFolder}
                    onDelete={onDeletePage}
                    onRename={onRename}
                    canDrag={canDnD}
                    canEditMenu={canEditMenu}
                    onMove={onMovePage}
                      displayTitle={displayTitle}
                    />
                    {index < treeRows.length - 1 && (
                      <WikiDropGap
                        id={buildBeforeDropId(treeRows[index + 1].entity.id)}
                        canDrop={canDnD}
                      />
                    )}
                  </Fragment>
                );
              })}
              {treeRows.length > 0 && (
                <WikiDropGap
                  id={buildAfterDropId(treeRows[treeRows.length - 1].entity.id)}
                  canDrop={canDnD}
                />
              )}
              {treeRows.length === 0 && (
                <div className="p-4 text-sm text-zinc-500">No pages found.</div>
              )}
            </div>
          <DragOverlay>
            {activeId && entityById[activeId] ? (
              <div
                className="bg-zinc-800/70 border border-zinc-700 rounded-md px-3 py-2 shadow-lg"
                style={{ width }}
              >
                <div className="text-sm font-medium text-white truncate">
                  {String(entityById[activeId].properties?.title ?? 'Untitled')}
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}

