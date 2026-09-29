/**
 * 강제청산 모델 (ENG-01) — 순수 함수. **거래소 공식을 옮긴다. 공식을 지어내지 않는다.**
 *
 * ## 출처 — Bitget (FCE 페이퍼가 흉내 내는 거래소)
 *
 * - 청산가(격리 마진): Bitget Support "What Is Estimated Liquidation Price in Bitget Futures?"
 *   (support/articles/12560603808759 · 2025-09-18)
 *
 *   ```
 *   청산가 = [포지션 증거금 + 단계 공제 − 수량 × 평균 진입가 × 방향] ÷ [수량 × (MMR + 테이커 수수료율 − 방향)]
 *   방향 = 롱 1 · 숏 −1
 *   ```
 *
 * - 유지증거금률(MMR): 종목 · 명목 크기별 단계 — Bitget 공개 API `/api/v2/mix/market/query-position-lever`
 *   (`startUnit` · `endUnit` · `keepMarginRate`). 페이퍼 명목(수백 USDT)은 늘 1단계 — 단계 공제는 0
 * - 테이커 수수료율: `/api/v2/mix/market/contracts` 의 `takerFeeRate` (0.0006)
 * - 청산 조건: "격리 잔고 + 미실현 손익 < 유지증거금" 이면 청산 — Bitget "Liquidation overview"
 * - 마진 모드: FCE 페이퍼는 **포지션마다 증거금(`margin_usdt`)을 따로 둔다 = 격리**. 교차 계좌 잔고를 쓰지 않는다
 *
 * ## 펀딩 (ENG-01 A-3)
 *
 * 누적 펀딩을 **격리 증거금에서 뺀다** → 청산가가 진입가 쪽으로 다가온다. 펀딩 정산마다(8시간) 청산가를 다시 잰다.
 * 정산 값: 수량 × 그 시각 가격 × 펀딩률 · 롱은 양(+)의 펀딩을 낸다. 펀딩률 출처는 Bitget `history-fund-rate`.
 * FCE 페이퍼는 펀딩을 손익에 세지 않는다 — 여기서도 **청산가에만** 쓰고 금액은 따로 알린다(손익 모형 변경은 별건).
 *
 * ## 청산 체결 (PART B)
 *
 * | | |
 * |---|---|
 * | 봉 저가(롱) · 고가(숏)가 청산가에 닿음 | 그 봉에서 청산가로 |
 * | 봉 시가가 이미 청산가 너머 (갭) | 시가로 — 청산가보다 나쁘다 |
 * | 같은 봉에서 손절선도 닿음 | 손절선이 청산가보다 진입가에 가까우면 **손절 먼저** · 아니면 청산 |
 * | 청산되면 | 남은 격리 증거금 전부를 잃는다(청산 수수료는 공식 안의 수수료율로 이미 들어 있다) |
 */

export const BITGET_TAKER_FEE = 0.0006;

export type Side = "long" | "short";
const dirOf = (d: string): 1 | -1 => (d === "short" || d === "SHORT" ? -1 : 1);

export interface MarginTier {
  startUnit: number;
  endUnit: number;
  keepMarginRate: number;
}

/** 명목(USDT)에 맞는 유지증거금률. 단계가 없으면 null — 지어내지 않는다. */
export function mmrFor(tiers: MarginTier[], notional: number): number | null {
  if (tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => a.startUnit - b.startUnit);
  const hit = sorted.find((t) => notional >= t.startUnit && notional < t.endUnit);
  return (hit ?? (sorted[sorted.length - 1] as MarginTier)).keepMarginRate;
}

/** Bitget 격리 청산가. 성립하지 않으면(수량 0 · 분모 0) null. */
export function liquidationPrice(p: {
  direction: string;
  entry: number;
  quantity: number;
  margin: number;
  mmr: number;
  takerFee?: number;
  offset?: number;
}): number | null {
  const d = dirOf(p.direction);
  const fee = p.takerFee ?? BITGET_TAKER_FEE;
  const denom = p.quantity * (p.mmr + fee - d);
  if (!(p.quantity > 0) || denom === 0) return null;
  const price = (p.margin + (p.offset ?? 0) - p.quantity * p.entry * d) / denom;
  return Number.isFinite(price) ? Math.max(0, price) : null;
}

export interface FundingPoint {
  /** 정산 시각(ms). */
  at: number;
  rate: number;
}

/** [from, to] 사이 정산된 펀딩 — **낸 금액이 양수**(롱은 양의 펀딩률을 낸다). `priceAt` 은 그 시각 가격. */
export function fundingPaid(
  direction: string,
  quantity: number,
  funding: FundingPoint[],
  from: number,
  to: number,
  priceAt: (t: number) => number
): number {
  const d = dirOf(direction);
  let sum = 0;
  for (const f of funding) if (f.at > from && f.at <= to) sum += quantity * priceAt(f.at) * f.rate * d;
  return sum;
}

