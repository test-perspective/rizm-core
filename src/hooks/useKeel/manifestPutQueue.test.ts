import { describe, expect, it, vi } from 'vitest';
import { enqueueManifestPut, waitForManifestPutQueueDrain } from './manifestPutQueue';

describe('enqueueManifestPut', () => {
  it('runs tasks for the same project in order', async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    enqueueManifestPut('p1', async () => {
      order.push('a-start');
      await new Promise((r) => {
        setTimeout(r, 20);
      });
      order.push('a-end');
    });
    enqueueManifestPut('p1', async () => {
      order.push('b');
    });
    await vi.advanceTimersByTimeAsync(25);
    expect(order).toEqual(['a-start', 'a-end', 'b']);
    vi.useRealTimers();
  });

  it('does not block a different project on the first project failure', async () => {
    const order: string[] = [];
    enqueueManifestPut('p1', async () => {
      order.push('fail');
      throw new Error('boom');
    });
    enqueueManifestPut('p2', async () => {
      order.push('other');
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(['fail', 'other']);
  });

  it('waitForManifestPutQueueDrain resolves when the queue is empty', async () => {
    await expect(waitForManifestPutQueueDrain('unused')).resolves.toBeUndefined();
  });

  it('waitForManifestPutQueueDrain resolves after queued work finishes', async () => {
    vi.useFakeTimers();
    let done = false;
    enqueueManifestPut('p1', async () => {
      await new Promise<void>((r) => {
        setTimeout(() => {
          done = true;
          r();
        }, 10);
      });
    });
    const drainPromise = waitForManifestPutQueueDrain('p1');
    await vi.advanceTimersByTimeAsync(15);
    await drainPromise;
    expect(done).toBe(true);
    vi.useRealTimers();
  });
});
