import { GripVertical, Trash2 } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PropertyDefinition } from '../../types';

type SortablePropertyRowProps = {
  prop: PropertyDefinition;
  onDelete: (propName: string) => void;
  canReorder: boolean;
};

export function SortablePropertyRow({ prop, onDelete, canReorder }: SortablePropertyRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: prop.name,
    disabled: !canReorder,
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
      className={`group flex items-center justify-between px-4 py-3 ${isDragging ? 'z-50 bg-zinc-800' : ''}`}
    >
      <div className="min-w-0 flex items-center gap-2 flex-1">
        {canReorder && (
          <div
            {...attributes}
            {...listeners}
            className="shrink-0 cursor-grab active:cursor-grabbing text-zinc-500 hover:text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 -ml-1 rounded"
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" />
          </div>
        )}
        <div className="min-w-0">
          <div className="text-sm text-white font-mono truncate">{prop.name}</div>
          <div className="text-xs text-zinc-500 mt-0.5">
            type: {prop.type}
            {prop.type === 'select' && prop.options ? ` (${prop.options.length} options)` : ''}
            {prop.type === 'labels' && prop.options ? ` (${prop.options.length} options)` : ''}
            {typeof prop.visible === 'boolean' ? ` / visible: ${prop.visible}` : ''}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onDelete(prop.name)}
        className="shrink-0 p-2 text-zinc-400 hover:text-red-300 hover:bg-zinc-950 rounded-md transition-colors"
        title="Delete"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
