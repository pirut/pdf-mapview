import * as os from "node:os";

const DEFAULT_CONCURRENCY_CAP = 8;

export function resolveConcurrency(limit?: number): number {
  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    return Math.max(1, Math.floor(limit));
  }

  const available =
    typeof os.availableParallelism === "function" ? os.availableParallelism() : undefined;
  const cpus = available ?? os.cpus()?.length ?? 4;
  return Math.max(1, Math.min(DEFAULT_CONCURRENCY_CAP, cpus));
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workers = new Array<Promise<void>>(workerCount);
  for (let i = 0; i < workerCount; i += 1) {
    workers[i] = runWorker();
  }

  await Promise.all(workers);

  return results;
}
