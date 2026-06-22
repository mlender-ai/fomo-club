"use client";

import { useState } from "react";
import { MOCK_KEYWORD_CARDS, scoreToColor, type KeywordCard } from "@fomo/core";
import { KeywordDepthPage, StockInsightView } from "@/components/KeywordDepthPage";
import { getHistory } from "@/lib/keywordHistory";
import { getWatchlist } from "@/lib/watchlist";

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
  const [selected, setSelected] = useState<KeywordCard | null>(null);
  const [stockSel, setStockSel] = useState<string | null>(null);

  if (history.length === 0 && watchlist.length === 0) {
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
      {watchlist.length > 0 && (
        <section className="mb-6">
          <p className="mb-3 px-1 text-xs text-muted">관심 종목 ♥</p>
          <div className="flex flex-col gap-2.5">
            {watchlist.map((w) => (
              <button
                key={`${w.stock}-${w.ts}`}
                onClick={() => setStockSel(w.stock)}
                className="flex w-full items-center justify-between rounded-xl border border-hairline bg-surface px-4 py-3 text-left transition-colors hover:border-muted"
              >
                <span className="text-base font-semibold text-whiteout">{w.stock}</span>
                <span className="text-[11px] text-muted">{relativeTime(w.ts)}</span>
              </button>
            ))}
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
                <span className="font-pixel text-sm" style={{ color }}>
                  {h.fomoScore}
                </span>
                <span className="text-[11px] text-muted">{relativeTime(h.ts)}</span>
              </div>
            </button>
          );
        })}
      </div>

      {selected && <KeywordDepthPage card={selected} onClose={() => setSelected(null)} />}
      {stockSel && <StockInsightView stock={stockSel} onClose={() => setStockSel(null)} />}
    </div>
  );
}
