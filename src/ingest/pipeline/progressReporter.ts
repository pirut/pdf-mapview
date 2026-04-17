import type {
  IngestProgressCallback,
  IngestProgressEvent,
} from "../../shared/ingest";

/**
 * A typed, serialized reporter wrapping the user-supplied `onProgress`
 * callback. Calls are queued through a single in-flight promise so that
 * concurrent callers (e.g. the parallel upload workers) never observe two
 * overlapping `onProgress` invocations — each event settles before the next
 * begins.
 *
 * If the user callback throws or rejects, the error propagates out of the
 * `await` at the call site, aborting the surrounding ingest.
 */
export interface ProgressReporter {
  (event: IngestProgressEvent): Promise<void>;
}

/**
 * Wrap an optional `IngestProgressCallback` into a `ProgressReporter`.
 *
 * When `callback` is undefined, returns a no-op reporter that still honors the
 * `Promise<void>` shape so call sites don't need conditional awaits.
 */
export function createProgressReporter(
  callback?: IngestProgressCallback,
): ProgressReporter {
  if (!callback) {
    return noopReporter;
  }

  let chain: Promise<void> = Promise.resolve();

  return async (event) => {
    const previous = chain;
    const next = (async () => {
      await previous;
      await callback(event);
    })();
    // Keep the chain rejection-free so later awaiters don't re-throw a prior
    // error; the current awaiter still sees the rejection via `next`.
    chain = next.catch(() => {});
    await next;
  };
}

const noopReporter: ProgressReporter = async () => {};