/** 봉 `[시작(ms), 시가, 고가, 저가, 종가]`. */
export type Bar = [number, number, number, number, number];

export interface RescoreTrade {
  id: string;
  trackKey: string;
  symbol: string;
  direction: string;
  leverage: number;
  marginUsdt: number;
  quantity: number;
  entryPrice: number;
  entryAt: number;
  exitAt: number;
  exitPrice: number;
  exitReason: string | null;
  /** 첫 손절(무효화) — 익절1 뒤에는 본전으로 옮겨진다(FCE `apply_exit_decision`). */
  invalidationPrice: number | null;
  partialExitAt: number | null;
  partialExitPrice: number | null;
  partialExitQuantity: number;
  costsUsdt: number;
  netPnlUsdt: number;
}

export interface Rescore {
  id: string;
  leverage: number;
  /** 청산 모델로 결과가 바뀌었나. */
  changed: boolean;
  outcome: "unchanged" | "liquidation" | "stop_before_liquidation";
  at: number | null;
  price: number | null;
  /** 진입 때 청산가 · 가장 가까이 간 거리(%) — 레일 · 경고용. */
  entryLiquidationPrice: number | null;
  closestLiquidationPct: number | null;
  mmr: number | null;
  fundingPaidUsdt: number;
  recordedNetUsdt: number;
  rescoredNetUsdt: number;
  rescoredReturnPct: number;
}

const STOP_REASONS = new Set(["invalidation_breach", "breakeven_stop"]);

/**
 * 거래 한 건을 청산 모델로 다시 돌린다 — **기록은 건드리지 않고 결과만 따로 낸다**(D-1).
 *
 * `leverage` 를 주면 그 배수로(증거금은 같고 수량만 비례) — 1배 · 3배 비교(D-2). 청산이 안 걸리면 손익은 배율대로.
 * 이 함수는 청산만 더한다 — 청산가에 닿지 않은 봉에서 손절 방식(종가 · 봉 중간)을 다시 채점하지 않는다.
 */
export function rescoreTrade(
  t: RescoreTrade,
  bars: Bar[],
  funding: FundingPoint[],
  tiers: MarginTier[],
  options: { leverage?: number; takerFee?: number } = {}
): Rescore {
  const lev = options.leverage ?? t.leverage;
  const scale = lev / t.leverage;
  const Q = t.quantity * scale;
  const E = t.entryPrice;
  const M = t.marginUsdt;
  const d = dirOf(t.direction);
  const mmr = mmrFor(tiers, E * Q);
  const recordedNet = t.netPnlUsdt * scale;
  const base: Rescore = {
    id: t.id,
    leverage: lev,
    changed: false,
    outcome: "unchanged",
    at: null,
    price: null,
    entryLiquidationPrice: null,
    closestLiquidationPct: null,
    mmr,
    fundingPaidUsdt: 0,
    recordedNetUsdt: recordedNet,
    rescoredNetUsdt: recordedNet,
    rescoredReturnPct: M > 0 ? (recordedNet / M) * 100 : 0,
  };
  if (mmr === null || !(Q > 0) || !(M > 0)) return base;
  base.entryLiquidationPrice = liquidationPrice({ direction: t.direction, entry: E, quantity: Q, margin: M, mmr, ...(options.takerFee !== undefined ? { takerFee: options.takerFee } : {}) });

  // 체결 비용률 — FCE 는 명목 × 비용률을 진입 · 청산에 한 번씩 뗀다. 기록 비용에서 거꾸로 푼다.
  const qp = Math.min(t.partialExitQuantity, t.quantity);
  const exitNotional = (t.partialExitPrice ?? 0) * qp + t.exitPrice * (t.quantity - qp);
  const costRate = t.costsUsdt / Math.max(1e-12, E * t.quantity + exitNotional);
  const entryCost = E * Q * costRate;

  const sorted = [...bars].sort((a, b) => a[0] - b[0]);
  const step = sorted.length > 1 ? (sorted[1] as Bar)[0] - (sorted[0] as Bar)[0] : 4 * 3_600_000;
  const priceAt = (ts: number) => {
    let close = E;
    for (const b of sorted) {
      if (b[0] > ts) break;
      close = b[4];
    }
    return close;
  };
  const inTrade = sorted.filter((b) => b[0] + step > t.entryAt && b[0] <= t.exitAt);
  let closest: number | null = null;

  for (const [start, open, high, low] of inTrade) {
    const end = start + step;
    const afterPartial = t.partialExitAt !== null && start >= t.partialExitAt;
    const q = afterPartial ? Q * (1 - qp / t.quantity) : Q;
    const m = afterPartial ? M * (q / Q) : M;
    const paid = fundingPaid(t.direction, q, funding, t.entryAt, Math.min(end, t.exitAt), priceAt);
    base.fundingPaidUsdt = paid;
    const lp = liquidationPrice({ direction: t.direction, entry: E, quantity: q, margin: m - paid, mmr, ...(options.takerFee !== undefined ? { takerFee: options.takerFee } : {}) });
    if (lp === null) continue;
    const adverse = d === 1 ? low : high;
    const gapPct = ((adverse - lp) / E) * 100 * d; // 0 이하면 닿았다
    closest = closest === null ? gapPct : Math.min(closest, gapPct);
    const touched = d === 1 ? low <= lp : high >= lp;
    if (!touched) continue;

    const gap = d === 1 ? open <= lp : open >= lp;
    const stop = afterPartial ? E : t.invalidationPrice;
    const stopCloser = stop !== null && Math.abs(stop - E) < Math.abs(lp - E);
    const stopTouched = stop !== null && (d === 1 ? low <= stop : high >= stop);
    const isExitBar = t.exitAt >= start && t.exitAt < end;

    if (!gap && stopCloser && stopTouched) {
      // B-2 — 손절이 먼저. 기록이 바로 이 봉의 손절이면 그대로다.
      if (isExitBar && t.exitReason && STOP_REASONS.has(t.exitReason)) return { ...base, closestLiquidationPct: closest };
      const partialNet = afterPartial ? ((t.partialExitPrice ?? E) - E) * d * (Q * qp / t.quantity) - (t.partialExitPrice ?? E) * (Q * qp / t.quantity) * costRate : 0;
      const net = partialNet + (stop - E) * d * q - stop * q * costRate - entryCost;
      return {
        ...base,
        changed: true,
        outcome: "stop_before_liquidation",
        at: start,
        price: stop,
        closestLiquidationPct: closest,
        rescoredNetUsdt: net,
        rescoredReturnPct: (net / M) * 100,
      };
    }
    // 청산 — 남은 격리 증거금 전부. 갭이면 시가(청산가보다 나쁘다 · 손실은 증거금에서 멈춘다 — 격리).
    const fill = gap ? open : lp;
    const partialNet = afterPartial ? ((t.partialExitPrice ?? E) - E) * d * (Q * qp / t.quantity) - (t.partialExitPrice ?? E) * (Q * qp / t.quantity) * costRate : 0;
    const net = partialNet - m - entryCost;
    return {
      ...base,
      changed: true,
      outcome: "liquidation",
      at: start,
      price: fill,
      closestLiquidationPct: closest,
      rescoredNetUsdt: net,
      rescoredReturnPct: (net / M) * 100,
    };
  }
  return { ...base, closestLiquidationPct: closest };
}

