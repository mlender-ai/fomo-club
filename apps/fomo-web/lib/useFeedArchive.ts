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

  // 활성화 즉시 3페이지(~9일치) 프리페치 — 스크롤 전에 피드가 이미 깊게(끊김 0, 페이지당 몇 KB).
  // 스크롤·IO 이벤트가 죽는 환경(히든 탭 등)에서도 최소 열흘치 피드는 보장된다.
  const prefetchedRef = useRef(false);
  useEffect(() => {
    if (!enabled || done || prefetchedRef.current) return;
    prefetchedRef.current = true;
    void (async () => {
      for (let i = 0; i < 3; i += 1) await loadMore();
    })();
  }, [enabled, done, loadMore]);

  useEffect(() => {
    if (!enabled || done) return;
    const el = sentinelRef.current;
    if (!el) return;

    const nearViewport = () => {
      const rect = el.getBoundingClientRect();
      return rect.top < (window.innerHeight || 0) + 600 && rect.bottom > -600;
    };

    // IntersectionObserver 기본 + 캡처 단계 scroll 폴백(중첩 스크롤 컨테이너·IO 미발화 환경 대비).
    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) void loadMore();
            },
            { rootMargin: "600px 0px" }
          )
        : null;
    observer?.observe(el);

    // rAF 스로틀 금지 — 히든 탭에선 rAF 가 멈춰 핸들러가 죽는다(실측). 타임스탬프 스로틀로.
    let lastRun = 0;
    const onScroll = () => {
      const now = Date.now();
      if (now - lastRun < 200) return;
      lastRun = now;
      if (nearViewport()) void loadMore();
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
    };
  }, [enabled, done, loadMore]);

  return { archive, sentinelRef, done };
}
