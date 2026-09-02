"use client";

import { useMemo, useState } from "react";
import type { QuietPickFlowCard, FlowStockRow } from "@/lib/fomoApi";
import { sectorDisplayName } from "@fomo/core/keyword-cards/sector-display";
import { formatKrwShort } from "@fomo/core/keyword-cards/sector-flow";
import { OverlayPortal } from "@/components/OverlayPortal";
import { StepBar, StepDots, StepNext, WatchStep, WatchAction, AmountRow, FlowBar } from "@/components/DepthSteps";
import { toggleWatch } from "@/lib/watchlist";
import { haptic } from "@/lib/haptics";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * DETAIL-01 §B — **자금 흐름 카드의 상세. 다섯 걸음.**
 *
 * ## 왜 다섯인가
 *
 * 걸음 수를 다른 카드에 맞추지 않는다(§C). 이 카드에는 다섯 개의 서로 다른 질문이 있다.
 *
 * ```
 * 1  얼마나 옮겨갔나   빠진 곳 셋 · 들어온 곳 셋
 * 2  어떤 종목인가     종목명 + 금액        ← 이 화면의 존재 이유
 * 3  거래도 붙었나     평소 대비 배수
 * 4  얼마나 오래됐나   일별 20거래일
 * 5  즐겨찾기         업종 담기
 * ```
 *
 * **2걸음이 없으면 이 카드는 쓸모없다**(§B). 업종 이름만 보고 나가면 다른 앱과 같아진다.
 * 그래서 종목 이름이 하나도 없으면 그 걸음은 아예 만들지 않는다 — 빈 걸음을 만들지 않는
 * 규칙(`QuietPickDepth` §6)과 같다. 점도 그만큼 줄어든다.
 *
 * ## 같은 돈이라고 말하지 않는다 (FLOW-01 §E-1)
 *
 * 이 화면의 어떤 문장도 `이동했어요` 라고 하지 않는다. 빠진 것과 들어온 것은 **나란히
 * 놓인 두 사실**이지, 우리가 추적한 하나의 돈이 아니다.
 */

const CLOSE_MS = 260;
const BOTTOM_PAD = "pb-[calc(96px+env(safe-area-inset-bottom))]";

type StepId = "moved" | "stocks" | "volume" | "since" | "watch";

const STEP_NEXT_LABEL: Record<StepId, string> = {
  moved: "어떤 종목인지 보기",
  stocks: "거래도 붙었는지 보기",
  volume: "얼마나 오래됐는지 보기",
  since: "계속 지켜보기",
  watch: "",
};

/** 이름 없는 줄은 버린다 — 종목코드는 사람이 읽는 이름이 아니다. */
function named(rows: readonly FlowStockRow[]): FlowStockRow[] {
  return rows.filter((row) => (row.name ?? "").trim().length > 0);
}

function SectorGroup({
  title,
  rows,
  tone,
  max,
}: {
  title: string;
  rows: ReadonlyArray<{ sector: string; net: number; stocks: number }>;
  tone: "out" | "in";
  max: number;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-s5" data-testid={`flow-depth-${tone}`}>
      <p className="font-mono text-ds-label uppercase tracking-[0.06em] text-ds-text-2">{title}</p>
      {rows.map((row) => (
        <FlowBar
          key={row.sector}
          label={sectorDisplayName(row.sector)}
          amount={formatKrwShort(row.net)}
          ratio={max > 0 ? Math.abs(row.net) / max : 0}
          tone={tone}
        />
      ))}
    </section>
  );
}

