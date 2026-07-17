"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { feedArchiveStartCursor, fetchFeedArchive, type FeedHubItem } from "./fomoApi";

/**
 * 피드 아카이브 무한 스크롤 훅 (2026-07-18 User Zero: "무한스크롤처럼 피드를 계속").
 * 오늘 피드 아래에 sentinel 을 두면, 보일 때마다 지난 날짜의 브리핑·버즈·회고 페이지를 이어 받는다.
 * 주말·휴장일은 빈 페이지라 최대 4페이지까지 연쇄 로드해 공백을 건너뛴다.
 */

export function feedItemKey(item: FeedHubItem): string {
  if (item.type === "narrative") return item.narrative.id;
  if (item.type === "sector") return item.sector.id;
  if (item.type === "stock-issue") return item.stockIssue.id;
  if (item.type === "calendar") return item.calendar.id;
  return item.content.id;
}

const EMPTY_PAGE_HOPS = 4;

export function useFeedArchive(enabled: boolean, existingIds?: ReadonlySet<string>) {
  const [archive, setArchive] = useState<FeedHubItem[]>([]);
  const [done, setDone] = useState(false);
  const cursorRef = useRef<string | null>(feedArchiveStartCursor());
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      let gained = 0;
      for (let hop = 0; hop < EMPTY_PAGE_HOPS && gained === 0; hop += 1) {
        const cursor = cursorRef.current;
        if (!cursor) {
          setDone(true);
          return;
        }
        const page = await fetchFeedArchive(cursor);
        cursorRef.current = page.nextBefore;
        const fresh = page.items.filter((item) => !existingIds?.has(feedItemKey(item)));
        if (fresh.length > 0) {
          gained = fresh.length;
          setArchive((prev) => {
            const seen = new Set(prev.map(feedItemKey));
            return [...prev, ...fresh.filter((item) => !seen.has(feedItemKey(item)))];
          });
        }
        if (!page.nextBefore) setDone(true);
      }
    } catch {
      // 아카이브 실패는 조용히 — 오늘 피드는 이미 떠 있다(다음 스크롤에서 재시도).
    } finally {
      loadingRef.current = false;
    }
  }, [existingIds]);

  useEffect(() => {
    if (!enabled || done) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "600px 0px" } // 바닥 도달 전에 미리 당겨 끊김 없는 스크롤
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, done, loadMore]);

  return { archive, sentinelRef, done };
}
