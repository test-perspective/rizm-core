import { describe, it, expect } from 'vitest';
import type { Entity } from '../../types';
import { extractTaskIds } from './boardDividers';
import { computeOrderForMove, ORDER_KEY } from './boardOrder';

/**
 * Tests for the card "Move to top" / "Move to bottom" logic used in BoardColumn.handleMoveCard.
 * The logic: given items (mixed task+divider ids), entityId, position, entityById,
 * compute the new order and reindex updates.
 */
describe('boardCardMove', () => {
  const createEntity = (id: string, order: number | null): Entity => ({
    id,
    entityId: 'task',
    createdAt: 1000,
    updatedAt: 1000,
    properties: order !== null ? { [ORDER_KEY]: order } : {},
  });

  describe('move to top', () => {
    it('reorders taskIds putting moved entity first', () => {
      const items = ['e1', 'e2', 'e3'];
      const taskIds = extractTaskIds(items);
      const entityId = 'e3';
      const newTaskIds = [entityId, ...taskIds.filter((id) => id !== entityId)];
      expect(newTaskIds).toEqual(['e3', 'e1', 'e2']);
    });

    it('computes correct order for move to top', () => {
      const entityById: Record<string, Entity> = {
        e1: createEntity('e1', 1000),
        e2: createEntity('e2', 2000),
        e3: createEntity('e3', 3000),
      };
      const newTaskIds = ['e3', 'e1', 'e2'];
      const movedId = 'e3';
      const { order, reindex } = computeOrderForMove(newTaskIds, movedId, entityById);
      expect(order).toBe(0);
      expect(reindex).toEqual([]);
    });

    it('handles move to top when entity already first (no-op order change)', () => {
      const entityById: Record<string, Entity> = {
        e1: createEntity('e1', 1000),
        e2: createEntity('e2', 2000),
      };
      const newTaskIds = ['e1', 'e2'];
      const { order } = computeOrderForMove(newTaskIds, 'e1', entityById);
      expect(order).toBe(1000);
    });

    it('extracts taskIds correctly when items include dividers', () => {
      const items = ['e1', 'divider::d1', 'e2', 'e3'];
      const taskIds = extractTaskIds(items);
      expect(taskIds).toEqual(['e1', 'e2', 'e3']);
    });
  });

  describe('move to bottom', () => {
    it('reorders taskIds putting moved entity last', () => {
      const items = ['e1', 'e2', 'e3'];
      const taskIds = extractTaskIds(items);
      const entityId = 'e1';
      const newTaskIds = [...taskIds.filter((id) => id !== entityId), entityId];
      expect(newTaskIds).toEqual(['e2', 'e3', 'e1']);
    });

    it('computes correct order for move to bottom', () => {
      const entityById: Record<string, Entity> = {
        e1: createEntity('e1', 1000),
        e2: createEntity('e2', 2000),
        e3: createEntity('e3', 3000),
      };
      const newTaskIds = ['e2', 'e3', 'e1'];
      const movedId = 'e1';
      const { order, reindex } = computeOrderForMove(newTaskIds, movedId, entityById);
      expect(order).toBe(4000);
      expect(reindex).toEqual([]);
    });

    it('handles move to bottom when entity already last', () => {
      const entityById: Record<string, Entity> = {
        e1: createEntity('e1', 1000),
        e2: createEntity('e2', 2000),
      };
      const newTaskIds = ['e1', 'e2'];
      const { order } = computeOrderForMove(newTaskIds, 'e2', entityById);
      expect(order).toBe(2000);
    });
  });

  describe('reindex when column has items without order', () => {
    it('reindexes whole column when any item lacks order', () => {
      const entityById: Record<string, Entity> = {
        e1: createEntity('e1', 1000),
        e2: createEntity('e2', null),
        e3: createEntity('e3', 3000),
      };
      const newTaskIds = ['e2', 'e1', 'e3'];
      const { order, reindex } = computeOrderForMove(newTaskIds, 'e2', entityById);
      expect(order).toBe(0);
      expect(reindex).toContainEqual({ entityId: 'e1', order: 1000 });
      expect(reindex).toContainEqual({ entityId: 'e2', order: 0 });
      expect(reindex).toContainEqual({ entityId: 'e3', order: 2000 });
    });
  });
});
