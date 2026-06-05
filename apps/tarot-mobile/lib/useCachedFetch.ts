import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "./api";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// 모듈 레벨 캐시 — 동일 URL에 대한 중복 fetch 방지 (탭 전환 시 재사용)
const fetchCache = new Map<string, CacheEntry<unknown>>();
// 인플라이트 요청 맵 — 동일 URL의 병렬 요청을 단일 Promise로 합산해 서버 부하 감소
const inFlightMap = new Map<string, Promise<unknown>>();

interface UseCachedFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * apiFetch를 래핑하는 SWR 스타일 훅.
 * ttlMs 이내 동일 URL은 캐시에서 즉시 반환 — 탭 전환 시 재fetch 없음.
 * 실패 시 error 메시지를 노출하고 refetch()로 캐시 무효화 후 재시도 가능.
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
  const [error, setError] = useState<string | null>(null);
  // refetch 트리거 — 증가 시 effect 재실행
  const [reloadKey, setReloadKey] = useState(0);
  const mountedRef = useRef(true);

  const refetch = useCallback(() => {
    fetchCache.delete(path);
    setReloadKey((k) => k + 1);
  }, [path]);

  useEffect(() => {
    mountedRef.current = true;

    const now = Date.now();
    const hit = fetchCache.get(path);
    if (hit && hit.expiresAt > now) {
      console.log("[useCachedFetch] hit:", path);
      setData(hit.data as T);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    // 이미 진행 중인 동일 URL 요청 재활용 — 중복 네트워크 호출 제거
    let fetchPromise = inFlightMap.get(path) as Promise<T> | undefined;
    if (!fetchPromise) {
      fetchPromise = apiFetch<T>(path).finally(() => {
        inFlightMap.delete(path);
      });
      inFlightMap.set(path, fetchPromise as Promise<unknown>);
    }

    fetchPromise
      .then((result) => {
        fetchCache.set(path, { data: result, expiresAt: Date.now() + ttlMs });
        console.log("[useCachedFetch] miss → cached:", path);
        if (mountedRef.current) {
          setData(result);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn("[useCachedFetch] error:", message);
        if (mountedRef.current) {
          setError(message);
          setLoading(false);
        }
      });

    return () => {
      mountedRef.current = false;
    };
  }, [path, ttlMs, reloadKey]);

  return { data, loading, error, refetch };
}
