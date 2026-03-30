import { type CSSProperties, useState, useRef, useEffect } from 'react';
import type { BoardDivider as BoardDividerType, ViewConfig } from '../../types';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MoreVertical, X, Edit2 } from 'lucide-react';

interface SortableDividerProps {
  divider: BoardDividerType;
  isSingleColumn: boolean;
  onUpdate?: (updated: BoardDividerType) => void;
  onDelete?: () => void;
  view: ViewConfig;
  onViewConfigUpdate?: (view: ViewConfig) => void;
}

export const SortableDivider = ({
  divider,
  view,
  onViewConfigUpdate,
}: SortableDividerProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: divider.id });

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(divider.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  const handleSave = () => {
    if (editTitle.trim() && editTitle !== divider.title && onViewConfigUpdate) {
      const updated = { ...divider, title: editTitle.trim() };
      const nextDividers = (view.boardDividers ?? []).map((d) =>
        d.id === divider.id ? updated : d
      );
      const nextView: ViewConfig = {
        ...view,
        boardDividers: nextDividers,
      };
      onViewConfigUpdate(nextView);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(divider.title);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleDelete = () => {
    if (onViewConfigUpdate) {
      const nextDividers = (view.boardDividers ?? []).filter((d) => d.id !== divider.id);
      const nextView: ViewConfig = {
        ...view,
        boardDividers: nextDividers.length > 0 ? nextDividers : undefined,
      };
      onViewConfigUpdate(nextView);
    }
    setMenuOpen(false);
  };

  const handleRename = () => {
    setIsEditing(true);
    setMenuOpen(false);
  };

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (isEditing) {
    return (
      <div className="my-2">
        <div className="relative flex items-center">
          <div className="flex-1 h-px bg-zinc-700"></div>
          <input
            ref={inputRef}
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="mx-3 bg-zinc-800 text-white text-sm px-2 py-1 rounded border border-zinc-700 focus:outline-none focus:border-violet-500"
          />
          <div className="flex-1 h-px bg-zinc-700"></div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={['my-2', isDragging ? 'opacity-30' : ''].join(' ')}
      {...attributes}
      {...listeners}
    >
      <div className="relative flex items-center group">
        <div className="flex-1 h-px bg-zinc-700"></div>
        <div className="relative shrink-0 flex items-center gap-2 px-3">
          <span className="text-zinc-300 text-sm font-medium whitespace-nowrap">{divider.title}</span>
          <div className="relative shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" ref={menuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
              type="button"
              aria-label="Menu"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-1 w-32 bg-zinc-900 border border-zinc-800 rounded-lg shadow-lg z-50">
                <div className="py-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRename();
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-800 transition-colors flex items-center gap-2"
                    type="button"
                  >
                    <Edit2 className="w-3 h-3" />
                    Rename
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete();
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-zinc-800 transition-colors flex items-center gap-2"
                    type="button"
                  >
                    <X className="w-3 h-3" />
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 h-px bg-zinc-700"></div>
      </div>
    </div>
  );
};
