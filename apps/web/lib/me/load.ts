/**
 * TRADER-03 — 화면 하나에 필요한 것을 한 번에(쿼리는 병렬). 실계좌는 `MeSnapshot`, 엔진은 공개 랩 표.
 */
import { prisma } from "../prisma";
import { buildCompare, type CompareView } from "./compare";
import { buildRulesView, type RulesView } from "./rules-view";
import { readMany } from "./store";
import type { AccountPayload, EngineInput, ReplicaPayload, RulesPayload } from "./types";

export const PERIODS = [30, 90, 180] as const;
export type Period = (typeof PERIODS)[number];

/** 비교에서 빼는 트랙 — 크립토가 아니다(주식 · 예측시장). 크립토 트랙이 늘면 자동으로 열이 는다. */
const NOT_CRYPTO = ["stock_us", "stock_kr", "polymarket"];
const DAY_MS = 86_400_000;

export function periodOf(raw: string | null | undefined): Period {
  const n = Number(raw);
  return (PERIODS as readonly number[]).includes(n) ? (n as Period) : 30;
}

export async function loadCompare(days: Period, now = Date.now()): Promise<CompareView> {
  const from = new Date(now - days * DAY_MS - 7 * DAY_MS);
  const [mine, tracks] = await Promise.all([readMany(["account", "replica"]), prisma.fceTrack.findMany({ where: { key: { notIn: NOT_CRYPTO }, status: { not: "excluded" } }, orderBy: { key: "asc" } })]);
  const keys = tracks.map((t) => t.key);
  const [trades, capital, btc] = await Promise.all([
    prisma.fceTrade.findMany({
      where: { trackKey: { in: keys }, exitAt: { gte: from }, entryAt: { not: null } },
      select: { trackKey: true, symbol: true, direction: true, entryAt: true, exitAt: true, netPnlUsdt: true, grossPnlUsdt: true, costsUsdt: true, marginUsdt: true, netReturnPct: true, leverage: true },
    }),
    prisma.fceCapitalPoint.findMany({ where: { trackKey: { in: keys }, at: { gte: from } }, select: { trackKey: true, at: true, capital: true }, orderBy: { at: "asc" } }),
    prisma.candle.findMany({ where: { symbol: "BTC", interval: "D1", at: { gte: from } }, select: { at: true, close: true }, orderBy: { at: "asc" } }),
  ]);
  const engines: EngineInput[] = tracks.map((t) => ({
    key: t.key,
    label: t.label,
    startingCapital: Number(t.startingCapital),
    leverage: t.leverage,
    trades: trades
      .filter((x) => x.trackKey === t.key && x.exitAt && x.entryAt && x.netPnlUsdt !== null)
      .map((x) => ({
        symbol: x.symbol,
        side: x.direction === "short" ? ("short" as const) : ("long" as const),
        entryMs: (x.entryAt as Date).getTime(),
        exitMs: (x.exitAt as Date).getTime(),
        net: x.netPnlUsdt as number,
        gross: x.grossPnlUsdt,
        costs: x.costsUsdt,
        margin: x.marginUsdt,
        returnPct: x.netReturnPct,
        leverage: x.leverage,
      })),
    capital: capital.filter((p) => p.trackKey === t.key).map((p) => ({ at: p.at.getTime(), capital: p.capital })),
  }));
  return buildCompare({
    account: (mine.account as AccountPayload | undefined) ?? null,
    replica: (mine.replica as ReplicaPayload | undefined) ?? null,
    engines,
    // 일봉은 여는 시각이 키다 — 그날 종가는 하루 뒤에 확정된다.
    btc: btc.map((c) => ({ at: c.at.getTime() + DAY_MS - 1, close: Number(c.close) })),
    days,
    now,
  });
}

export async function loadRules(): Promise<RulesView> {
  const mine = await readMany(["rules"]);
  return buildRulesView((mine.rules as RulesPayload | undefined) ?? null);
}
