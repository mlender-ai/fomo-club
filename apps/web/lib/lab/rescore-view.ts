/**
 * 청산 재채점을 화면에 (ENG-01 D-1) — 순수 함수. **기록은 그대로, 재채점을 기본으로, 둘 다 보인다.**
 *
 * 재채점 성적은 **화면이 쓰는 모집단과 같은 거래**로 센다(`inPopulation` — FCE 검증 앵커 뒤). 그래야 기록 칸(FCE 값)과
 * 재채점 칸이 같은 거래를 두고 비교된다. 바뀐 거래가 없으면 MDD 도 FCE 값 그대로 — 바뀌면 랩이 곡선으로 다시 잰다(표시).
 */
import type { RescorePayload, TrackStats } from "./liquidation";
import { statsOf } from "./liquidation";
import { inPopulation, type TradeLite } from "./overview";

export interface StrategyRescore {
  asOf: string;
  method: string;
  changed: number;
  liquidated: number;
  stopBeforeLiquidation: number;
  liquidatedOnlyAt3x: number;
  closest: { symbol: string; pct: number } | null;
  fundingPaidUsdt: number;
  /** 화면 모집단 · 기록(FCE) — N · 승률 · PF · MDD. */
  recorded: { n: number; winRatePct: number | null; profitFactor: number | null; mddPct: number | null; netUsdt: number };
  /** 화면 모집단 · 청산 반영. */
  rescored: { n: number; winRatePct: number | null; profitFactor: number | null; mddPct: number | null; netUsdt: number; mddSource: "fce" | "lab" };
  /** 원장 전부 · 배수별(1 · 3 · 5 · 10). */
  byLeverage: { leverage: number; liquidated: number; stopBeforeLiquidation: number; rescored: TrackStats }[];
  /** 1배 · 3배 (D-2) — 원장 전부. */
  oneVsThree: { recorded1x: TrackStats; rescored1x: TrackStats; recorded3x: TrackStats; rescored3x: TrackStats };
}

export function strategyRescore(
  payload: RescorePayload | null,
  trackKey: string,
  trades: TradeLite[],
  from: Map<string, Date | null>,
  fce: { mddPct: number | null; startingCapital: number }
): StrategyRescore | null {
  const track = payload?.tracks.find((t) => t.trackKey === trackKey);
  if (!payload || !track) return null;
  const own = trades.filter((t) => t.trackKey === trackKey && t.exitAt && inPopulation(t, from));
  const nets = own.map((t) => {
    const r = t.id ? payload.trades[t.id]?.at3x : undefined;
    return { at: (t.exitAt as Date).getTime(), recorded: t.netPnlUsdt ?? 0, rescored: r ? r.rescoredNetUsdt : t.netPnlUsdt ?? 0, changed: !!r?.changed };
  });
  const rec = statsOf(nets.map((x) => ({ at: x.at, net: x.recorded })), fce.startingCapital);
  const res = statsOf(nets.map((x) => ({ at: x.at, net: x.rescored })), fce.startingCapital);
  const changed = nets.filter((x) => x.changed).length;
  return {
    asOf: payload.asOf,
    method: payload.method,
    changed,
    liquidated: track.liquidated,
    stopBeforeLiquidation: track.stopBeforeLiquidation,
    liquidatedOnlyAt3x: track.liquidatedOnlyAt3x,
    closest: track.closest ? { symbol: track.closest.symbol, pct: track.closest.pct } : null,
    fundingPaidUsdt: track.fundingPaidUsdt,
    recorded: { n: rec.n, winRatePct: rec.winRatePct, profitFactor: rec.profitFactor, mddPct: fce.mddPct, netUsdt: rec.netUsdt },
    rescored: {
      n: res.n,
      winRatePct: res.winRatePct,
      profitFactor: res.profitFactor,
      // 바뀐 게 없으면 곡선도 같다 — FCE 값을 그대로 둔다(랩이 다시 재면 FCE 와 소수점이 갈린다 · UI-10 D).
      mddPct: changed === 0 ? fce.mddPct : res.mddPct,
      netUsdt: res.netUsdt,
      mddSource: changed === 0 ? "fce" : "lab",
    },
    byLeverage: track.byLeverage,
    oneVsThree: { recorded1x: track.recorded1x, rescored1x: track.rescored1x, recorded3x: track.recorded, rescored3x: track.rescored },
  };
}

export interface TradeLiquidation {
  outcome: "unchanged" | "liquidation" | "stop_before_liquidation";
  entryLiquidationPrice: number | null;
  closestLiquidationPct: number | null;
  mmr: number | null;
  fundingPaidUsdt: number;
  rescoredNetUsdt: number;
  rescoredReturnPct: number;
  /** 1배였으면. */
  at1x: { outcome: string; rescoredNetUsdt: number };
}

export function tradeLiquidation(payload: RescorePayload | null, id: string): TradeLiquidation | null {
  const r = payload?.trades[id];
  if (!r) return null;
  return {
    outcome: r.at3x.outcome,
    entryLiquidationPrice: r.at3x.entryLiquidationPrice,
    closestLiquidationPct: r.at3x.closestLiquidationPct,
    mmr: r.at3x.mmr,
    fundingPaidUsdt: r.at3x.fundingPaidUsdt,
    rescoredNetUsdt: r.at3x.rescoredNetUsdt,
    rescoredReturnPct: r.at3x.rescoredReturnPct,
    at1x: { outcome: r.at1x.outcome, rescoredNetUsdt: r.at1x.rescoredNetUsdt },
  };
}
