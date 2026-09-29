/**
 * 과거 거래 청산 재채점 (ENG-01 PART D) — **기록을 덮어쓰지 않는다.** 결과는 따로(`rescored_with_liquidation`).
 *
 *   npx tsx scripts/lab/liquidation-rescore.ts          # FCE 에서 읽어 표로 낸다
 *
 * 업로더(`fce-upload.ts`)가 같은 함수로 결과를 LAB 에 올린다.
 */
import {
  rescoreTrade,
  type Bar,
  statsOf,
  type Rescore,
  type RescorePayload,
  type RescoreTrack,
  type RescoreTrade,
  type TrackStats,
} from "../../apps/web/lib/lab/liquidation";

export type { RescorePayload, RescoreTrack };
import { fundingHistory, marginTiers, toRescoreTrade, tradeBars } from "./liquidation-data";

/** 배수 스트레스 — 1 · 3 은 D-2, 5 · 10 은 "배수를 올리면 드러나나". */
export const STRESS = [1, 3, 5, 10];

export async function rescoreAll(
  sources: { trackKey: string; startingCapital: number; raw: Record<string, unknown>[] }[],
  log: (s: string) => void = () => undefined
): Promise<RescorePayload> {
  const trades: RescorePayload["trades"] = {};
  const tracks: RescoreTrack[] = [];
  for (const src of sources) {
    const closed = src.raw.map((r) => toRescoreTrade(r, src.trackKey)).filter((t): t is RescoreTrade & { timeframe: string } => t !== null);
    const since = Math.min(...closed.map((t) => t.entryAt));
    const rows: { t: RescoreTrade; at3x: Rescore; at1x: Rescore; stress: Rescore[] }[] = [];
    let skipped = 0;
    for (const symbol of [...new Set(closed.map((t) => t.symbol))]) {
      let tiers;
      let funding;
      try {
        [tiers, funding] = [await marginTiers(symbol), await fundingHistory(symbol, since)];
      } catch (e) {
        log(`  ${symbol} 재료 없음 — ${e instanceof Error ? e.message : e}`);
        skipped += closed.filter((t) => t.symbol === symbol).length;
        continue;
      }
      for (const t of closed.filter((x) => x.symbol === symbol)) {
        let bars: Bar[];
        try {
          bars = await tradeBars(t, t.timeframe);
        } catch {
          bars = [];
        }
        if (bars.length === 0) {
          skipped += 1;
          continue;
        }
        const at3x = rescoreTrade(t, bars, funding, tiers);
        const at1x = rescoreTrade(t, bars, funding, tiers, { leverage: 1 });
        const stress = STRESS.map((leverage) => rescoreTrade(t, bars, funding, tiers, { leverage }));
        rows.push({ t, at3x, at1x, stress });
        trades[t.id] = { at3x, at1x };
      }
    }
    const series = (pick: (r: (typeof rows)[number]) => number) => rows.map((r) => ({ at: r.t.exitAt, net: pick(r) }));
    const closest = rows
      .filter((r) => r.at3x.closestLiquidationPct !== null)
      .sort((a, b) => (a.at3x.closestLiquidationPct as number) - (b.at3x.closestLiquidationPct as number))[0];
    tracks.push({
      trackKey: src.trackKey,
      startingCapital: src.startingCapital,
      recorded: statsOf(series((r) => r.at3x.recordedNetUsdt), src.startingCapital),
      rescored: statsOf(series((r) => r.at3x.rescoredNetUsdt), src.startingCapital),
      recorded1x: statsOf(series((r) => r.at1x.recordedNetUsdt), src.startingCapital),
      rescored1x: statsOf(series((r) => r.at1x.rescoredNetUsdt), src.startingCapital),
      liquidated: rows.filter((r) => r.at3x.outcome === "liquidation").length,
      stopBeforeLiquidation: rows.filter((r) => r.at3x.outcome === "stop_before_liquidation").length,
      liquidatedOnlyAt3x: rows.filter((r) => r.at3x.outcome === "liquidation" && r.at1x.outcome !== "liquidation").length,
      closest: closest ? { id: closest.t.id, symbol: closest.t.symbol, pct: closest.at3x.closestLiquidationPct as number } : null,
      fundingPaidUsdt: rows.reduce((s, r) => s + r.at3x.fundingPaidUsdt, 0),
      skipped,
      byLeverage: STRESS.map((leverage, i) => ({
        leverage,
        liquidated: rows.filter((r) => r.stress[i]?.outcome === "liquidation").length,
        stopBeforeLiquidation: rows.filter((r) => r.stress[i]?.outcome === "stop_before_liquidation").length,
        rescored: statsOf(series((r) => (r.stress[i] as Rescore).rescoredNetUsdt), src.startingCapital),
      })),
    });
  }
  return {
    asOf: new Date().toISOString(),
    method: "Bitget 격리 청산가 · 1단계 MMR(query-position-lever) · 테이커 0.0006 · 펀딩(history-fund-rate)을 증거금에서 차감 · 봉 = 거래 timeframe",
    tracks,
    trades,
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────

const FCE = process.env.FCE_BASE_URL ?? "http://127.0.0.1:8875";

async function fceJson(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${FCE}${path}`, { signal: AbortSignal.timeout(120_000) });
  return (await res.json()) as Record<string, unknown>;
}

function rowsOf(body: Record<string, unknown>): Record<string, unknown>[] {
  const v = body.trades ?? body.items ?? body.data ?? body;
  return (Array.isArray(v) ? v : []) as Record<string, unknown>[];
}

async function main() {
  const crypto = rowsOf(await fceJson("/api/paper/trades?limit=1000")).filter((t) => typeof t.exit_at === "string");
  const whale = rowsOf(await fceJson("/api/onchain/follow/trades?limit=1000")).filter((t) => typeof t.exit_at === "string");
  console.log(`닫힌 거래 — 크립토 ${crypto.length} · 고래 ${whale.length}`);
  const out = await rescoreAll(
    [
      { trackKey: "crypto", startingCapital: 500, raw: crypto },
      { trackKey: "whale", startingCapital: 500, raw: whale },
    ],
    console.log
  );
  const f = (s: TrackStats) =>
    `N ${s.n} · 승률 ${s.winRatePct?.toFixed(2)}% · PF ${s.profitFactor?.toFixed(4)} · 순손익 ${s.netUsdt.toFixed(2)} · MDD ${s.mddPct?.toFixed(2)}%`;
  for (const t of out.tracks) {
    console.log(`\n[${t.trackKey}] 청산 ${t.liquidated} · 청산 전 손절 ${t.stopBeforeLiquidation} · 3배만 청산 ${t.liquidatedOnlyAt3x} · 건너뜀 ${t.skipped}`);
    console.log(`  기록 3배   ${f(t.recorded)}`);
    console.log(`  재채점 3배 ${f(t.rescored)}`);
    console.log(`  기록 1배   ${f(t.recorded1x)}`);
    console.log(`  재채점 1배 ${f(t.rescored1x)}`);
    for (const b of t.byLeverage) console.log(`  ${b.leverage}배 스트레스 — 청산 ${b.liquidated} · 청산 전 손절 ${b.stopBeforeLiquidation} · ${f(b.rescored)}`);
    console.log(`  청산가에 가장 가까이: ${t.closest ? `${t.closest.symbol} ${t.closest.pct.toFixed(2)}%` : "—"} · 펀딩 합계 ${t.fundingPaidUsdt.toFixed(2)} USDT`);
  }
  const changed = Object.entries(out.trades).filter(([, v]) => v.at3x.changed);
  for (const [id, v] of changed.slice(0, 20)) {
    console.log(`  바뀜 ${id.slice(0, 8)} ${v.at3x.outcome} · 기록 ${v.at3x.recordedNetUsdt.toFixed(2)} → ${v.at3x.rescoredNetUsdt.toFixed(2)}`);
  }
}

if (process.argv[1]?.endsWith("liquidation-rescore.ts")) void main();
