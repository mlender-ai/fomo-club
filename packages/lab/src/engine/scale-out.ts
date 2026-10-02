/**
 * TRADER-02 D-1 — 분할 청산 · 추적 손절. `fills.ts` 처럼 **순수 함수로 떼어** 단독으로 검증한다.
 *
 * 정의에 `exit.scale_out` 이 있을 때만 쓴다. 없으면 실행기는 예전 `exitDecision` 그대로 돈다.
 *
 * ## 한 봉 안의 순서 (보수적으로)
 *
 * 1. **시가**: 손절선 너머로 갭 → 남은 전부 시가 손절. 청산 신호 대기 중 → 남은 전부 시가.
 * 2. **봉 안 손절**: 저가(롱)가 손절선 통과 → 남은 전부 손절가. **목표보다 먼저 본다** —
 *    봉 안 순서를 모르면 나쁜 쪽으로 친다(`fills.ts` 와 같은 원칙).
 * 3. **목표 다리**: 가까운 것부터. 시가가 이미 넘었으면 시가(유리한 갭)로.
 * 4. **추적 다리**: 기준 고점(숏은 저점)은 **이전 봉까지**의 값이다. 이번 봉 고가로 올린 뒤
 *    같은 봉 저가로 찍히는 일은 순서를 모르므로 만들지 않는다.
 * 5. **시간 청산**: 남은 전부 종가.
 *
 * 다리 수량은 **처음 수량 × size** 다. 마지막 다리는 남은 전부(부동소수 찌꺼기 없이).
 */
import type { ExitRules, ScaleOutLeg } from "../strategy-definition";
import type { Bar, ExitReason, OpenPosition } from "./types";

export type LegKind = "SCALE_OUT" | "TRAIL" | "STOP" | "SIGNAL" | "TIME";

export interface LegEvent {
  /** DB 의 ExitReason 으로 남는 사유 — 추적 손절도 손절 주문이라 STOP 이다. */
  reason: ExitReason;
  /** 어떤 다리였나(분할 기록용). */
  kind: LegKind;
  /** 슬리피지 전 가격. */
  price: number;
  qty: number;
  /** 몇 번째 다리였나. 전부 닫기면 null. */
  leg: number | null;
}

const EPS = 1e-12;

function isTrail(leg: ScaleOutLeg): leg is Extract<ScaleOutLeg, { trail: unknown }> {
  return "trail" in leg;
}

/** 이 봉에서 일어나는 청산 다리들. 위치 상태(`legDone` · `stopPrice` · `peak`)는 **바꾸지 않는다** — 호출자가 적용한다. */
export function scaleOutEvents(position: OpenPosition, bar: Bar, exit: ExitRules): LegEvent[] {
  const legs = exit.scale_out ?? [];
  const long = position.side === "LONG";
  const initial = position.initialQty ?? position.qty;
  const done = [...(position.legDone ?? legs.map(() => false))];
  let remaining = position.qty;
  const events: LegEvent[] = [];

  const closeAll = (reason: ExitReason, kind: LegKind, price: number): LegEvent[] => {
    if (remaining > EPS) events.push({ reason, kind, price, qty: remaining, leg: null });
    return events;
  };

  // 1. 시가
  const gapStop = long ? bar.open <= position.stopPrice : bar.open >= position.stopPrice;
  if (gapStop) return closeAll("STOP", "STOP", bar.open);
  if (position.exitSignalPending) return closeAll("SIGNAL", "SIGNAL", bar.open);

  // 2. 봉 안 손절 — 목표보다 먼저
  const stopHit = long ? bar.low <= position.stopPrice : bar.high >= position.stopPrice;
  if (stopHit) return closeAll("STOP", "STOP", position.stopPrice);

  const take = (index: number, reason: ExitReason, kind: LegKind, price: number) => {
    const leg = legs[index] as ScaleOutLeg;
    done[index] = true;
    const last = done.every(Boolean);
    const qty = last ? remaining : Math.min(remaining, leg.size * initial);
    if (qty > EPS) events.push({ reason, kind, price, qty, leg: index });
    remaining -= qty;
  };

  // 3. 목표 다리
  legs.forEach((leg, index) => {
    if (done[index] || isTrail(leg) || remaining <= EPS) return;
    const target = long ? position.entryPrice * (1 + leg.at_pct / 100) : position.entryPrice * (1 - leg.at_pct / 100);
    const gapped = long ? bar.open >= target : bar.open <= target;
    const hit = long ? bar.high >= target : bar.low <= target;
    if (gapped) take(index, "TARGET", "SCALE_OUT", bar.open);
    else if (hit) take(index, "TARGET", "SCALE_OUT", target);
  });

  // 4. 추적 다리 — 기준점은 이전 봉까지의 고점(숏은 저점)
  legs.forEach((leg, index) => {
    if (done[index] || !isTrail(leg) || remaining <= EPS) return;
    const peak = position.peak ?? position.entryPrice;
    const favorable = long ? (peak / position.entryPrice - 1) * 100 : (1 - peak / position.entryPrice) * 100;
    const activate = leg.trail.activate_pct ?? 0;
    if (favorable < activate) return;
    const trailPrice = long ? peak * (1 - leg.trail.pct / 100) : peak * (1 + leg.trail.pct / 100);
    const gapped = long ? bar.open <= trailPrice : bar.open >= trailPrice;
    const hit = long ? bar.low <= trailPrice : bar.high >= trailPrice;
    if (gapped) take(index, "STOP", "TRAIL", bar.open);
    else if (hit) take(index, "STOP", "TRAIL", trailPrice);
  });

  // 5. 시간 청산
  if (remaining > EPS && position.maxHoldBars !== null && position.barsHeld + 1 >= position.maxHoldBars) {
    closeAll("TIME", "TIME", bar.close);
  }
  return events;
}

/** 이 봉을 지난 뒤의 기준 고점(숏은 저점). 청산 판정이 끝난 **다음에** 갱신한다. */
export function nextPeak(position: OpenPosition, bar: Bar): number {
  const peak = position.peak ?? position.entryPrice;
  return position.side === "LONG" ? Math.max(peak, bar.high) : Math.min(peak, bar.low);
}
