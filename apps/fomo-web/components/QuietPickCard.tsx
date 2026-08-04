"use client";

import { useState } from "react";
import type { CardSlotPayload, QuietPick } from "@/lib/fomoApi";
import { chartTokens } from "@/lib/chartTokens";
import { subjectName, subjectTicker } from "@/lib/companyDisplay";
import { isWatched, toggleWatch } from "@/lib/watchlist";
import { Sparkline } from "@/components/Sparkline";
import { StarIcon, CaretUpIcon, CaretDownIcon } from "@/components/icons";
import { StockLogoBadge } from "@/components/StockLogoBadge";
import { ValuationChart } from "@/components/ValuationChart";

/**
 * 카드 v3 (WO-G1B) → 3슬롯 (WO-SUB-08).
 *
 * ① 트리거(수급) + ② 실체 + ③ 값의 위치 + 무효선. 점수·육각형 노출 없음.
 *
 * ## 슬롯이 비면 아래가 올라온다
 *
 * ②③ 은 **선택 슬롯**이다. 조건부 렌더만 쓰고 자리를 비워두는 컨테이너를 두지 않는다 —
 * 빈 상자가 남는 것이 08 이 없애려는 바로 그 패턴이다(§4-1, 완료 조건 4).
 *
 * ## 실측 기준선 (2026-08-04)
 *
 * 유니버스 332장 중 **①만 128장(38.6%)** 이고 기본형은 **①③(58.7%)** 이다.
 * ①②③ 완비는 4장(1.2%)뿐이다. `UNCLASSIFIED` 95 + `BANK_FINANCIAL` 19 +
 * `MATURE_INCOME` 9 = 123장은 슬롯 ③ 축을 만들 수 없어 **지금과 동일하게 보이는 것이
 * 정상이다.** 억지로 채우지 않는다 — 비율은 `/api/fomo/card-slots/coverage` 가 낸다.
 *
 * ## 배지는 카드에 두지 않는다
 *
 * 공시 근거와 벤더 요약의 구분(`kind`·`badge`·`vendor_only`)은 **디테일에서만** 표시한다.
 * 카드 앞면은 2줄 예산이라 등급 칩이 들어가면 문장이 밀린다.
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

/**
 * 표시용 회사명(WO-P1·P6 ③) — 정규화는 전 화면 공통 창구(lib/companyDisplay)에 위임한다.
 * "Columbia Financial, Inc./Md/" → "Columbia Financial". 티커는 별도 행에 표기한다.
 */
export function displayName(pick: QuietPick): string {
  return subjectName(pick.subject);
}

/** 화면에 병기할 티커 — US 는 심볼, KR 은 6자리 종목코드. 없으면 undefined. */
function ticker(pick: QuietPick): string | undefined {
  return subjectTicker(pick.subject);
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

export function QuietPickCard({
  pick,
  progress,
  /** 3슬롯 페이로드. 없으면 ②③ 을 그리지 않는다 — 카드는 그대로 성립한다. */
  slots,
}: {
  pick: QuietPick;
  progress?: string;
  slots?: CardSlotPayload | undefined;
}) {
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
      {/* 1행 — 종목명(긴 이름 말줄임) · 티커 · 시장태그 · 관심 */}
      <div className="flex shrink-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {/* 로고(WO-P2 §3 복원) — KR 네이버 프록시 / US parqet, 실패 시 이니셜. */}
          <StockLogoBadge
            name={displayName(pick)}
            naverCode={pick.subject.naverCode}
            symbol={pick.subject.symbol}
          />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="text-xl" aria-hidden>{marketTag(pick)}</span>
              <span className="truncate text-2xl font-bold text-whiteout">{displayName(pick)}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 font-pixel text-xs text-muted">
              {/* 티커 병기 — US 는 심볼, KR 은 종목코드(검색·매수 이동에 필수, WO-P2 §3). */}
              {ticker(pick) && <span>{ticker(pick)}</span>}
              {ticker(pick) && pick.subject.identity && <span aria-hidden>·</span>}
              {pick.subject.identity && <span>{pick.subject.identity}</span>}
            </div>
          </div>
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

      {/* 신호 강화 재등장 진행 문구(WO-P4) — 재탕이 아니라 "계속되는 중"임을 밝힌다. */}
      {pick.signal.progress && (
        <p className="mt-1.5 shrink-0 text-[12px] font-semibold" style={{ color: chartTokens.up }}>
          {pick.signal.progress}
        </p>
      )}

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

      {/* ── 이런 신호, 과거엔 어땠나 ── (WO-P2 §2)
          승률 + 하락 확률 + 무효선 연결을 한 세트로. 통계 없으면 블록 통째 숨김(빈 껍데기 금지). */}
      {pick.signalStats && (
        <div className="mt-3 shrink-0 rounded-lg border border-hairline-soft bg-white/[0.03] px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-semibold text-muted">이런 신호, 과거엔 어땠나</span>
            <span className="text-[10px] text-muted">{pick.signalStats.sourceLabel}</span>
          </div>
          <p className="mt-1 text-sm font-semibold leading-5 text-whiteout">{pick.signalStats.headline}</p>
          <p className="mt-0.5 text-[12px] leading-5 text-muted">
            {pick.signalStats.detail} — 그래서 아래 무효선이 있어요
          </p>
        </div>
      )}

      {/* 스파크라인 30일 + 신호 시작점 ◆ */}
      {series.length >= 2 && (
        <div className="mt-3 shrink-0 border-y border-hairline-soft py-1.5" aria-label="최근 30거래일 가격 흐름 · ◆ 신호 시작점">
          <Sparkline series={series.slice(-30)} height={44} {...(markerIndex !== undefined ? { markerIndex } : {})} />
          <span className="mt-1 block text-[10px] text-muted">◆ 돈이 들어오기 시작한 자리</span>
        </div>
      )}

      {/* ② 실체 — 어디서 돈을 버는가. 없으면 이 블록이 사라지고 아래가 올라온다. */}
      {slots?.substance && (
        <p className="mt-3 shrink-0 text-[13px] leading-5 text-whiteout">{slots.substance.text}</p>
      )}

      {/* ③ 값의 위치 — 막대 + 배수 선 축소판. `renderable: false` 면 컴포넌트가 null 을 준다.
          **감싸는 박스도 조건부다** — 컴포넌트만 null 이면 빈 상자가 남는다(실측으로 겪은 결함). */}
      {slots?.valuation && (
        <div className="mt-3 shrink-0">
          <ValuationChart data={slots.valuation} compact />
        </div>
      )}

      {/* 무효선 = 계약 */}
      <div className="mt-3 shrink-0 rounded-lg bg-black/15 px-3 py-2">
        <span className="block text-[10px] font-semibold text-muted">무효선</span>
        <p className="mt-0.5 text-sm font-semibold leading-5 text-whiteout">{pick.invalidation.text}</p>
      </div>

      {/* 유동성 경고(WO-P4) — 얇으면 숨기지 않고 알린다. */}
      {pick.liquidityNote && (
        <p className="mt-2 shrink-0 text-[11px] text-muted">⚠ {pick.liquidityNote}</p>
      )}

      <div className="mt-auto flex shrink-0 items-center justify-between pt-3">
        <span className="font-pixel text-[11px] text-muted">더보기 →</span>
        {progress && <span className="text-[11px] font-medium text-muted">{progress}</span>}
      </div>
    </div>
  );
}
