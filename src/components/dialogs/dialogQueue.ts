/**
 * Dialog queue utilities (pure functions).
 */
import type { DialogRequest, DialogType, AlertOptions, ConfirmOptions, PromptOptions } from './types';

let idCounter = 0;

/** Generate a new dialog ID */
export function generateDialogId(): string {
  idCounter += 1;
  return `dialog-${idCounter}`;
}

/** Reset ID counter (for tests) */
export function resetDialogIdCounter(): void {
  idCounter = 0;
}

/** Create a dialog request */
export function createDialogRequest<T>(
  type: DialogType,
  options: AlertOptions | ConfirmOptions | PromptOptions,
  resolve: (value: T) => void
): DialogRequest {
  return {
    id: generateDialogId(),
    type,
    options,
    resolve: resolve as (value: unknown) => void,
  };
}

/** Append to the queue */
export function enqueue(queue: DialogRequest[], request: DialogRequest): DialogRequest[] {
  return [...queue, request];
}

/** Peek at the front without removing */
export function peek(queue: DialogRequest[]): DialogRequest | undefined {
  return queue[0];
}

/** Remove the front item */
export function dequeue(queue: DialogRequest[]): DialogRequest[] {
  return queue.slice(1);
}

/** Whether the queue is empty */
export function isEmpty(queue: DialogRequest[]): boolean {
  return queue.length === 0;
}

/** Queue length */
export function queueLength(queue: DialogRequest[]): number {
  return queue.length;
}
