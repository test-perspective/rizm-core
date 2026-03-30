/**
 * Serializes manifest PUTs per project so each request sees the latest ETag
 * after the previous write completes (reduces 412 Precondition Failed races).
 */
const manifestPutTails = new Map<string, Promise<unknown>>();

export function enqueueManifestPut(projectId: string, task: () => Promise<void>): void {
  const prev = manifestPutTails.get(projectId) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(() =>
    task().catch((err) => {
      console.error('[manifest.put.queue]', err);
    })
  );
  manifestPutTails.set(projectId, next);
  void next.finally(() => {
    if (manifestPutTails.get(projectId) === next) {
      manifestPutTails.delete(projectId);
    }
  });
}

/** Resolves after all manifest PUTs currently queued for this project have settled. */
export function waitForManifestPutQueueDrain(projectId: string): Promise<void> {
  const tail = manifestPutTails.get(projectId);
  return tail ? tail.then(() => undefined) : Promise.resolve();
}
