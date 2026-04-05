import {
  type CollisionDetection,
  closestCenter,
  closestCorners,
} from '@dnd-kit/core';

export function createBoardCollisionDetection(displayColumns: string[]): CollisionDetection {
  return (args) => {
    const activeId = String(args.active.id);
    if (displayColumns.includes(activeId)) {
      const columnDroppables = args.droppableContainers.filter((container) =>
        displayColumns.includes(String(container.id))
      );
      return closestCenter({
        ...args,
        droppableContainers: columnDroppables,
      });
    }
    return closestCorners(args);
  };
}
