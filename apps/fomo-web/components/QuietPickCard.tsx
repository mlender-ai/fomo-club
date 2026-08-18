"use client";

import { useState } from "react";
import { buildQuietPickChips, quietPickSubLine } from "@fomo/core";
import type { CardSlotPayload, QuietPick } from "@/lib/fomoApi";
import { chartTokens } from "@/lib/chartTokens";
import { subjectName, subjectTicker } from "@/lib/companyDisplay";
import { isWatched, toggleWatch } from "@/lib/watchlist";
import { quietCardMinHeight } from "@/lib/quietCardLayout";
import { pickHook, repairPickCopy } from "@/lib/pickCopyRepair";
import { Sparkline } from "@/components/Sparkline";
import { StarIcon, CaretUpIcon, CaretDownIcon } from "@/components/icons";
import { StockLogoBadge } from "@/components/StockLogoBadge";

/**
 * 카드 v3 (WO-G1B) → 3슬롯 (WO-SUB-08) → 위계 재설계 (WO-SUB-HOOK PART 2).
 *
 * ## 3단 위계
 *
 * ```
 * [1순위] 훅 한 줄       ← 가장 큼. 시선이 여기 먼저 닿는다
 * [2순위] 칩 3개         ← 근거 숫자. 훅이 말하지 않는 축만
 * [3순위] 스파크라인 · 맥락 한 줄(슬롯 ②③)
 * [4순위] 되돌아보는 선  ← 회색 한 줄. 박스 없음
 * ```
 *
 * 실측(2026-08-14)에서는 이 순서가 없었다. 훅·서브라인·칩·차트·**박스로 감싼 무효선**이 전부
 * 비슷한 무게였고, 발굴 카드에서 3순위인 되돌아보는 선이 회사 정보보다 무거워 보였다.
 * 위계는 **크기·간격·무게로만** 조정한다 — 색과 폰트는 디자인 시스템 그대로다.
 *
 * ## 슬롯이 비면 카드가 줄어든다
 *
 * ②③ 은 선택 슬롯이다. 조건부 렌더만 쓰고 자리를 비워두는 컨테이너를 두지 않으며,
 * **카드 최소 높이도 조합에 따라 달라진다**(`quietCardMinHeight`). 조건부 렌더만으로는
 * 고정 높이 무대 안에서 빈 공간이 그대로 남는다 — 그것이 D5 였다.
 *
 * ## 배지는 카드에 두지 않는다
 *
 * 공시 근거와 벤더 요약의 구분(`kind`·`badge`·`vendor_only`)은 **디테일에서만** 표시한다.
 */

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

/**
 * 카드 칩 — **발행 시점에 굳은 것을 그대로 쓴다.** 없으면(구 페이로드) 같은 엔진으로 만든다.
 * 카드가 칩 문구를 따로 조립하면 훅과 축이 겹쳐 같은 숫자가 화면에 세 번 나온다(D2).
 */
