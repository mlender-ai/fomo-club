"use client";

import { useState } from "react";
import type { QuietPick } from "@/lib/fomoApi";
import { chartTokens } from "@/lib/chartTokens";
import { isWatched, toggleWatch } from "@/lib/watchlist";
import { Sparkline } from "@/components/Sparkline";
import { StarIcon, CaretUpIcon, CaretDownIcon } from "@/components/icons";

/**
 * 카드 v3 (WO-G1B) — 한 장 = 발굴 + 증거 + 계약.
 * 훅 + 신호칩 + 스파크라인(신호 시작점 ◆) + 무효선. 점수·육각형 노출 없음.
 */

const SIGNAL_LABEL: Record<QuietPick["signal"]["kind"], string> = {
  insider_cluster: "내부자 클러스터",
  multi_cluster: "외국인+기관",
  institution_streak: "기관 매수",
  foreign_streak: "외국인 매수",
};

function marketTag(pick: QuietPick): string {
  if (pick.subject.market === "COIN") return "₿";
  if (pick.subject.country === "US") return "🇺🇸";
  return "🇰🇷";
}

function daysChip(pick: QuietPick): string {
  const d = pick.signal.days;
  if (pick.signal.kind === "insider_cluster") return d > 0 ? `최근 ${d}일` : "최근";
  return `${d}일째`;
}

const DIR_COLOR: Record<"up" | "down" | "flat", string> = {
  up: chartTokens.up,
  down: chartTokens.down,
  flat: "#8b8f98",
};

export function QuietPickCard({ pick, progress }: { pick: QuietPick; progress?: string }) {
  const [watched, setWatched] = useState(() => isWatched(pick.subject.canonical));
  const series = pick.price.sparkline ?? [];
  // 신호 시작점 = days 거래일 전 근처. "여기서 돈이 들어왔다".
  const markerIndex = series.length >= 2
    ? Math.max(0, series.length - 1 - Math.min(pick.signal.days, series.length - 1))
    : undefined;
  const changePct = pick.price.changePct;
  const dir: "up" | "down" | "flat" = typeof changePct === "number" ? (changePct > 0 ? "up" : changePct < 0 ? "down" : "flat") : "flat";

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = toggleWatch(pick.subject.canonical, Date.now(), {});
    setWatched(now);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 1행 — 종목명 · 시장태그 · 관심 */}
      <div className="flex shrink-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xl" aria-hidden>{marketTag(pick)}</span>
            <span className="truncate text-2xl font-bold text-whiteout">{pick.subject.canonical}</span>
          </div>
          {pick.subject.identity && (
            <span className="mt-0.5 block font-pixel text-xs text-muted">{pick.subject.identity}</span>
          )}
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={watched}
          aria-label={watched ? "관심 해제" : "관심"}
          className="shrink-0 rounded-full border border-hairline-soft px-2.5 py-1 text-xs font-semibold"
          style={watched ? { color: chartTokens.up, borderColor: chartTokens.up } : { color: "#8b8f98" }}
        >
          <StarIcon size={12} className="mr-1 inline-block align-[-1px]" />
          관심
        </button>
      </div>

      {/* 가격 · 등락 */}
      <div className="mt-2.5 flex shrink-0 items-baseline gap-2">
        <span className="text-lg font-bold text-whiteout">
          {pick.price.currentText ?? pick.price.current.toLocaleString("en-US")}
        </span>
        {typeof changePct === "number" && (
          <span className="inline-flex items-center gap-1 text-sm font-medium tabular-nums" style={{ color: DIR_COLOR[dir] }}>
            {dir === "up" && <CaretUpIcon size={11} />}
            {dir === "down" && <CaretDownIcon size={11} />}
            {`${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%`}
          </span>
        )}
      </div>

      {/* ★훅 — 이례성 앞 */}
      <p className="mt-3 shrink-0 text-lg font-bold leading-7 text-whiteout">{pick.hook}</p>

      {/* 신호칩 */}
      <div className="mt-2.5 flex shrink-0 flex-wrap gap-1.5">
        <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ backgroundColor: "rgba(216,255,58,0.12)", color: chartTokens.up }}>
          {SIGNAL_LABEL[pick.signal.kind]}
        </span>
        <span className="rounded-full border border-hairline-soft bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-whiteout">
          {daysChip(pick)}
        </span>
        <span className="rounded-full border border-hairline-soft bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-whiteout">
          {pick.signal.actors} {pick.signal.scale}
        </span>
      </div>

      {/* 스파크라인 30일 + 신호 시작점 ◆ */}
      {series.length >= 2 && (
        <div className="mt-3 shrink-0 border-y border-hairline-soft py-1.5" aria-label="최근 30거래일 가격 흐름 · ◆ 신호 시작점">
          <Sparkline series={series.slice(-30)} height={44} {...(markerIndex !== undefined ? { markerIndex } : {})} />
          <span className="mt-1 block text-[10px] text-muted">◆ 돈이 들어오기 시작한 자리</span>
        </div>
      )}

      {/* 무효선 = 계약 */}
      <div className="mt-3 shrink-0 rounded-lg bg-black/15 px-3 py-2">
        <span className="block text-[10px] font-semibold text-muted">무효선</span>
        <p className="mt-0.5 text-sm font-semibold leading-5 text-whiteout">{pick.invalidation.text}</p>
      </div>

      <div className="mt-auto flex shrink-0 items-center justify-between pt-3">
        <span className="font-pixel text-[11px] text-muted">더보기 →</span>
        {progress && <span className="text-[11px] font-medium text-muted">{progress}</span>}
      </div>
    </div>
  );
}
