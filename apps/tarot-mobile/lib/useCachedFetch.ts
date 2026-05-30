import { useState, useEffect, useRef } from "react";
import { apiFetch } from "./api";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// 모듈 레벨 캐시 — 동일 URL에 대한 중복 fetch 방지 (탭 전환 시 재사용)
const fetchCache = new Map<string, CacheEntry<unknown>>();

interface UseCachedFetchResult<T> {
  data: T | null;
  loading: boolean;
}

/**
 * apiFetch를 래핑하는 SWR 스타일 훅.
 * ttlMs 이내 동일 URL은 캐시에서 즉시 반환 — 탭 전환 시 재fetch 없음.
 */
export function useCachedFetch<T>(path: string, ttlMs = 15 * 60 * 1000): UseCachedFetchResult<T> {
  const [data, setData] = useState<T | null>(() => {
    const hit = fetchCache.get(path);
    return hit && hit.expiresAt > Date.now() ? (hit.data as T) : null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    const hit = fetchCache.get(path);
    return !(hit && hit.expiresAt > Date.now());
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const now = Date.now();
    const hit = fetchCache.get(path);
    if (hit && hit.expiresAt > now) {
      setData(hit.data as T);
      setLoading(false);
      return;
    }

    setLoading(true);

    apiFetch<T>(path)
      .then((result) => {
        fetchCache.set(path, { data: result, expiresAt: Date.now() + ttlMs });
        if (mountedRef.current) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn("[useCachedFetch] error:", err instanceof Error ? err.message : err);
        if (mountedRef.current) setLoading(false);
      });

    return () => {
      mountedRef.current = false;
    };
  }, [path, ttlMs]);

  return { data, loading };
}
