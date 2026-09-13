import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Response cancellation finishes before an engine's async start() finishes
 * persisting and settling. Track that execution separately from stream reads.
 * The context is per request, like the existing LLM usage context; no timers,
 * global account map, or provider cancellation assumptions are involved.
 */
const generationWork = new AsyncLocalStorage<Set<Promise<unknown>>>();

export function runWithGenerationWork<T>(
  run: (completion: () => Promise<void> | undefined) => Promise<T>,
): Promise<T> {
  const work = new Set<Promise<unknown>>();
  return generationWork.run(work, () => run(() =>
    work.size ? Promise.allSettled([...work]).then(() => undefined) : undefined,
  ));
}

/** Wrap the entire engine/plan execution, including finalize and billing. */
export function trackGenerationWork<T>(run: () => Promise<T>): Promise<T> {
  const promise = run();
  const work = generationWork.getStore();
  if (work) {
    work.add(promise);
    // A start() rejection also errors its stream. Mark it handled here until
    // the response owner attaches its allSettled observer.
    void promise.catch(() => {});
  }
  return promise;
}
