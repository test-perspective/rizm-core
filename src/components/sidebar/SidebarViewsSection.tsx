import { useState } from 'react';
import type { ViewConfig } from '../../types';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableViewRow } from './SortableViewRow';
import { getViewIcon } from './sidebarUtils';

interface SidebarViewsSectionProps {
  visibleViews: ViewConfig[];
  currentView: string;
  canEdit: boolean;
  onViewChange: (viewId: string) => void;
  onReorderViews?: (ordered: string[]) => void;
}

export function SidebarViewsSection({
  visibleViews,
  currentView,
  canEdit,
  onViewChange,
  onReorderViews,
}: SidebarViewsSectionProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveViewId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveViewId(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;
    const oldIndex = visibleViews.findIndex((v) => v.id === activeId);
    const newIndex = visibleViews.findIndex((v) => v.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;
    const ordered = arrayMove(
      visibleViews.map((v) => v.id),
      oldIndex,
      newIndex
    );
    onReorderViews?.(ordered);
  };

  return (
    <div className="flex-1 p-3">
      <div className="mb-4">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-2 mb-2">
          Views
        </h2>
        <div className="space-y-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={visibleViews.map((v) => v.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1">
                {visibleViews.map((view: ViewConfig) => (
                  <SortableViewRow
                    key={view.id}
                    view={view}
                    isActive={currentView === view.id}
                    canEdit={canEdit}
                    onClick={() => onViewChange(view.id)}
                    getViewIcon={getViewIcon}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeViewId ? (() => {
                const view = visibleViews.find((v) => v.id === activeViewId);
                if (!view) return null;
                return (
                  <div className="w-full max-w-xs bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 shadow-lg flex items-center gap-3 text-sm">
                    {getViewIcon(view.type)}
                    <span className="truncate text-white">{view.name}</span>
                  </div>
                );
              })() : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
