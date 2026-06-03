import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "./api";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  staleAt: number; // 백그라운드 재검증 시작 임계값
}

// 모듈 레벨 캐시 — 동일 URL에 대한 중복 fetch 방지 (탭 전환 시 재사용)
const fetchCache = new Map<string, CacheEntry<unknown>>();
// 진행 중인 fetch 요청 추적 — 동일 URL 중복 요청 방지
const inflight = new Set<string>();

interface UseCachedFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * apiFetch를 래핑하는 SWR 스타일 훅.
 * - ttlMs 이내(fresh): 캐시에서 즉시 반환, fetch 없음.
 * - staleTtlMs 이내(stale): 캐시 데이터 즉시 표시 + 백그라운드에서 조용히 재검증.
 * - 만료(expired): loading 상태로 새 데이터 기다림.
 * stale-while-revalidate 패턴으로 첫 paint 지연 감소 (#316).
 */
export function useCachedFetch<T>(
  path: string,
  ttlMs = 15 * 60 * 1000,
  staleTtlMs?: number,
): UseCachedFetchResult<T> {
  const effectiveStaleTtl = staleTtlMs ?? ttlMs * 4;

  const [data, setData] = useState<T | null>(() => {
    const hit = fetchCache.get(path);
    if (!hit) return null;
    // stale 데이터도 초기값으로 사용 — 백그라운드에서 갱신
    return hit.staleAt > Date.now() ? (hit.data as T) : null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    const hit = fetchCache.get(path);
    // fresh 또는 stale 캐시가 있으면 loading=false로 시작
    return !(hit && hit.staleAt > Date.now());
  });
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const mountedRef = useRef(true);

  const refetch = useCallback(() => {
    fetchCache.delete(path);
    inflight.delete(path);
    setReloadKey((k) => k + 1);
  }, [path]);

  useEffect(() => {
    mountedRef.current = true;

    const now = Date.now();
    const hit = fetchCache.get(path) as CacheEntry<T> | undefined;

    if (hit) {
      if (hit.expiresAt > now) {
        // fresh: 캐시 그대로 사용, fetch 없음
        setData(hit.data);
        setLoading(false);
        setError(null);
        return;
      }
      if (hit.staleAt > now) {
        // stale: 즉시 표시 + 백그라운드 재검증 (loading 올리지 않음)
        setData(hit.data);
        setLoading(false);
        setError(null);
        if (!inflight.has(path)) {
          inflight.add(path);
          apiFetch<T>(path)
            .then((result) => {
              fetchCache.set(path, {
                data: result,
                expiresAt: Date.now() + ttlMs,
                staleAt: Date.now() + effectiveStaleTtl,
              });
              inflight.delete(path);
              if (mountedRef.current) setData(result);
            })
            .catch((err) => {
              inflight.delete(path);
              console.warn("[useCachedFetch] background revalidation failed:", err instanceof Error ? err.message : err);
            });
        }
        return;
      }
    }

    // expired 또는 캐시 없음: blocking fetch
    setLoading(true);
    setError(null);

    if (!inflight.has(path)) {
      inflight.add(path);
      apiFetch<T>(path)
        .then((result) => {
          fetchCache.set(path, {
            data: result,
            expiresAt: Date.now() + ttlMs,
            staleAt: Date.now() + effectiveStaleTtl,
          });
          inflight.delete(path);
          if (mountedRef.current) {
            setData(result);
            setError(null);
            setLoading(false);
          }
        })
        .catch((err) => {
          inflight.delete(path);
          const message = err instanceof Error ? err.message : String(err);
          console.warn("[useCachedFetch] error:", message);
          if (mountedRef.current) {
            setError(message);
            setLoading(false);
          }
        });
    }

    return () => {
      mountedRef.current = false;
    };
  }, [path, ttlMs, effectiveStaleTtl, reloadKey]);

  return { data, loading, error, refetch };
}
