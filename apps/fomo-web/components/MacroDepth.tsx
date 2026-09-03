"use client";

import { useMemo, useState } from "react";
import type { QuietPickMacroCard } from "@/lib/fomoApi";
import { OverlayPortal } from "@/components/OverlayPortal";
import { StepBar, StepDots, StepNext, WatchStep, WatchAction } from "@/components/DepthSteps";
import { Sparkline } from "@/components/Sparkline";
import { canonicalName } from "@/lib/companyDisplay";
import { toggleWatch } from "@/lib/watchlist";
import { haptic } from "@/lib/haptics";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * DETAIL-01 §A — **거시 카드의 상세. 네 걸음.**
 *
 * ## 왜 한 걸음에서 네 걸음이 됐나
 *
 * 처음 만들 때는 한 걸음이었다. 「거시 카드는 설득할 종목이 없으니 없는 논증을 위해 걸음을
 * 만들지 않는다」고 적어 뒀는데, **그 판단이 틀렸다.** 이 카드에는 서로 다른 네 개의 질문이
 * 있고, 한 장에 쌓아 두면 읽는 순서가 사라진다.
 *
 * ```
 * 1  무슨 일인가       값 · 변화 · 60일 추이 · 1년 밴드에서 어디쯤
 * 2  무슨 영향이 있나   유리한 업종 · 불리한 업종      ← 이 카드의 존재 이유
 * 3  우리 중 어디가 닿나  우리가 짚은 종목 + 짚은 날짜
 * 4  즐겨찾기          지표 담기
 * ```
 *
 * **2걸음이 이 카드의 존재 이유다**(§A-2). 지표가 움직였다는 것만으로는 뉴스이고,
 * 뉴스 앱과 경쟁하지 않는다.
 *
 * ## 예측하지 않는다
 *
 * `principle` 과 업종 목록은 전부 **일반 원리**다. 화면이 「그래서 오를 거예요」를 덧붙이지
 * 않는다. 연결된 종목도 그냥 나열한다 — 순위를 매기면 추천이 된다.
 */

const CLOSE_MS = 260;
const BOTTOM_PAD = "pb-[calc(96px+env(safe-area-inset-bottom))]";

type StepId = "what" | "effect" | "ours" | "watch";

const STEP_NEXT_LABEL: Record<StepId, string> = {
  what: "무슨 영향이 있는지 보기",
  effect: "우리 종목 중 어디가 닿는지 보기",
  ours: "계속 지켜보기",
  watch: "",
};

