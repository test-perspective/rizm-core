import { beforeEach, describe, expect, it, vi } from 'vitest';

const { closestCenterMock, closestCornersMock } = vi.hoisted(() => ({
  closestCenterMock: vi.fn(),
  closestCornersMock: vi.fn(),
}));

vi.mock('@dnd-kit/core', () => ({
  closestCenter: closestCenterMock,
  closestCorners: closestCornersMock,
}));

import { createBoardCollisionDetection } from './boardCollisionDetection';

describe('createBoardCollisionDetection', () => {
  beforeEach(() => {
    closestCenterMock.mockReset();
    closestCornersMock.mockReset();
  });

  it('uses column-only droppables when a column is dragged', () => {
    closestCenterMock.mockReturnValue([{ id: 'Doing' }]);
    const collisionDetection = createBoardCollisionDetection(['Todo', 'Doing', 'Done']);
    const args = {
      active: { id: 'Todo' },
      droppableContainers: [
        { id: 'Todo' },
        { id: 'Doing' },
        { id: 'task-1' },
      ],
    };

    const result = collisionDetection(args as any);

    expect(result).toEqual([{ id: 'Doing' }]);
    expect(closestCenterMock).toHaveBeenCalledTimes(1);
    expect(closestCenterMock.mock.calls[0][0].droppableContainers).toEqual([
      { id: 'Todo' },
      { id: 'Doing' },
    ]);
    expect(closestCornersMock).not.toHaveBeenCalled();
  });

  it('falls back to the default collision strategy for card drags', () => {
    closestCornersMock.mockReturnValue([{ id: 'task-1' }]);
    const collisionDetection = createBoardCollisionDetection(['Todo', 'Doing', 'Done']);
    const args = {
      active: { id: 'task-1' },
      droppableContainers: [
        { id: 'Todo' },
        { id: 'Doing' },
        { id: 'task-1' },
      ],
    };

    const result = collisionDetection(args as any);

    expect(result).toEqual([{ id: 'task-1' }]);
    expect(closestCornersMock).toHaveBeenCalledWith(args);
    expect(closestCenterMock).not.toHaveBeenCalled();
  });
});
