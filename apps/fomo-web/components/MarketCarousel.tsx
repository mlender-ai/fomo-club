"use client";

import { useEffect, useState } from "react";
import { scoreToColor, type MarketScore } from "@fomo/core";

/**
 * 시장 점수 캐러셀 — 나스닥·비트코인·코스피를 3초 간격 자동 슬라이드. docs/PIVOT_FEED_FIRST.md.
 *
 * 홈 상단. 각 자산을 FOMO Index와 같은 0~100 체감 점수로(색=구간색), 실측 등락률은 근거로.
 * 액션 제로: 탭/입력 없음. prefers-reduced-motion 이면 자동 슬라이드 정지(첫 항목 고정).
 */
const ROTATE_MS = 3000;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

function pct(n: number): string {
  const v = Math.round(n * 10) / 10;
  return `${v > 0 ? "+" : ""}${v}%`;
}

export function MarketCarousel({ markets }: { markets: MarketScore[] }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (idx >= markets.length) setIdx(0);
  }, [markets.length, idx]);

  useEffect(() => {
    if (markets.length <= 1 || prefersReducedMotion()) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % markets.length);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [markets.length]);

  if (markets.length === 0) return null;
  const m = markets[idx] ?? markets[0]!;
  const color = scoreToColor(m.score);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between rounded-xl border border-hairline bg-surface px-4 py-3">
        {/* 자산명 + 등락률(실측 근거) */}
        <div key={`${m.key}-l`} className="fomo-rise flex flex-col">
          <span className="font-pixel text-sm text-whiteout">{m.label}</span>
          <span className="mt-0.5 text-[11px]" style={{ color }}>
            {pct(m.changePct)} · 오늘
          </span>
        </div>
        {/* FOMO 체감 점수 */}
        <div key={`${m.key}-r`} className="fomo-rise flex items-baseline gap-1.5">
          <span className="font-pixel text-3xl leading-none" style={{ color }}>
            {m.score}
          </span>
          <span className="font-pixel text-[11px] text-muted">{m.state}</span>
        </div>
      </div>

      {/* 슬라이드 인디케이터 */}
      {markets.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
          {markets.map((mk, i) => (
            <span
              key={mk.key}
              className="h-1.5 w-1.5 rounded-full transition-colors"
              style={{ backgroundColor: i === idx ? "#FAFAFA" : "#333" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