function PickList({
  items,
  testId,
  resolveStock,
}: {
  items: QuietPickMacroCard["favored"];
  testId: string;
  resolveStock?: ((canonical: string) => (() => void) | undefined) | undefined;
}) {
  return (
    <ul className="mt-s2 space-y-[2px]" data-testid={testId}>
      {items.map((item) => {
        /*
          **canonical 을 그대로 찍지 않는다**(WO-P6 ③). canonical 은 원장 조인 키라
          `Columbia Financial, Inc./Md/` 같은 원문이 그대로 들어 있다. 사람이 읽는 자리에는
          정규화된 이름만 나간다 — `canonicalName` 이 그 단일 창구다.
        */
        const name = canonicalName(item.canonical);
        const inner = (
          <>
            <span className="min-w-0 truncate text-ds-body text-ds-text-1">{name}</span>
            {/* 언제 짚었는지 같이 둔다 — 「우리가 짚었다」는 말은 날짜가 있어야 사실이 된다. */}
            <span className="shrink-0 font-mono text-ds-label text-ds-text-3">{item.pickedAt} 짚음</span>
          </>
        );
        const open = resolveStock?.(item.canonical);
        return (
          <li key={item.canonical}>
            {open ? (
              <button
                type="button"
                onClick={open}
                className="tap-button flex w-full items-baseline justify-between gap-s3 py-[3px] text-left"
              >
                {inner}
              </button>
            ) : (
              <div className="flex items-baseline justify-between gap-s3 py-[3px]">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SectorChips({ names, testId }: { names: readonly string[]; testId: string }) {
  return (
    <div className="mt-s2 flex flex-wrap gap-[6px]" data-testid={testId}>
      {names.map((name) => (
        <span key={name} className="rounded-full bg-ds-surface-2 px-s3 py-[3px] text-ds-label text-ds-text-1">
          {name}
        </span>
      ))}
    </div>
  );
}

export function MacroDepth({
  card,
  onClose,
  resolveStock,
}: {
  card: QuietPickMacroCard;
  onClose: () => void;
  /** 종목 → 그 종목 상세를 여는 함수(§D-3). 열 수 없으면 `undefined`(눌리지 않는 버튼 금지). */
  resolveStock?: (canonical: string) => (() => void) | undefined;
}) {
  const [closing, setClosing] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [watched, setWatched] = useState(false);

  const linked = card.favored.length + card.hurt.length;
  const favorSectors = card.favorSectors ?? [];
  const hurtSectors = card.hurtSectors ?? [];
  const series = card.detailSeries?.length ? card.detailSeries : card.series;

  /** 데이터 없는 걸음은 건너뛰고 **점도 그만큼 줄어든다**(§C). */
  const steps = useMemo<StepId[]>(() => {
    const out: StepId[] = ["what"];
    if (card.principle || favorSectors.length > 0 || hurtSectors.length > 0) out.push("effect");
    if (linked > 0) out.push("ours");
    out.push("watch");
    return out;
  }, [card.principle, favorSectors.length, hurtSectors.length, linked]);

  const index = Math.min(stepIndex, steps.length - 1);
  const step = steps[index]!;

  const dismiss = () => {
    if (closing) return;
    haptic();
    setClosing(true);
    window.setTimeout(onClose, prefersReducedMotion() ? 0 : CLOSE_MS);
  };
  const back = () => {
    if (index === 0) return dismiss();
    haptic();
    setStepIndex(index - 1);
  };
  const next = () => {
    if (index >= steps.length - 1) return;
    haptic();
    setStepIndex(index + 1);
  };
  const onWatch = () => {
    haptic();
    // 지표는 **id** 로 담는다 — 이름은 바뀔 수 있고, 알림은 id 로 찾는다.
    toggleWatch(card.indicatorId, Date.now(), { kind: "indicator", label: card.indicatorName });
    setWatched(true);
  };

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
              onClick={back}
              aria-label="뒤로"
              className="tap-button -ml-2 flex h-touch w-touch shrink-0 items-center justify-center text-ds-text-2"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path d="M12.5 4L6.5 10l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium leading-tight text-ds-text-1">{card.indicatorName}</p>
              <p className="truncate font-mono text-ds-caption text-ds-text-3">{card.asOfLabel}</p>
            </div>
            <StepDots total={steps.length} index={index} />
          </div>
        </header>

        <div className={`scrollbar-none min-h-0 flex-1 overflow-y-auto ${BOTTOM_PAD}`} data-testid="macro-depth-scroll">
          <div className="mx-auto w-full max-w-[480px] px-gutter">
            {step === "what" && (
              <>
                <p className="mt-s5 whitespace-pre-line break-keep text-ds-hook text-ds-text-1" data-testid="macro-depth-hook">
                  {card.hook}
                </p>
                {/* 값은 상세를 통틀어 여기 한 번만 — 카드와 상세에 같은 숫자를 두 번 두지 않는다. */}
                <p className="mt-s3 font-mono text-ds-price text-ds-text-1" data-testid="macro-depth-value">
                  {card.fromText} → {card.toText}
                  <span className={`ml-s2 text-ds-label ${card.changePct < 0 ? "text-ds-down" : "text-ds-text-2"}`}>
                    {`${card.changePct > 0 ? "+" : ""}${card.changePct.toFixed(1)}%`}
                  </span>
                </p>
                {series.length >= 4 && (
                  <div className="mt-s5" data-testid="macro-depth-figure">
                    <Sparkline variant="ds" series={series} height={72} />
                  </div>
                )}
                {/* 값 하나만 보면 높은지 낮은지 알 수 없다 — 밴드가 있어야 숫자가 뜻을 가진다. */}
                {card.band && (
                  <p className="mt-s4 break-keep text-ds-body text-ds-text-2" data-testid="macro-depth-band">
                    {card.band.label}
                  </p>
                )}
              </>
            )}

            {step === "effect" && (
              <>
                <p className="mt-s5 break-keep text-ds-hook text-ds-text-1">무슨 영향이 있나요</p>
                <p className="mt-s4 break-keep text-ds-body text-ds-text-1" data-testid="macro-depth-principle">
                  {card.principle}
                </p>

                {favorSectors.length > 0 && (
                  <section className="mt-s6">
                    <p className="font-mono text-ds-label uppercase tracking-[0.06em] text-ds-text-2">유리한 쪽</p>
                    <SectorChips names={favorSectors} testId="macro-depth-favor-sectors" />
                  </section>
                )}
                {hurtSectors.length > 0 && (
                  <section className="mt-s5">
                    <p className="font-mono text-ds-label uppercase tracking-[0.06em] text-ds-text-2">불리한 쪽</p>
                    <SectorChips names={hurtSectors} testId="macro-depth-hurt-sectors" />
                  </section>
                )}

                {/* 꼬리표는 반드시 붙인다(§A-2) — 이 종목이 어떻게 될지는 우리도 모른다. */}
                <p className="mt-s6 break-keep text-ds-caption text-ds-text-3">
                  일반적으로 알려진 관계예요. 실제로 어떻게 될지는 회사마다 달라요.
                </p>
              </>
            )}

            {step === "ours" && (
              <>
                <p className="mt-s5 break-keep text-ds-hook text-ds-text-1">우리가 짚은 종목 중 여기 닿는 곳</p>
                <p className="mt-s2 font-mono text-ds-label text-ds-text-3">{`최근 30일 · ${linked}곳`}</p>

                {card.favored.length > 0 && (
                  <section className="mt-s5">
                    <p className="text-ds-label text-ds-text-2" data-testid="macro-depth-favored-label">
                      {card.hurt.length > 0 ? "유리한 쪽" : "여기 닿는 곳"}
                    </p>
                    <PickList items={card.favored} testId="macro-depth-favored" resolveStock={resolveStock} />
                  </section>
                )}
                {card.hurt.length > 0 && (
                  <section className="mt-s5">
                    <p className="text-ds-label text-ds-text-2">불리한 쪽</p>
                    <PickList items={card.hurt} testId="macro-depth-hurt" resolveStock={resolveStock} />
                  </section>
                )}
              </>
            )}

            {step === "watch" && (
              <WatchStep
                title={`${card.indicatorName}를 계속 지켜볼까요`}
                subject="크게 움직이면 알려드려요"
                done={watched}
                doneText={`${card.indicatorName}가 크게 움직이면 알려드릴게요`}
              />
            )}
          </div>
        </div>

        <StepBar>
          {step === "watch" ? (
            <WatchAction done={watched} label={`${card.indicatorName} 담기`} onWatch={onWatch} onClose={dismiss} />
          ) : (
            <StepNext label={STEP_NEXT_LABEL[step]} onClick={next} />
          )}
        </StepBar>
      </div>
    </OverlayPortal>
  );
}
