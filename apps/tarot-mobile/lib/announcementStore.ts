import { useState, useEffect, useRef } from "react";
import { apiFetch } from "./api";

export interface Announcement {
  id: string;
  title: string;
  type: string;
  publishedAt: string;
  source: string;
  url?: string;
}

interface CacheEntry {
  data: Announcement[];
  expiresAt: number;
}

const announcementCache = new Map<string, CacheEntry>();

const CACHE_TTL_MS = 15 * 60 * 1000; // 15분

interface UseAnnouncementsResult {
  items: Announcement[];
  loading: boolean;
}

export function useAnnouncements(symbol: string): UseAnnouncementsResult {
  const cacheKey = symbol;
  const cached = announcementCache.get(cacheKey);
  const initialItems = cached && cached.expiresAt > Date.now() ? cached.data : [];

  const [items, setItems] = useState<Announcement[]>(initialItems);
  const [loading, setLoading] = useState(initialItems.length === 0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const now = Date.now();
    const hit = announcementCache.get(cacheKey);
    if (hit && hit.expiresAt > now) {
      setItems(hit.data);
      setLoading(false);
      return;
    }

    setLoading(true);

    apiFetch<{ items: Announcement[] }>(
      `/api/market/announcements?symbol=${encodeURIComponent(symbol)}&limit=20`
    )
      .then((res) => {
        const data = Array.isArray(res.items) ? res.items : [];
        announcementCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
        if (mountedRef.current) {
          setItems(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn("[announcementStore] fetch error:", err instanceof Error ? err.message : err);
        if (mountedRef.current) setLoading(false);
      });

    return () => {
      mountedRef.current = false;
    };
  }, [symbol]);

  return { items, loading };
}
