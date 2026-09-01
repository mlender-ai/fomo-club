"use client";

import { useState } from "react";
import type { QuietPickMacroCard } from "@/lib/fomoApi";
import { OverlayPortal } from "@/components/OverlayPortal";
import { StepBar } from "@/components/DepthSteps";
import { Sparkline } from "@/components/Sparkline";
import { canonicalName } from "@/lib/companyDisplay";
import { haptic } from "@/lib/haptics";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * MACRO-01 §D-2 — **거시 카드의 상세.**
 *
 * ## 왜 만들었나
 *
 * 카드에 `유가가 내리면 연료를 많이 쓰는 회사에 유리하고, 에너지 회사에 불리해요` 같은
 * 두 줄짜리 설명이 붙어 있었다. WO 가 그걸 내리라고 했고, **내리려면 받을 곳이 있어야 한다.**
 *
 * 그리고 그 전에 더 큰 구멍이 있었다 — 흐름·거시 카드는 덱에서 `onDetail` 없이 그려지고
 * 있어서 **CTA 가 아예 렌더되지 않았다.** DS-07 은 「어느 카드든 버튼이 같은 자리」라고
 * 적어 놨는데 실제로는 두 종류에 버튼이 없었다. 이 화면이 그 자리를 채운다.
 *
 * ## 한 걸음이다
 *
 * 종목 상세는 네 걸음이지만 여기는 한 걸음이다. 걸음을 나누는 이유는 설득을 순서대로
 * 쌓기 위해서인데, 거시 카드는 설득할 종목이 없다 — **무슨 일이 벌어졌고 우리 종목 중
 * 어디가 닿는가**, 그게 전부다. 없는 논증을 위해 걸음을 만들지 않는다.
 *
 * ## 예측하지 않는다
 *
 * `principle` 은 서버가 만든 **일반 원리**다. 화면이 「그래서 오를 거예요」를 덧붙이지
 * 않는다. 연결된 종목도 그냥 나열한다 — 순위를 매기면 추천이 된다.
 */

const CLOSE_MS = 260;

/** 하단 고정 바 높이만큼 본문을 비운다(DS-07 §3). */
const BOTTOM_PAD = "pb-[calc(96px+env(safe-area-inset-bottom))]";

function PickList({ items, testId }: { items: QuietPickMacroCard["favored"]; testId: string }) {
  return (
    <ul className="mt-s2 space-y-[2px]" data-testid={testId}>
      {items.map((item) => (
        <li key={item.canonical} className="flex items-baseline justify-between gap-s3">
          {/*
            **canonical 을 그대로 찍지 않는다**(WO-P6 ③). canonical 은 원장 조인 키라
            `Columbia Financial, Inc./Md/` 같은 원문이 그대로 들어 있다. 사람이 읽는 자리에는
            정규화된 이름만 나간다 — `canonicalName` 이 그 단일 창구다.
          */}
          <span className="min-w-0 truncate text-ds-body text-ds-text-1">{canonicalName(item.canonical)}</span>
          {/* 언제 짚었는지 같이 둔다 — 「우리가 짚었다」는 말은 날짜가 있어야 사실이 된다. */}
          <span className="shrink-0 font-mono text-ds-label text-ds-text-3">{item.pickedAt} 짚음</span>
        </li>
      ))}
    </ul>
  );
}

