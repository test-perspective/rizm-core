import { GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ViewConfig } from '../../types';

type SortableViewRowProps = {
  view: ViewConfig;
  isActive: boolean;
  canEdit: boolean;
  onClick: () => void;
  getViewIcon: (type: string) => JSX.Element;
};

export function SortableViewRow({ view, isActive, canEdit, onClick, getViewIcon }: SortableViewRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: view.id,
    disabled: !canEdit,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
        isActive ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
      } ${isDragging ? 'z-50' : ''}`}
    >
      {canEdit && (
        <div
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab active:cursor-grabbing text-zinc-500 hover:text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </div>
      )}
      <button type="button" className="flex-1 min-w-0 flex items-center gap-3 text-left" onClick={onClick}>
        {getViewIcon(view.type)}
        <span className="truncate">{view.name}</span>
      </button>
    </div>
  );
}

