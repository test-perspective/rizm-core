import { useCallback, useState } from 'react';
import type { Entity } from '../../types';
import { ChevronDown, ChevronRight, FilePlus, FileText, Folder, FolderPlus, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { Menu, MenuItem } from '@mui/material';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { buildInsideDropId } from './wikiDndTarget';

const INDENT_PX = 20;

type WikiPageRowProps = {
  page: Entity;
  depth: number;
  isFolder: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
  onToggleFolder: (folderId: string) => void;
  isActive: boolean;
  onSelectPage: (id: string) => void;
  onCreateChildPage: (parentId: string) => void;
  onCreateChildFolder: (parentId: string) => void;
  onDelete: (id: string) => void;
  onRename: (pageId: string, currentTitle: string) => void | Promise<void>;
  canEdit: boolean;
  displayTitle: string;
};

export function WikiPageRow({
  page,
  depth,
  isFolder,
  hasChildren,
  isExpanded,
  onToggleFolder,
  isActive,
  onSelectPage,
  onCreateChildPage,
  onCreateChildFolder,
  onDelete,
  onRename,
  canEdit,
  displayTitle,
}: WikiPageRowProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const { attributes, listeners, setNodeRef: setDraggableRef, isDragging } = useDraggable({
    id: page.id,
    disabled: !canEdit,
  });
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: buildInsideDropId(page.id),
    disabled: !canEdit,
  });

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      setDraggableRef(el);
      setDroppableRef(el);
    },
    [setDraggableRef, setDroppableRef]
  );

  const style = {
    opacity: isDragging ? 0.2 : 1,
    paddingLeft: depth * INDENT_PX,
  };

  const handleRowClick = () => {
    if (isFolder) {
      onToggleFolder(page.id);
    } else {
      onSelectPage(page.id);
    }
  };

  return (
    <div
      ref={setRef}
      data-page-id={page.id}
      style={style}
      {...(canEdit ? { ...attributes, ...listeners } : {})}
      className={`group w-full flex items-center gap-2 px-3 py-1 rounded-md transition-colors ${
        isActive ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-900'
      } ${isDragging ? 'z-50' : ''} ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''} ${
        isOver ? 'ring-2 ring-violet-500 ring-inset' : ''
      }`}
      title={canEdit ? 'Drag to move' : undefined}
    >
      {hasChildren ? (
        <button
          type="button"
          className="shrink-0 p-0.5 text-zinc-500 hover:text-zinc-400"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFolder(page.id);
          }}
          title={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
      ) : (
        <span className="w-4 h-4 shrink-0" />
      )}
      <button
        type="button"
        className="flex-1 text-left min-w-0 flex items-center gap-2"
        onClick={handleRowClick}
      >
        {isFolder ? (
          <Folder className="w-4 h-4 shrink-0 text-amber-500" />
        ) : (
          <FileText className="w-4 h-4 shrink-0 text-zinc-500" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{displayTitle || 'Untitled'}</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            {new Date(page.updatedAt).toLocaleString()}
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMenuAnchor(e.currentTarget);
        }}
        disabled={!canEdit}
        className="shrink-0 p-2 text-zinc-500 hover:text-zinc-400 hover:bg-zinc-950 disabled:text-zinc-700 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
        title="Menu"
        aria-label="Row menu"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      <Menu
        open={!!menuAnchor}
        onClose={() => setMenuAnchor(null)}
        anchorEl={menuAnchor}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        onClick={() => setMenuAnchor(null)}
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
          onClick={() => onRename(page.id, displayTitle || String(page.properties?.title ?? 'Untitled'))}
        >
          <Pencil className="w-4 h-4 mr-2 shrink-0" />
          Rename
        </MenuItem>
        <MenuItem
          onClick={() => onCreateChildPage(page.id)}
        >
          <FilePlus className="w-4 h-4 mr-2 shrink-0" />
          Create child page
        </MenuItem>
        <MenuItem
          onClick={() => onCreateChildFolder(page.id)}
        >
          <FolderPlus className="w-4 h-4 mr-2 shrink-0" />
          Create child folder
        </MenuItem>
        <MenuItem
          onClick={() => onDelete(page.id)}
          sx={{ color: 'rgb(248 113 113)' }}
        >
          <Trash2 className="w-4 h-4 mr-2 shrink-0" />
          Delete
        </MenuItem>
      </Menu>
    </div>
  );
}