// ── 트랙 요약 (D-4) ───────────────────────────────────────────────────────

export interface TrackStats {
  n: number;
  winRatePct: number | null;
  profitFactor: number | null;
  netUsdt: number;
  /** 시작 자본 대비 누적 곡선의 최대 낙폭(%) — 음수. */
  mddPct: number | null;
}

export function statsOf(nets: { at: number; net: number }[], startingCapital: number): TrackStats {
  const rows = [...nets].sort((a, b) => a.at - b.at);
  const wins = rows.filter((r) => r.net > 0);
  const gainSum = wins.reduce((s, r) => s + r.net, 0);
  const lossSum = rows.filter((r) => r.net < 0).reduce((s, r) => s - r.net, 0);
  let equity = startingCapital;
  let peak = startingCapital;
  let mdd = 0;
  for (const r of rows) {
    equity += r.net;
    peak = Math.max(peak, equity);
    if (peak > 0) mdd = Math.min(mdd, ((equity - peak) / peak) * 100);
  }
  return {
    n: rows.length,
    winRatePct: rows.length ? (wins.length / rows.length) * 100 : null,
    profitFactor: lossSum > 0 ? gainSum / lossSum : null,
    netUsdt: rows.reduce((s, r) => s + r.net, 0),
    mddPct: rows.length ? mdd : null,
  };
}

// ── 재채점 결과 (업로더 → LAB · ENG-01 D) ─────────────────────────────────

export interface RescoreTrack {
  trackKey: string;
  startingCapital: number;
  recorded: TrackStats;
  rescored: TrackStats;
  /** 1배 — 같은 증거금 · 수량 1/3. */
  recorded1x: TrackStats;
  rescored1x: TrackStats;
  liquidated: number;
  stopBeforeLiquidation: number;
  /** 3배에서 청산되고 1배에서 산 거래. */
  liquidatedOnlyAt3x: number;
  /** 청산가에 가장 가까이 간 거래 — 가격 거리(%). */
  closest: { id: string; symbol: string; pct: number } | null;
  fundingPaidUsdt: number;
  skipped: number;
  /** 배수를 올리면 드러나나 — 같은 거래 · 같은 증거금으로 배수만. */
  byLeverage: { leverage: number; liquidated: number; stopBeforeLiquidation: number; rescored: TrackStats }[];
}

export interface RescorePayload {
  asOf: string;
  method: string;
  tracks: RescoreTrack[];
  /** 거래별 — 기록 배수(3배)와 1배. */
  trades: Record<string, { at3x: Rescore; at1x: Rescore }>;
}
