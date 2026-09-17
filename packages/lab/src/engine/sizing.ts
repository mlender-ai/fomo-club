/**
 * LAB-04 PART A — 리스크 사이징. **FCE `plan_position_size` 이식(결함 수정본).**
 *
 * 출처: FCE `b1c5211` · `backend/app/paper/policy.py:270`
 * 결함 수정: `439c4e9` (2026-08-18, WO-FCE-RISK-SIZING-01 Phase 1 "정합 수리")
 *
 * ## 그 수정이 고친 것 — 그대로 가져온다
 *
 * 1. **상한이 없으면 한 건이 계좌를 지운다.** 손절 거리가 극히 작으면
 *    `수량 = 예산 / 거리` 가 발산한다. 명목 상한을 건다.
 * 2. **상한·하한에 걸리면 실제 리스크가 예산과 다르다.** 그 사실을 숨기지 않고
 *    `plannedRisk` 에 **예산이 아니라 실제**를 적는다.
 * 3. **손절 거리가 0 이면 나눌 수 없다.** 조용히 0 으로 두지 않고 명시적으로 거절한다.
 *    (LAB-02 가 `stop_pct` 를 필수로 만들어서 이 경로는 거의 안 타지만, 남겨둔다 —
 *    거리가 0 이 되는 길은 가격이 손절선과 같아지는 것 말고도 있다.)
 *
 * 순수 함수다.
 */
import type { SizingConfig } from "./types";

export interface SizePlan {
  qty: number;
  notional: number;
  /** 손절까지의 가격 거리. */
  stopDistance: number;
  /** **실제로 걸린** 리스크 금액. 상한에 걸리면 예산과 다르다. */
  plannedRisk: number;
  /** 무엇이 수량을 정했나 — `budget` · `max_notional` · `equity` · `rejected:*`. */
  constraint: string;
}

/** 수량을 못 정하는 경우. **0 수량으로 조용히 넘어가지 않는다.** */
export interface SizeRejected {
  qty: 0;
  reason: string;
}

export type SizeResult = SizePlan | SizeRejected;

export function isRejected(result: SizeResult): result is SizeRejected {
  return result.qty === 0;
}

/**
 * 수량을 정하고 **근거를 남긴다.**
 *
 * `risk_pct`: 수량 = (자본 × 비율) / |진입가 − 손절가|.
 *   1R 의 금액가치가 손절 거리와 무관하게 **리스크 예산 그 자체**가 된다.
 *   그래서 R 합계의 부호가 곧 금액 합계의 부호가 된다.
 * `fixed_pct`: 명목 = 자본 × 비율. 손절 거리와 무관하다.
 * `fixed_notional`: 명목 고정.
 */
export function planSize(
  equity: number,
  entryPrice: number,
  stopPrice: number,
  config: SizingConfig,
  leverage: number
): SizeResult {
  if (!(equity > 0)) return { qty: 0, reason: "rejected:no_equity" };
  if (!(entryPrice > 0)) return { qty: 0, reason: "rejected:bad_price" };

  const stopDistance = Math.abs(entryPrice - stopPrice);
  const maxNotional = equity * leverage * config.maxNotionalMultiple;

  let notional: number;
  let constraint: string;

  if (config.mode === "risk_pct") {
    if (!(stopDistance > 0)) return { qty: 0, reason: "rejected:no_stop_distance" };
    const budget = equity * (config.value / 100);
    notional = (budget / stopDistance) * entryPrice;
    constraint = "budget";
  } else if (config.mode === "fixed_pct") {
    notional = equity * (config.value / 100) * leverage;
    constraint = "fixed_pct";
  } else {
    notional = config.value;
    constraint = "fixed_notional";
  }

  // 손절 거리가 극히 작으면 수량이 발산한다. **상한이 없으면 한 건이 계좌를 지운다.**
  if (notional > maxNotional) {
    notional = maxNotional;
    constraint = "max_notional";
  }

  const qty = notional / entryPrice;
  if (!(qty > 0) || !Number.isFinite(qty)) return { qty: 0, reason: "rejected:zero_qty" };

  return {
    qty,
    notional,
    stopDistance,
    // 상한에 걸리면 실제 리스크가 예산과 다르다. **예산이 아니라 실제를 적는다.**
    plannedRisk: stopDistance * qty,
    constraint,
  };
}
