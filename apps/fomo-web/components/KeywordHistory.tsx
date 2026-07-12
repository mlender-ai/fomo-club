"use client";

import { useEffect, useState } from "react";
import { MOCK_KEYWORD_CARDS, scoreToColor, type KeywordCard } from "@fomo/core";
import { KeywordDepthPage, StockInsightView } from "@/components/KeywordDepthPage";
import { MyDiscoveryPreview } from "@/components/MyDiscoveryPreview";
import { PerformanceProofPanel } from "@/components/PerformanceProofPanel";
import { RegretReceiptPanel } from "@/components/RegretReceiptPanel";
import { getHistory } from "@/lib/keywordHistory";
import { DISCOVERY_PERFORMANCE_UPDATED_EVENT, getDiscoverySeen } from "@/lib/discoveryPerformance";
import { getWatchlist, type WatchItem } from "@/lib/watchlist";
import { fetchMyRequests, type MyRequestRow } from "@/lib/fomoApi";
import { getSessionId } from "@/lib/session";

/**
 * 히스토리 탭 — 내가 본 키워드 카드 다시 보기. KEYWORD_CARD_FEED_DEV_SPEC v3.
 * 본 순서(최근 먼저). 탭하면 뎁스 다시 열림. 데이터는 mock 조회(id 매칭).
 */
function relativeTime(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function KeywordHistory() {
  const [history] = useState(() => getHistory());
  const [watchlist] = useState(() => getWatchlist());
  const [seenItems, setSeenItems] = useState(() => getDiscoverySeen());
  const [selected, setSelected] = useState<KeywordCard | null>(null);
  const [stockSel, setStockSel] = useState<WatchItem | null>(null);
  // 무로그인 대기함(WO 검색 요청→다음날 카드) — 이 기기의 요청 누적("내 요청").
  const [myRequests, setMyRequests] = useState<MyRequestRow[]>([]);

  useEffect(() => {
    let alive = true;
    fetchMyRequests(getSessionId())
      .then((d) => alive && setMyRequests(d.requests))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const refresh = () => setSeenItems(getDiscoverySeen());
    window.addEventListener(DISCOVERY_PERFORMANCE_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(DISCOVERY_PERFORMANCE_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  if (history.length === 0 && watchlist.length === 0 && seenItems.length === 0 && myRequests.length === 0) {
    return (
      <p className="mt-16 text-center text-sm leading-6 text-muted">
        아직 관심 둔 게 없어요.
        <br />
        카드를 넘기거나 종목에 ♥를 누르면 여기 쌓여요.
      </p>
    );
  }

  return (
    <div className="w-full">
      <RegretReceiptPanel items={seenItems} />
      <PerformanceProofPanel items={seenItems} />
      <MyDiscoveryPreview items={watchlist} onOpen={setStockSel} />

      {myRequests.length > 0 && (
        <section className="mb-5">
          <p className="mb-2 px-1 text-xs text-muted">내 요청 — 검색해서 신청한 종목</p>
          <div className="flex flex-col gap-2">
            {myRequests.map((row) => {
              const ready = row.status === "fulfilled" && row.resolved;
              return (
                <button
                  key={row.query}
                  type="button"
                  disabled={!ready}
                  onClick={() =>
                    ready &&
                    setStockSel({
                      stock: row.resolved!.canonical,
                      reason: `"${row.query}" 검색 요청으로 만들어진 카드예요.`,
                    } as WatchItem)
                  }
                  className="flex w-full items-center justify-between rounded-xl border border-hairline bg-surface px-4 py-3 text-left transition-colors hover:border-muted disabled:opacity-60"
                >
                  <span className="min-w-0 truncate text-sm font-semibold text-whiteout">
                    {ready ? row.resolved!.canonical : row.query}
                  </span>
                  <span className="shrink-0 text-[11px]" style={{ color: ready ? "#D8FF3A" : undefined }}>
                    {row.status === "fulfilled" ? "카드 준비됨" : row.status === "not-found" ? "찾지 못했어요" : "내일 카드로 준비 중"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {history.length > 0 && <p className="mb-3 px-1 text-xs text-muted">내가 본 키워드</p>}
      <div className="flex flex-col gap-2.5">
        {history.map((h) => {
          const color = scoreToColor(h.fomoScore);
          const full = MOCK_KEYWORD_CARDS.find((c) => c.id === h.id) ?? null;
          return (
            <button
              key={`${h.id}-${h.ts}`}
              onClick={() => full && setSelected(full)}
              disabled={!full}
              className="flex w-full items-center justify-between rounded-xl border border-hairline bg-surface px-4 py-3 text-left transition-colors hover:border-muted disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-whiteout">{h.keyword}</span>
                <span aria-hidden>{h.emoji}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold" style={{ color }}>
                  {h.fomoScore}
                </span>
                <span className="text-[11px] text-muted">{relativeTime(h.ts)}</span>
              </div>
            </button>
          );
        })}
      </div>

      {selected && <KeywordDepthPage card={selected} onClose={() => setSelected(null)} />}
      {stockSel && (
        <StockInsightView
          stock={stockSel.stock}
          context={{
            ...(stockSel.sector ? { fromTheme: stockSel.sector } : {}),
            ...(stockSel.reason ? { reason: stockSel.reason } : {}),
          }}
          onClose={() => setStockSel(null)}
        />
      )}
    </div>
  );
}
