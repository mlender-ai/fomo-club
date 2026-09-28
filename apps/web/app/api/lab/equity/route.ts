/**
 * `GET /api/lab/equity` — 평가 자산 (OPS-03 PART D). 화면이 30초마다 부른다.
 *
 * | | |
 * |---|---|
 * | `realized` | 실현 기준 환산 합 — Hero 와 같은 값(FCE 규칙) |
 * | `marked` | 미실현 포함 — **지금** 청산하면. 크립토 · 고래 포지션은 지금 Bitget 가격으로 |
 * | `todayChange` | 오늘(KST 00:00 뒤 첫 점) 대비 평가 변화 — 포지션 탭 |
 * | `points` | 5분 점(감시가 적은 것). 오래된 것은 1시간 간격으로 솎는다 |
 *
 * Bitget 시세는 15초 캐시 — 보는 사람이 늘어도 거래소를 두드리지 않는다.
 */
import { NextResponse } from "next/server";

import { prisma } from "../../../../lib/prisma";
import { currentEquity } from "../../../../lib/lab/watch-run";
import { kstDayRange, kstDay } from "../../../../lib/lab/watch";

export const dynamic = "force-dynamic";

const HOUR = 3_600_000;
const USDT_TRACKS = new Set(["crypto", "whale"]);

function sumNative(tracks: { key: string; markedNative?: number }[]): number | null {
  const hit = tracks.filter((t) => USDT_TRACKS.has(t.key));
  if (hit.length === 0 || hit.some((t) => typeof t.markedNative !== "number")) return null;
  return hit.reduce((s, t) => s + (t.markedNative as number), 0);
}
let cache: { at: number; value: Awaited<ReturnType<typeof currentEquity>> } | null = null;

export async function GET(): Promise<NextResponse> {
  const started = Date.now();
  const now = new Date();
  if (!cache || now.getTime() - cache.at > 15_000) cache = { at: now.getTime(), value: await currentEquity() };
  const equity = cache.value;
  const rows = await prisma.labEquityPoint.findMany({ orderBy: { at: "asc" }, select: { at: true, realized: true, marked: true, tracks: true } });

  // 최근 2일은 5분 그대로 · 그 전은 한 시간에 하나.
  const fine = now.getTime() - 48 * HOUR;
  const points: { at: string; realized: number; marked: number }[] = [];
  let lastHour = -1;
  for (const r of rows) {
    const t = r.at.getTime();
    const hour = Math.floor(t / HOUR);
    if (t < fine && hour === lastHour) continue;
    lastHour = hour;
    points.push({ at: r.at.toISOString(), realized: r.realized, marked: r.marked });
  }
  const dayStart = kstDayRange(kstDay(now)).from;
  const open = rows.find((r) => r.at >= dayStart) ?? null;
  // 포지션 탭 `오늘` — 크립토 · 고래(USDT) 의 원래 통화 평가 변화. 환산값과 섞지 않는다.
  const usdtNow = sumNative(equity.tracks);
  const usdtOpen = open ? sumNative(open.tracks as unknown as { key: string; markedNative?: number }[]) : null;

  return NextResponse.json(
    {
      at: now.toISOString(),
      realized: equity.realized,
      marked: equity.marked,
      unrealized: equity.marked - equity.realized,
      todayChange: open ? equity.marked - open.marked : null,
      todayFrom: open?.at.toISOString() ?? null,
      todayChangeUsdt: usdtOpen === null || usdtNow === null ? null : usdtNow - usdtOpen,
      stalePrices: equity.stalePrices,
      points,
      ms: Date.now() - started,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
