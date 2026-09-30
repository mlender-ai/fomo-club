/**
 * `GET /api/lab/ledger?since=ISO` — 운영 쪽(지금은 맥)이 올린 원장 (OPS-04 PART D).
 *
 * 병행 운용 동안 서버는 올리지 않고 로컬에만 적는다. 대조하려면 운영 쪽 자료가 서버에 있어야 하는데,
 * 맥에 닿을 길은 없고 맥이 올린 것은 랩 DB 에 있다. 그래서 **읽기만** 연다.
 *
 * 모양은 `lib/lab/shadow-diff.ts` 의 `ShadowSide` 그대로다. 목표가 · 손절선은 원장에 없다(LAB-08).
 * 인증은 러너와 같은 토큰 — 거래 원장 전부라 공개하지 않는다.
 */
import { NextResponse } from "next/server";

import { authorized } from "../../../../lib/lab/auth";
import type { ShadowSide } from "../../../../lib/lab/shadow-diff";
import { prisma } from "../../../../lib/prisma";

export const dynamic = "force-dynamic";

const iso = (d: Date | null) => (d === null ? null : d.toISOString());

export async function GET(request: Request): Promise<NextResponse> {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const raw = new URL(request.url).searchParams.get("since");
  const since = raw ? new Date(raw) : null;
  if (!since || Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "since_required", hint: "?since=2026-10-01T00:00:00Z" }, { status: 400 });
  }

  // 갈라진 뒤에 들어갔거나, 그 전에 들어가 뒤에 나온 거래. 그 전에 끝난 것은 양쪽이 같으니 안 보낸다.
  const [trades, positions, tracks] = await Promise.all([
    prisma.fceTrade.findMany({
      where: { OR: [{ entryAt: { gte: since } }, { exitAt: { gte: since } }] },
      select: {
        id: true,
        trackKey: true,
        symbol: true,
        direction: true,
        entryAt: true,
        entryPrice: true,
        exitAt: true,
        exitPrice: true,
        netPnlUsdt: true,
      },
      orderBy: { entryAt: "asc" },
    }),
    prisma.fcePosition.findMany({
      select: { id: true, trackKey: true, symbol: true, direction: true, entryAt: true, entryPrice: true },
    }),
    prisma.fceTrack.findMany({ select: { key: true, trades: true, currentCapital: true, status: true } }),
  ]);

  const body: ShadowSide = {
    at: new Date().toISOString(),
    tracks: tracks.map((t) => ({
      key: t.key,
      trades: t.trades,
      currentCapital: t.currentCapital === null ? null : t.currentCapital.toNumber(),
      status: t.status,
    })),
    trades: trades.map((t) => ({ ...t, entryAt: iso(t.entryAt), exitAt: iso(t.exitAt) })),
    positions: positions.map((p) => ({ ...p, entryAt: iso(p.entryAt) })),
  };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
