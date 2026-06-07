// In-flight request deduplication middleware.
// When the same URL is requested while a fetch is already in progress,
// the second caller receives the same Promise — no duplicate network call.

const _inflight = new Map<string, Promise<unknown>>();

/**
 * Wraps a fetch factory with deduplication: concurrent calls for the same key
 * share a single in-flight Promise. The key is cleared once the request settles.
 */
export function dedupeFetch<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = _inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = factory().finally(() => {
    _inflight.delete(key);
  });
  _inflight.set(key, promise);
  return promise;
}

/** Returns how many requests are currently in-flight (useful for testing/debugging). */
export function inflightCount(): number {
  return _inflight.size;
}