export function MacroDepth({ card, onClose }: { card: QuietPickMacroCard; onClose: () => void }) {
  const [closing, setClosing] = useState(false);

  const dismiss = () => {
    if (closing) return;
    haptic();
    setClosing(true);
    window.setTimeout(onClose, prefersReducedMotion() ? 0 : CLOSE_MS);
  };

  const linked = card.favored.length + card.hurt.length;

  return (
    <OverlayPortal>
      <div
        className={`fixed inset-0 z-[70] flex h-[100dvh] flex-col bg-ds-bg pt-[env(safe-area-inset-top)] ${closing ? "" : "ds-sheet-up"}`}
        style={{
          transform: closing ? "translateY(100%)" : undefined,
          transition: closing ? `transform ${CLOSE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)` : undefined,
        }}
        data-testid="macro-depth"
      >
        <header className="ds-header-line shrink-0" data-testid="macro-depth-header">
          <div className="mx-auto flex h-14 w-full max-w-[480px] items-center gap-s2 px-gutter">
            <button
              type="button"
              onClick={dismiss}
              aria-label="뒤로"
              className="tap-button -ml-2 flex h-touch w-touch shrink-0 items-center justify-center text-ds-text-2"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path
                  d="M12.5 4L6.5 10l6 6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium leading-tight text-ds-text-1">{card.indicatorName}</p>
              <p className="truncate font-mono text-ds-caption text-ds-text-3">{card.asOfLabel}</p>
            </div>
          </div>
        </header>

        <div className={`scrollbar-none min-h-0 flex-1 overflow-y-auto ${BOTTOM_PAD}`} data-testid="macro-depth-scroll">
          <div className="mx-auto w-full max-w-[480px] px-gutter">
            <p className="mt-s5 whitespace-pre-line break-keep text-ds-hook text-ds-text-1" data-testid="macro-depth-hook">
              {card.hook}
            </p>

            {/* 값은 여기서 한 번만 — 카드와 상세를 통틀어 같은 규칙이다(§D-2). */}
            <p className="mt-s3 font-mono text-ds-price text-ds-text-1" data-testid="macro-depth-value">
              {card.fromText} → {card.toText}
              <span
                className={`ml-s2 text-ds-label ${card.changePct < 0 ? "text-ds-down" : "text-ds-text-2"}`}
              >
                {`${card.changePct > 0 ? "+" : ""}${card.changePct.toFixed(1)}%`}
              </span>
            </p>

            {card.series.length >= 4 && (
              <div className="mt-s5" data-testid="macro-depth-figure">
                <Sparkline variant="ds" series={card.series} height={72} />
              </div>
            )}

            {/* ── 영향 설명 — 카드에서 내려온 줄이 여기 산다(§D-2) ── */}
            <section className="mt-s6 border-t-hair border-ds-border pt-s5">
              <p className="font-mono text-ds-label uppercase tracking-[0.06em] text-ds-text-2">왜 중요한가요</p>
              <p className="mt-s2 break-keep text-ds-body text-ds-text-1" data-testid="macro-depth-principle">
                {card.principle}
              </p>
              {/* 일반 원리라는 것을 밝힌다 — 이 종목이 어떻게 될지는 우리도 모른다. */}
              <p className="mt-s2 break-keep text-ds-caption text-ds-text-3">
                업종에 대한 일반적인 이야기예요. 개별 회사가 어떻게 될지는 알 수 없어요.
              </p>
            </section>

            {/* ── 연결된 종목 ── */}
            <section className="mt-s6 border-t-hair border-ds-border pt-s5">
              <p className="font-mono text-ds-label uppercase tracking-[0.06em] text-ds-text-2">
                {`우리가 짚은 곳 ${linked}곳`}
              </p>

              {card.favored.length > 0 && (
                <div className="mt-s3">
                  <p className="text-ds-label text-ds-text-2" data-testid="macro-depth-favored-label">
                    {card.hurt.length > 0 ? "유리한 쪽" : "여기 닿는 곳"}
                  </p>
                  <PickList items={card.favored} testId="macro-depth-favored" />
                </div>
              )}

              {card.hurt.length > 0 && (
                <div className="mt-s4">
                  <p className="text-ds-label text-ds-text-2">불리한 쪽</p>
                  <PickList items={card.hurt} testId="macro-depth-hurt" />
                </div>
              )}
            </section>
          </div>
        </div>

        <StepBar>
          <button
            type="button"
            onClick={dismiss}
            data-testid="macro-depth-close"
            className="tap-button flex h-touch w-full items-center justify-center rounded-block border-hair border-ds-border bg-ds-surface-2 text-[15px] text-ds-text-1"
          >
            닫기
          </button>
        </StepBar>
      </div>
    </OverlayPortal>
  );
}
