type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function nowMs(): number {
  return Date.now();
}

export function readCached<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= nowMs()) return null;
  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs: number): T {
  memoryCache.set(key, { value, expiresAt: nowMs() + Math.max(0, ttlMs) });
  return value;
}

export async function cachedGet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number
): Promise<T> {
  const cached = readCached<T>(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const previous = memoryCache.get(key)?.value as T | undefined;
  const promise = fetcher()
    .then((value) => setCached(key, value, ttlMs))
    .catch((err) => {
      if (previous !== undefined) return previous;
      throw err;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

export async function refreshCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number
): Promise<T> {
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const previous = memoryCache.get(key)?.value as T | undefined;
  const promise = fetcher()
    .then((value) => setCached(key, value, ttlMs))
    .catch((err) => {
      if (previous !== undefined) return previous;
      throw err;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

export function clearApiCache(): void {
  memoryCache.clear();
  inflight.clear();
}
