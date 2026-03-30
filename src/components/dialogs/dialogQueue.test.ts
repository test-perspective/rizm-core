import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateDialogId,
  resetDialogIdCounter,
  createDialogRequest,
  enqueue,
  dequeue,
  peek,
  isEmpty,
  queueLength,
} from './dialogQueue';
import type { DialogRequest } from './types';

describe('dialogQueue', () => {
  beforeEach(() => {
    resetDialogIdCounter();
  });

  describe('generateDialogId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateDialogId();
      const id2 = generateDialogId();
      const id3 = generateDialogId();

      expect(id1).toBe('dialog-1');
      expect(id2).toBe('dialog-2');
      expect(id3).toBe('dialog-3');
    });

    it('should reset counter correctly', () => {
      generateDialogId();
      generateDialogId();
      resetDialogIdCounter();
      const id = generateDialogId();
      expect(id).toBe('dialog-1');
    });
  });

  describe('createDialogRequest', () => {
    it('should create an alert request', () => {
      const resolve = () => {};
      const request = createDialogRequest('alert', { message: 'Test message' }, resolve);

      expect(request.id).toBe('dialog-1');
      expect(request.type).toBe('alert');
      expect(request.options).toEqual({ message: 'Test message' });
      expect(request.resolve).toBe(resolve);
    });

    it('should create a confirm request', () => {
      const resolve = () => {};
      const request = createDialogRequest(
        'confirm',
        { message: 'Are you sure?', danger: true },
        resolve
      );

      expect(request.type).toBe('confirm');
      expect(request.options).toEqual({ message: 'Are you sure?', danger: true });
    });

    it('should create a prompt request', () => {
      const resolve = () => {};
      const request = createDialogRequest(
        'prompt',
        { message: 'Enter value:', defaultValue: 'test', validate: (v: string) => (v ? null : 'Required') },
        resolve
      );

      expect(request.type).toBe('prompt');
      expect((request.options as { defaultValue?: string }).defaultValue).toBe('test');
      expect(typeof (request.options as { validate?: (v: string) => string | null }).validate).toBe('function');
    });
  });

  describe('queue operations', () => {
    it('should enqueue items', () => {
      const queue: DialogRequest[] = [];
      const request1 = createDialogRequest('alert', { message: 'First' }, () => {});
      const request2 = createDialogRequest('alert', { message: 'Second' }, () => {});

      const queue1 = enqueue(queue, request1);
      const queue2 = enqueue(queue1, request2);

      expect(queueLength(queue2)).toBe(2);
      expect(peek(queue2)?.options).toEqual({ message: 'First' });
    });

    it('should dequeue items', () => {
      const queue: DialogRequest[] = [];
      const request1 = createDialogRequest('alert', { message: 'First' }, () => {});
      const request2 = createDialogRequest('alert', { message: 'Second' }, () => {});

      let q = enqueue(queue, request1);
      q = enqueue(q, request2);
      q = dequeue(q);

      expect(queueLength(q)).toBe(1);
      expect(peek(q)?.options).toEqual({ message: 'Second' });
    });

    it('should handle empty queue', () => {
      const queue: DialogRequest[] = [];

      expect(isEmpty(queue)).toBe(true);
      expect(peek(queue)).toBeUndefined();
      expect(queueLength(queue)).toBe(0);

      const dequeued = dequeue(queue);
      expect(dequeued).toEqual([]);
    });

    it('should return correct isEmpty status', () => {
      let queue: DialogRequest[] = [];
      expect(isEmpty(queue)).toBe(true);

      const request = createDialogRequest('alert', { message: 'Test' }, () => {});
      queue = enqueue(queue, request);
      expect(isEmpty(queue)).toBe(false);

      queue = dequeue(queue);
      expect(isEmpty(queue)).toBe(true);
    });

    it('should process queue in FIFO order', () => {
      let queue: DialogRequest[] = [];
      const messages: string[] = [];

      const request1 = createDialogRequest('alert', { message: 'First' }, () => messages.push('First'));
      const request2 = createDialogRequest('alert', { message: 'Second' }, () => messages.push('Second'));
      const request3 = createDialogRequest('alert', { message: 'Third' }, () => messages.push('Third'));

      queue = enqueue(queue, request1);
      queue = enqueue(queue, request2);
      queue = enqueue(queue, request3);

      // Process queue
      while (!isEmpty(queue)) {
        const current = peek(queue);
        current?.resolve(undefined);
        queue = dequeue(queue);
      }

      expect(messages).toEqual(['First', 'Second', 'Third']);
    });
  });

  describe('immutability', () => {
    it('should not mutate original queue on enqueue', () => {
      const originalQueue: DialogRequest[] = [];
      const request = createDialogRequest('alert', { message: 'Test' }, () => {});

      const newQueue = enqueue(originalQueue, request);

      expect(originalQueue).toEqual([]);
      expect(newQueue).toHaveLength(1);
    });

    it('should not mutate original queue on dequeue', () => {
      const request = createDialogRequest('alert', { message: 'Test' }, () => {});
      const originalQueue = [request];

      const newQueue = dequeue(originalQueue);

      expect(originalQueue).toHaveLength(1);
      expect(newQueue).toHaveLength(0);
    });
  });
});
