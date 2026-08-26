import { NextResponse } from "next/server";
import { withCors, kstDate } from "../../../../../lib/fomo";
import { fetchKrMarketRows } from "../../../../../lib/discovery-supply";
import { fetchStockDaily } from "../../../../../lib/stock-front";
import { writeKrCandleCache } from "../../../../../lib/kr-candle-cache";
import { buildKrPickUniverse } from "../../../../../lib/pick-universe";
import { STOCK_VOCAB } from "@fomo/core";

/**
 * KR 일봉 260거래일 프리웜 (WO 카드 품질 2차 C) — 네이버 siseJson 420일력을 받아 캐시에 쓴다.
 * 요청 경로(daily-30 빌드)는 이 캐시만 읽고, 미스면 기존 110일력 직접 fetch 로 폴백(동작 후퇴 없음).
 * 새벽(04:40 KST) 실행 — 05:00 index 크론·06:00 daily-30 빌드 전에 캐시가 차 있게.
 */
export const dynamic = "force-dynamic";
/**
 * 유니버스가 800으로 늘면서 60초로는 못 끝낸다(450종목 실측 30.9초 → 800종목이면 ~55초).
 * 다른 수집 크론(`disclosures`)과 같은 300초로 맞춘다. 동시 실행 수는 **안 올린다** —
 * 네이버를 더 세게 때리는 대신 시간을 준다.
 */
export const maxDuration = 300;

const UNIVERSE_LIMIT = 900; // 픽 유니버스(≈800) + 여유. 시간 예산은 위에서 함께 늘렸다.
const CONCURRENCY = 8;
const TIME_BUDGET_MS = 240_000; // maxDuration 300s 안에서 안전 마진

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
  /**
   * **픽 유니버스를 먼저 채운다** (WO-RESET-04 PART D, 실측 2026-08-26).
   *
   * 종전에는 시세 행 순서대로 앞 450개를 잘랐다. 그런데 그 배열은 KOSPI 627 → KOSDAQ 1000
   * 순이라 **450은 전부 KOSPI 였다 — 코스닥은 한 종목도 안 덮였다.** 그 상태로 픽 유니버스를
   * 326(코스피 158 · 코스닥 168)으로 넓히자 168종목이 일봉 없이 스캔됐고, 진단에
   * `tooShort: 110` 으로 그대로 찍혔다. 가격·거래량 카드(D·E형)는 일봉이 전부라
   * 코스닥 절반이 **보이지도 않는 상태**였다.
   *
   * 그래서 상한을 올리는 대신 **순서를 바꾼다** — 실제로 스캔하는 종목이 먼저다.
   * 상한은 그대로 두므로 시간 예산은 안 늘어난다.
   */
  const universe = buildKrPickUniverse(rows, STOCK_VOCAB);
  const ordered = [
    ...universe.defs.map((def) => def.naverCode).filter((code): code is string => !!code),
    ...rows.map((row) => row.naverCode).filter((code): code is string => !!code),
  ];
  const codes = [...new Set(ordered)].slice(0, UNIVERSE_LIMIT);

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
      // 픽 유니버스가 이 안에 다 들어갔는지 — 안 들어간 만큼 D·E형이 못 보는 종목이다.
      pickUniverse: universe.defs.length,
      pickUniverseSource: universe.source,
      stored,
      short,
      failed,
      skippedForBudget,
      tookMs: Date.now() - startedAt,
    })
  );
}