export function cardChips(pick: QuietPick): string[] {
  if (pick.chips && pick.chips.length > 0) return pick.chips.map(repairPickCopy);
  return buildQuietPickChips({
    kind: pick.signal.kind,
    actorNoun: repairPickCopy(pick.signal.actors).replace(/\s*\d+명$/, ""),
    scale: repairPickCopy(pick.signal.scale),
    days: pick.signal.days,
    ...(typeof pick.signal.insiderCount === "number" ? { insiderCount: pick.signal.insiderCount } : {}),
  });
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
  /**
   * 유동성 문구를 중립 표기로 바꾼다. 괄호 안 실수치만 남기고 "얇아요" 같은 평가어를 뗀다.
   * 형식이 달라 못 뽑으면 원문을 그대로 쓴다 — 값을 지어내지 않는다.
   */
  const liquidityMeta = (() => {
    const note = pick.liquidityNote;
    if (!note) return null;
    const inner = note.match(/\(([^)]+)\)/)?.[1]?.trim();
    if (!inner) return note;
    return inner.startsWith("일") ? inner.replace(/^일\s*/, "일 거래 ") : inner;
  })();

  const series = pick.price.sparkline ?? [];
  // 신호 시작점 = days 거래일 전 근처. "여기서 돈이 들어왔다".
  const markerIndex = series.length >= 2
    ? Math.max(0, series.length - 1 - Math.min(pick.signal.days, series.length - 1))
    : undefined;
  const changePct = pick.price.changePct;
  const dir: "up" | "down" | "flat" = typeof changePct === "number" ? (changePct > 0 ? "up" : changePct < 0 ? "down" : "flat") : "flat";
  const chips = cardChips(pick);
  // payload 는 하루 한 번 구워진다 — 배치가 돌기 전까지 옛 문장이 오므로 읽는 쪽에서 고친다.
  const hook = pickHook(pick);
  // H6 — 서브라인은 훅과 같은 숫자면 표시하지 않는다("25일째" 아래 "25일째 계속" 금지).
  const subLine = quietPickSubLine(hook, pick.signal.progress);
  const minHeight = quietCardMinHeight({
    substance: Boolean(slots?.substance),
    // 값의 위치 블록을 앞면에서 뺐으므로 높이 계산에서도 뺀다 — 안 그러면 없어진 블록만큼
    // 빈 공간이 남는다(§2-3 "빈 공간을 남기지 않는다").
    valuation: false,
    signalStats: Boolean(pick.signalStats),
  });

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = toggleWatch(pick.subject.canonical, Date.now(), {});
    setWatched(now);
  };

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ minHeight }} data-testid="quiet-pick-card">
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
              {/*
                거래 규모 — **경고가 아니라 특징이다**(CTX-05 §3 · WO-RENDER-01 E-2).
                시총 894억·일 거래 5.2억은 이 제품의 컨셉 그 자체다. 큰 회사는 조용할 수 없다.
                종전에는 카드 하단에 `⚠ 거래가 얇아요` 로 붙어 약점처럼 읽혔다. 헤더의 중립
                정보로 옮기고 경고 아이콘을 뗀다.
              */}
              {liquidityMeta && (
                <>
                  <span aria-hidden>·</span>
                  <span data-testid="pick-liquidity-meta">{liquidityMeta}</span>
                </>
              )}
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

      {/* 가격 · 등락 — 3순위. 훅보다 작게 둔다(위계). */}
      <div className="mt-2 flex shrink-0 items-baseline gap-2">
        <span className="text-base font-semibold text-whiteout">
          {pick.price.currentText ?? pick.price.current.toLocaleString("en-US")}
        </span>
        {typeof changePct === "number" && (
          <span className="inline-flex items-center gap-1 text-[13px] font-medium tabular-nums" style={{ color: DIR_COLOR[dir] }}>
            {dir === "up" && <CaretUpIcon size={11} />}
            {dir === "down" && <CaretDownIcon size={11} />}
            {`${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%`}
          </span>
        )}
      </div>

      {/*
        증거 영역 — 훅 · 칩 · 스파크라인 · ② · ③.
        **스크롤한다.** 내용이 카드보다 길어지면 그대로 두면 되돌아보는 선과 푸터가 가려진다
        (2026-08-05 화면 실측). WO §4-2 는 "UI 에서 자르지 않는다" 이므로 강제 문안을 떼지 않고
        영역을 스크롤한다. 되돌아보는 선·푸터는 밖에 남겨 항상 보이게 한다 — 계약이라 가려지면 안 된다.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto">
      {/* ★1순위 훅 — 한 문장. 화면에서 가장 큰 글자다. */}
      <p className="mt-3 shrink-0 text-[22px] font-bold leading-8 text-whiteout" data-testid="pick-hook">{hook}</p>

      {/*
        재등장 사유(WO-DECK-01 §3-2) — 쿨다운·경과일 상한을 **그럼에도** 넘어 다시 올라온 이유.
        "어제보다 1일 더 이어졌어요" 는 여기 오지 않는다(그건 변화가 아니라 지속이다).
        서브라인보다 위에 둔다 — 같은 카드를 또 본 사람에게 가장 먼저 답할 질문이다.
      */}
      {pick.signal.reentry?.text && (
        <p className="mt-1 shrink-0 text-[12px] font-semibold text-orange" data-testid="pick-reentry">
          다시 올라온 이유 — {pick.signal.reentry.text}
        </p>
      )}

      {/* 서브라인 — 훅이 말하지 않는 변화만(H6). 같은 일수면 위에서 걸러져 렌더되지 않는다. */}
      {subLine && (
        <p className="mt-1 shrink-0 text-[12px] font-semibold" style={{ color: chartTokens.up }}>
          {subLine}
        </p>
      )}

      {/* ★2순위 칩 — 근거 숫자. 훅이 말한 축은 여기 없다(H4). */}
      <div className="mt-2.5 flex shrink-0 flex-wrap gap-1.5" data-testid="pick-chips">
        {chips.map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-hairline-soft bg-white/[0.04] px-2 py-1 text-[11px] font-semibold text-whiteout"
          >
            {chip}
          </span>
        ))}
      </div>

      {/* ── 이런 신호, 과거엔 어땠나 ── (WO-P2 §2)
          승률 + 하락 확률을 한 세트로. 통계 없으면 블록 통째 숨김(빈 껍데기 금지). */}
      {pick.signalStats && (
        <div className="mt-3 shrink-0 rounded-lg border border-hairline-soft bg-white/[0.03] px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-semibold text-muted">이런 신호, 과거엔 어땠나</span>
            <span className="text-[10px] text-muted">{pick.signalStats.sourceLabel}</span>
          </div>
          <p className="mt-1 text-sm font-semibold leading-5 text-whiteout">{repairPickCopy(pick.signalStats.headline)}</p>
          <p className="mt-0.5 text-[12px] leading-5 text-muted">{repairPickCopy(pick.signalStats.detail)}</p>
        </div>
      )}

      {/* ★3순위 스파크라인 30일 + 신호 시작점 ◆ */}
      {series.length >= 2 && (
        <div className="mt-3 shrink-0 border-y border-hairline-soft py-1.5" aria-label="최근 30거래일 가격 흐름 · ◆ 사기 시작한 시점">
          <Sparkline series={series.slice(-30)} height={44} {...(markerIndex !== undefined ? { markerIndex } : {})} />
          <span className="mt-1 block text-[10px] text-muted">◆ 사기 시작한 시점</span>
        </div>
      )}

      {/* ② 실체 — 어디서 돈을 버는가. 없으면 이 블록이 사라지고 카드가 줄어든다. */}
      {slots?.substance && (
        <p className="mt-3 shrink-0 text-[13px] leading-5 text-whiteout">{slots.substance.text}</p>
      )}

      {/*
        ③ 값의 위치(매출 막대 + 배수 선)는 **앞면에서 뺐다**(CTX-05 §2-1 · WO-RENDER-01 E-1).
        판단 순서상 5순위 이하인데 카드에서 색이 가장 강한 요소라 위계를 뒤집고 있었다.
        디테일 "값의 위치" 섹션에 남아 있다 — 지운 게 아니라 옮긴 것이다.
        블록이 빠지면 아래가 올라와 카드 높이가 줄어든다(§2-3).
      */}

      </div>

      {/* ★4순위 되돌아보는 선 = 계약 — 스크롤 영역 **밖**이라 항상 보인다.
          박스를 뺀 회색 한 줄이다(D4). 계약이라 지우지 않지만, 발굴 카드에서 1순위처럼 보이면 안 된다. */}
      <p className="mt-3 shrink-0 text-[12px] leading-5 text-muted" data-testid="recheck-line">
        되돌아보는 선 · {repairPickCopy(pick.invalidation.text)}
      </p>


      <div className="mt-auto flex shrink-0 items-center justify-between pt-3">
        <span className="font-pixel text-[11px] text-muted">더보기 →</span>
        {progress && <span className="text-[11px] font-medium text-muted">{progress}</span>}
      </div>
    </div>
  );
}
