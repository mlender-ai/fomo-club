/**
 * LAB-04 PART D — 체결 규칙. **가장 조작되기 쉬운 곳이다.**
 *
 * 그래서 실행기에서 떼어내 순수 함수로 두고 단독으로 검증한다. 루프 안에 섞여 있으면
 * 규칙이 맞는지 눈으로 읽어야 하고, 눈으로 읽은 것은 틀린다.
 *
 * | 항목 | 규칙 |
 * |---|---|
 * | 체결 시점 | 신호 발생 봉의 **다음 봉 시가** — 신호 봉 종가 체결은 금지 |
 * | 수수료 | 실제 거래소 요율 |
 * | 슬리피지 | 주문 크기 / 봉 거래량 비례, **최소값 있음** |
 * | 갭 | 갭 이후 가격으로 체결 |
 * | 손절 | 봉 저가가 손절선을 통과하면 **손절가로 체결**(종가 아님) |
 * | 손절+목표 동시 | **손절 먼저** — FCE `outcomes.py` 의 "loss first" 이식 |
 * | 시간 청산 | 최종 **종가**로 마크. MFE(피크) 기준은 낙관 편향 |
 */
import type { Bar, ExitReason, FillConfig, OpenPosition, Side } from "./types";

/** 체결 한 건. */
export interface Fill {
  price: number;
  /** 수수료(금액). */
  fee: number;
  /** 슬리피지로 잃은 금액. */
  slippage: number;
}

/**
 * 슬리피지(bps). 주문 명목이 봉 거래대금에서 차지하는 비율에 비례한다.
 *
 * **하한이 있다.** 아무리 작은 주문도 호가를 하나는 먹는다 —
 * 0 슬리피지 백테스트는 거짓이다.
 */
export function slippageBps(notional: number, bar: Bar, config: FillConfig): number {
  const barNotional = bar.volume * ((bar.high + bar.low) / 2);
  if (!(barNotional > 0)) return config.minSlippageBps;
  const share = notional / barNotional;
  return config.minSlippageBps + config.impactBps * share;
}

/**
 * 진입 체결. **신호 봉의 다음 봉 시가**에서 받는다.
 *
 * 갭은 따로 처리하지 않는다 — 다음 봉 시가가 곧 갭 이후 가격이다.
 * 슬리피지는 **불리한 쪽**으로 붙는다(사면 비싸게, 팔면 싸게).
 */
export function entryFill(
  side: Side,
  nextBar: Bar,
  qty: number,
  config: FillConfig
): Fill {
  const base = nextBar.open;
  const notional = base * qty;
  const bps = slippageBps(notional, nextBar, config);
  const drift = base * (bps / 10_000);
  const price = side === "LONG" ? base + drift : base - drift;
  return {
    price,
    fee: price * qty * config.takerFeeRate,
    slippage: Math.abs(price - base) * qty,
  };
}

export interface ExitDecision {
  reason: ExitReason;
  /** 체결가. 슬리피지·수수료는 `exitFill` 이 붙인다. */
  price: number;
}

/**
 * 이 봉에서 청산되는가. 되면 **사유와 체결가**를 준다.
 *
 * ## 순서가 규칙이다
 *
 * 1. **갭**을 먼저 본다. 시가가 이미 손절선 너머면 손절가가 아니라 **시가**로 체결된다 —
 *    손절선보다 나쁜 가격이다. 이걸 손절가로 처리하면 백테스트가 실제보다 유리해진다.
 * 2. 다음이 **손절**. 저가(롱)가 손절선을 통과하면 손절가로 체결한다. 종가가 아니다.
 * 3. 다음이 **목표**.
 * 4. 다음이 **청산 신호** — 다음 봉 시가. 신호 봉 종가로 닫지 않는다.
 * 5. 마지막이 **시간 청산** — 종가로 마크한다.
 *
 * ## 손절과 목표가 같은 봉에서 다 닿으면
 *
 * **손절로 친다.** 봉 안의 순서를 모르기 때문이다. 목표로 치면 그 백테스트는
 * 실제보다 좋게 나오고, 좋게 나온 백테스트는 판단 근거가 못 된다.
 * (FCE `outcomes.py` — "Same-candle stop/target is intentionally conservative: loss first.")
 */
export function exitDecision(position: OpenPosition, bar: Bar): ExitDecision | null {
  const long = position.side === "LONG";

  // 1. 갭 — 시가가 이미 손절선 너머
  const gappedThroughStop = long ? bar.open <= position.stopPrice : bar.open >= position.stopPrice;
  if (gappedThroughStop) return { reason: "STOP", price: bar.open };

  // 2. 손절 — 봉 저가/고가가 손절선을 통과
  const stopHit = long ? bar.low <= position.stopPrice : bar.high >= position.stopPrice;
  if (stopHit) return { reason: "STOP", price: position.stopPrice };

  // 3. 목표
  if (position.targetPrice !== null) {
    const gappedThroughTarget = long
      ? bar.open >= position.targetPrice
      : bar.open <= position.targetPrice;
    if (gappedThroughTarget) return { reason: "TARGET", price: bar.open };
    const targetHit = long ? bar.high >= position.targetPrice : bar.low <= position.targetPrice;
    if (targetHit) return { reason: "TARGET", price: position.targetPrice };
  }

  // 4. 청산 신호 — **다음 봉 시가**에 닫는다. 신호가 뜬 봉의 종가로 닫으면
  //    그 종가를 알고 파는 것이 된다(PART D).
  if (position.exitSignalPending) return { reason: "SIGNAL", price: bar.open };

  // 5. 시간 청산 — **종가**로 마크한다. 피크로 마크하면 낙관 편향이다.
  if (position.maxHoldBars !== null && position.barsHeld + 1 >= position.maxHoldBars) {
    return { reason: "TIME", price: bar.close };
  }

  return null;
}

/** 청산 체결. 슬리피지는 **불리한 쪽**으로 붙는다(팔면 싸게, 되사면 비싸게). */
export function exitFill(
  side: Side,
  decision: ExitDecision,
  bar: Bar,
  qty: number,
  config: FillConfig
): Fill {
  const base = decision.price;
  const notional = base * qty;
  const bps = slippageBps(notional, bar, config);
  const drift = base * (bps / 10_000);
  const price = side === "LONG" ? base - drift : base + drift;
  return {
    price,
    fee: price * qty * config.takerFeeRate,
    slippage: Math.abs(price - base) * qty,
  };
}

/** 손익(금액). 비용은 호출자가 따로 뺀다 — 여기서 섞으면 어디서 샜는지 못 본다. */
export function grossPnl(side: Side, entryPrice: number, exitPrice: number, qty: number): number {
  return side === "LONG" ? (exitPrice - entryPrice) * qty : (entryPrice - exitPrice) * qty;
}

/**
 * 보유 중 차감할 펀딩비(금액).
 *
 * 롱은 요율이 양수일 때 낸다. 숏은 반대다. **빼면 수익률이 부풀려진다** —
 * 무기한 선물에서 보유가 길수록 차이가 커진다.
 */
export function fundingCost(side: Side, rate: number, notional: number): number {
  const paid = notional * rate;
  return side === "LONG" ? paid : -paid;
}