export function FlowDepth({
  card,
  onClose,
  resolveStock,
}: {
  card: QuietPickFlowCard;
  onClose: () => void;
  /**
   * 종목 → 그 종목 상세를 여는 함수(§D-3). **열 수 없으면 `undefined` 를 돌려준다.**
   *
   * 열 수 있는지 아는 것은 덱이다(오늘 픽에 있는 종목만 상세가 있다). 화면이 무조건
   * 버튼으로 그린 다음 아무 일도 안 일어나게 두면, 눌리지 않는 버튼을 만드는 셈이다.
   */
  resolveStock?: (canonical: string) => (() => void) | undefined;
}) {
  const [closing, setClosing] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [watched, setWatched] = useState(false);
  const depth = card.depth;

  const fromStocks = useMemo(() => named(depth?.fromStocks ?? []), [depth]);
  const toStocks = useMemo(() => named(depth?.toStocks ?? []), [depth]);
  const volumeStocks = useMemo(() => named(depth?.toVolumeStocks ?? []), [depth]);

  /**
   * 데이터가 없는 걸음은 목록에서 빠지고 **점도 그만큼 줄어든다**(§C).
   * 3걸음은 예외다 — 거래가 안 붙은 것도 할 말이 있으므로(§D-4), 2걸음이 있으면 함께 산다.
   */
  const steps = useMemo<StepId[]>(() => {
    const out: StepId[] = [];
    if (depth && (depth.outflows.length > 0 || depth.inflows.length > 0)) out.push("moved");
    const hasStocks = fromStocks.length > 0 || toStocks.length > 0;
    if (hasStocks) out.push("stocks");
    if (hasStocks) out.push("volume");
    if ((depth?.toDaily.length ?? 0) >= 5) out.push("since");
    out.push("watch");
    return out;
  }, [depth, fromStocks.length, toStocks.length]);

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
    // 업종은 **원문**으로 담는다 — 표시명으로 담으면 집계·알림이 이 항목을 못 찾는다.
    toggleWatch(card.toSector, Date.now(), { kind: "sector", label: sectorDisplayName(card.toSector) });
    setWatched(true);
  };

  /** 두 막대가 같은 축을 쓴다(FLOW-01 §B-2) — 양쪽을 통틀어 가장 큰 절대값이 100%다. */
  const barMax = useMemo(() => {
    const all = [...(depth?.outflows ?? []), ...(depth?.inflows ?? [])].map((r) => Math.abs(r.net));
    return all.length > 0 ? Math.max(...all) : 0;
  }, [depth]);

  const toName = sectorDisplayName(card.toSector);
  const fromName = sectorDisplayName(card.fromSector);
  const daily = depth?.toDaily ?? [];
  const dailyMax = daily.length > 0 ? Math.max(...daily.map((d) => Math.abs(d.net))) : 0;

  const stockRow = (row: FlowStockRow, testId: string) => (
    <AmountRow
      key={row.code}
      name={row.name!}
      amount={formatKrwShort(row.net)}
      testId={testId}
      onTap={resolveStock?.(row.name!)}
    />
  );

  return (
    <OverlayPortal>
      <div
        className={`fixed inset-0 z-[70] flex h-[100dvh] flex-col bg-ds-bg pt-[env(safe-area-inset-top)] ${closing ? "" : "ds-sheet-up"}`}
        style={{
          transform: closing ? "translateY(100%)" : undefined,
          transition: closing ? `transform ${CLOSE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)` : undefined,
        }}
        data-testid="flow-depth"
      >
        <header className="ds-header-line shrink-0">
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
              <p className="truncate text-[14px] font-medium leading-tight text-ds-text-1">
                {fromName}에서 {toName}으로
              </p>
              <p className="truncate font-mono text-ds-caption text-ds-text-3">
                최근 {card.windowDays}거래일 · 외국인·기관
              </p>
            </div>
            <StepDots total={steps.length} index={index} />
          </div>
        </header>

        <div className={`scrollbar-none min-h-0 flex-1 overflow-y-auto ${BOTTOM_PAD}`}>
          <div className="mx-auto w-full max-w-[480px] px-gutter">
            {step === "moved" && (
              <>
                <p className="mt-s5 whitespace-pre-line break-keep text-ds-hook text-ds-text-1">{card.hook}</p>
                <SectorGroup title="돈이 빠진 곳" rows={depth?.outflows ?? []} tone="out" max={barMax} />
                <SectorGroup title="돈이 들어온 곳" rows={depth?.inflows ?? []} tone="in" max={barMax} />
                <p className="mt-s5 break-keep text-ds-caption text-ds-text-3">
                  빠진 곳과 들어온 곳을 나란히 본 것이에요. 같은 돈이 옮겨갔는지는 알 수 없어요.
                </p>
              </>
            )}

            {step === "stocks" && (
              <>
                <p className="mt-s5 break-keep text-ds-hook text-ds-text-1">어떤 종목이었나요</p>
                {fromStocks.length > 0 && (
                  <section className="mt-s5">
                    <p className="font-mono text-ds-label uppercase tracking-[0.06em] text-ds-text-2">
                      {fromName}에서 가장 많이 판 종목
                    </p>
                    <div className="mt-s2">{fromStocks.map((row) => stockRow(row, "flow-depth-from-stock"))}</div>
                  </section>
                )}
                {toStocks.length > 0 && (
                  <section className="mt-s6">
                    <p className="font-mono text-ds-label uppercase tracking-[0.06em] text-ds-text-2">
                      {toName}에서 가장 많이 산 종목
                    </p>
                    <div className="mt-s2">{toStocks.map((row) => stockRow(row, "flow-depth-to-stock"))}</div>
                  </section>
                )}
              </>
            )}

            {step === "volume" && (
              <>
                <p className="mt-s5 break-keep text-ds-hook text-ds-text-1">거래도 함께 붙었나요</p>
                {volumeStocks.length > 0 ? (
                  <>
                    <section className="mt-s5">
                      <p className="font-mono text-ds-label uppercase tracking-[0.06em] text-ds-text-2">
                        {toName}에서 거래량이 평소보다 늘어난 종목
                      </p>
                      <div className="mt-s2" data-testid="flow-depth-volume">
                        {volumeStocks.map((row) => (
                          <AmountRow
                            key={row.code}
                            name={row.name!}
                            amount={`평소의 ${row.volumeRatio!.toFixed(1)}배`}
                            onTap={resolveStock?.(row.name!)}
                          />
                        ))}
                      </div>
                    </section>
                    <p className="mt-s5 break-keep text-ds-body text-ds-text-2">
                      돈이 들어오면서 거래도 함께 붙고 있어요
                    </p>
                  </>
                ) : (
                  /* 붙지 않은 것도 정보다(§D-4) — 빈 화면으로 두지 않는다. */
                  <div className="mt-s5" data-testid="flow-depth-volume-quiet">
                    <p className="break-keep text-ds-body text-ds-text-1">
                      돈은 들어오는데 거래량은 평소와 비슷해요
                    </p>
                    <p className="mt-s2 break-keep text-ds-body text-ds-text-2">조용히 사 모으는 모습이에요</p>
                  </div>
                )}
              </>
            )}

            {step === "since" && (
              <>
                <p className="mt-s5 break-keep text-ds-hook text-ds-text-1">
                  {toName}으로 돈이 들어온 지 얼마나 됐나요
                </p>
                <div className="mt-s5 flex h-[72px] items-end gap-[3px]" data-testid="flow-depth-daily">
                  {daily.map((d) => {
                    const h = dailyMax > 0 ? Math.max(2, Math.round((Math.abs(d.net) / dailyMax) * 72)) : 2;
                    return (
                      <div
                        key={d.date}
                        className={`flex-1 rounded-[1px] ${d.net > 0 ? "bg-ds-accent" : "bg-ds-text-3"}`}
                        style={{ height: `${h}px` }}
                        title={`${d.date} ${formatKrwShort(d.net)}`}
                      />
                    );
                  })}
                </div>
                <p className="mt-s4 break-keep text-ds-body text-ds-text-1">
                  최근 {daily.length}거래일 중 {depth?.toPositiveDays ?? 0}일이 순매수였어요
                </p>
              </>
            )}

            {step === "watch" && (
              <WatchStep
                title={`${toName} 업종을 계속 지켜볼까요`}
                subject="돈이 계속 들어오는지, 빠지기 시작하는지 알려드려요"
                done={watched}
                doneText={`${toName} 업종의 자금 흐름을 기록해서 보여드릴게요`}
              />
            )}
          </div>
        </div>

        <StepBar>
          {step === "watch" ? (
            <WatchAction done={watched} label={`${toName} 담기`} onWatch={onWatch} onClose={dismiss} />
          ) : (
            <StepNext label={STEP_NEXT_LABEL[step]} onClick={next} />
          )}
        </StepBar>
      </div>
    </OverlayPortal>
  );
}
