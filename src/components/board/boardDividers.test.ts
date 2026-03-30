import { describe, it, expect } from 'vitest';
import type { BoardDivider } from '../../types';
import {
  isDividerId,
  DIVIDER_PREFIX,
  insertDividersIntoItems,
  extractTaskIds,
  extractDividerIds,
  deriveDividersFromItems,
} from './boardDividers';

describe('boardDividers', () => {
  describe('isDividerId', () => {
    it('should return true for divider IDs', () => {
      expect(isDividerId(`${DIVIDER_PREFIX}123`)).toBe(true);
      expect(isDividerId(`${DIVIDER_PREFIX}abc`)).toBe(true);
    });

    it('should return false for non-divider IDs', () => {
      expect(isDividerId('task-123')).toBe(false);
      expect(isDividerId('entity-id')).toBe(false);
      expect(isDividerId('')).toBe(false);
    });
  });

  describe('insertDividersIntoItems', () => {
    it('should insert dividers at the beginning when afterId is undefined', () => {
      const taskIds = ['task-1', 'task-2', 'task-3'];
      const dividers: BoardDivider[] = [
        {
          id: `${DIVIDER_PREFIX}div1`,
          title: 'Section 1',
          columnId: 'Backlog',
        },
      ];

      const result = insertDividersIntoItems(taskIds, dividers, 'Backlog');
      expect(result).toEqual([`${DIVIDER_PREFIX}div1`, 'task-1', 'task-2', 'task-3']);
    });

    it('should insert dividers after specified task', () => {
      const taskIds = ['task-1', 'task-2', 'task-3'];
      const dividers: BoardDivider[] = [
        {
          id: `${DIVIDER_PREFIX}div1`,
          title: 'Section 2',
          columnId: 'Backlog',
          afterId: 'task-1',
        },
      ];

      const result = insertDividersIntoItems(taskIds, dividers, 'Backlog');
      expect(result).toEqual(['task-1', `${DIVIDER_PREFIX}div1`, 'task-2', 'task-3']);
    });

    it('should handle multiple dividers with same afterId', () => {
      const taskIds = ['task-1', 'task-2'];
      const dividers: BoardDivider[] = [
        {
          id: `${DIVIDER_PREFIX}div1`,
          title: 'First',
          columnId: 'Backlog',
          afterId: 'task-1',
          sort: 1,
        },
        {
          id: `${DIVIDER_PREFIX}div2`,
          title: 'Second',
          columnId: 'Backlog',
          afterId: 'task-1',
          sort: 0,
        },
      ];

      const result = insertDividersIntoItems(taskIds, dividers, 'Backlog');
      // Should be sorted by sort value (0 before 1)
      expect(result).toEqual([
        'task-1',
        `${DIVIDER_PREFIX}div2`,
        `${DIVIDER_PREFIX}div1`,
        'task-2',
      ]);
    });

    it('should only insert dividers for the specified column', () => {
      const taskIds = ['task-1'];
      const dividers: BoardDivider[] = [
        {
          id: `${DIVIDER_PREFIX}div1`,
          title: 'Backlog Section',
          columnId: 'Backlog',
        },
        {
          id: `${DIVIDER_PREFIX}div2`,
          title: 'Todo Section',
          columnId: 'Todo',
        },
      ];

      const result = insertDividersIntoItems(taskIds, dividers, 'Backlog');
      expect(result).toEqual([`${DIVIDER_PREFIX}div1`, 'task-1']);
    });

    it('should return original taskIds when no dividers', () => {
      const taskIds = ['task-1', 'task-2'];
      const result = insertDividersIntoItems(taskIds, [], 'Backlog');
      expect(result).toEqual(taskIds);
    });
  });

  describe('extractTaskIds', () => {
    it('should filter out divider IDs', () => {
      const mixed = ['task-1', `${DIVIDER_PREFIX}div1`, 'task-2', `${DIVIDER_PREFIX}div2`];
      const result = extractTaskIds(mixed);
      expect(result).toEqual(['task-1', 'task-2']);
    });

    it('should return all items when no dividers', () => {
      const mixed = ['task-1', 'task-2'];
      const result = extractTaskIds(mixed);
      expect(result).toEqual(mixed);
    });
  });

  describe('extractDividerIds', () => {
    it('should filter out task IDs', () => {
      const mixed = ['task-1', `${DIVIDER_PREFIX}div1`, 'task-2', `${DIVIDER_PREFIX}div2`];
      const result = extractDividerIds(mixed);
      expect(result).toEqual([`${DIVIDER_PREFIX}div1`, `${DIVIDER_PREFIX}div2`]);
    });

    it('should return empty array when no dividers', () => {
      const mixed = ['task-1', 'task-2'];
      const result = extractDividerIds(mixed);
      expect(result).toEqual([]);
    });
  });

  describe('deriveDividersFromItems', () => {
    it('should calculate afterId for divider at the beginning', () => {
      const mixedIds = [`${DIVIDER_PREFIX}div1`, 'task-1', 'task-2'];
      const existingDividers: BoardDivider[] = [
        {
          id: `${DIVIDER_PREFIX}div1`,
          title: 'Section 1',
          columnId: 'Backlog',
          afterId: 'old-task', // Will be recalculated
        },
      ];

      const result = deriveDividersFromItems(mixedIds, existingDividers, 'Backlog');
      expect(result).toHaveLength(1);
      expect(result[0].afterId).toBeUndefined();
      expect(result[0].sort).toBe(0);
    });

    it('should calculate afterId for divider after a task', () => {
      const mixedIds = ['task-1', `${DIVIDER_PREFIX}div1`, 'task-2'];
      const existingDividers: BoardDivider[] = [
        {
          id: `${DIVIDER_PREFIX}div1`,
          title: 'Section 2',
          columnId: 'Backlog',
        },
      ];

      const result = deriveDividersFromItems(mixedIds, existingDividers, 'Backlog');
      expect(result).toHaveLength(1);
      expect(result[0].afterId).toBe('task-1');
      expect(result[0].sort).toBe(0);
    });

    it('should assign sort values for multiple dividers with same afterId', () => {
      const mixedIds = [
        'task-1',
        `${DIVIDER_PREFIX}div1`,
        `${DIVIDER_PREFIX}div2`,
        'task-2',
      ];
      const existingDividers: BoardDivider[] = [
        {
          id: `${DIVIDER_PREFIX}div1`,
          title: 'First',
          columnId: 'Backlog',
        },
        {
          id: `${DIVIDER_PREFIX}div2`,
          title: 'Second',
          columnId: 'Backlog',
        },
      ];

      const result = deriveDividersFromItems(mixedIds, existingDividers, 'Backlog');
      expect(result).toHaveLength(2);
      expect(result[0].afterId).toBe('task-1');
      expect(result[0].sort).toBe(0);
      expect(result[1].afterId).toBe('task-1');
      expect(result[1].sort).toBe(1);
    });

    it('should only update dividers for the specified column', () => {
      const mixedIds = [`${DIVIDER_PREFIX}div1`, 'task-1'];
      const existingDividers: BoardDivider[] = [
        {
          id: `${DIVIDER_PREFIX}div1`,
          title: 'Backlog Section',
          columnId: 'Backlog',
        },
        {
          id: `${DIVIDER_PREFIX}div2`,
          title: 'Todo Section',
          columnId: 'Todo',
          afterId: 'todo-task',
        },
      ];

      const result = deriveDividersFromItems(mixedIds, existingDividers, 'Backlog');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(`${DIVIDER_PREFIX}div1`);
    });

    it('should preserve title when recalculating', () => {
      const mixedIds = ['task-1', `${DIVIDER_PREFIX}div1`];
      const existingDividers: BoardDivider[] = [
        {
          id: `${DIVIDER_PREFIX}div1`,
          title: 'My Section',
          columnId: 'Backlog',
        },
      ];

      const result = deriveDividersFromItems(mixedIds, existingDividers, 'Backlog');
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('My Section');
      expect(result[0].afterId).toBe('task-1');
    });

    it('should skip dividers not in the mixed list', () => {
      const mixedIds = ['task-1'];
      const existingDividers: BoardDivider[] = [
        {
          id: `${DIVIDER_PREFIX}div1`,
          title: 'Section',
          columnId: 'Backlog',
        },
        {
          id: `${DIVIDER_PREFIX}div2`,
          title: 'Other Section',
          columnId: 'Backlog',
        },
      ];

      const result = deriveDividersFromItems(mixedIds, existingDividers, 'Backlog');
      expect(result).toHaveLength(0);
    });
  });
});
