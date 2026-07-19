import { NextResponse } from "next/server";
import { withCors, kstDate } from "../../../../../lib/fomo";
import { fetchKrMarketRows } from "../../../../../lib/discovery-supply";
import { fetchStockDaily } from "../../../../../lib/stock-front";
import { writeKrCandleCache } from "../../../../../lib/kr-candle-cache";

/**
 * KR 일봉 260거래일 프리웜 (WO 카드 품질 2차 C) — 네이버 siseJson 420일력을 받아 캐시에 쓴다.
 * 요청 경로(daily-30 빌드)는 이 캐시만 읽고, 미스면 기존 110일력 직접 fetch 로 폴백(동작 후퇴 없음).
 * 새벽(04:40 KST) 실행 — 05:00 index 크론·06:00 daily-30 빌드 전에 캐시가 차 있게.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UNIVERSE_LIMIT = 450; // 발견 유니버스(시총 상위 400) + 여유 — 덱 후보를 덮는다
const CONCURRENCY = 8;
const TIME_BUDGET_MS = 50_000; // maxDuration 60s 안에서 안전 마진

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return withCors(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
  }
  const startedAt = Date.now();
  const rows = await fetchKrMarketRows().catch(() => []);
  const codes = [...new Set(rows.map((row) => row.naverCode).filter((code): code is string => !!code))].slice(0, UNIVERSE_LIMIT);

  let stored = 0;
  let short = 0;
  let failed = 0;
  let skippedForBudget = 0;
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= codes.length) return;
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        skippedForBudget += 1;
        continue; // 카운트만 하고 소진 — 남은 개수를 응답에 정직하게 남긴다(silent cap 금지)
      }
      const code = codes[index]!;
      try {
        const daily = await fetchStockDaily(code, 420);
        if (daily.candles.length >= 120) {
          await writeKrCandleCache(code, daily.candles);
          stored += 1;
        } else {
          short += 1; // 신규 상장 등 이력 자체가 짧음 — 정직하게 캐시 안 함
        }
      } catch {
        failed += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  return withCors(
    NextResponse.json({
      ok: true,
      asOf: kstDate(),
      universe: codes.length,
      stored,
      short,
      failed,
      skippedForBudget,
      tookMs: Date.now() - startedAt,
    })
  );
}
