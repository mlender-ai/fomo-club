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
  /**
   * ≥250거래일 확보 종목 수 (CTX-00 B-2).
   *
   * **왜 여기서 세는가**: B-2 는 유니버스 기준 ≥250 확보율을 요구하는데, 이 루프가
   * **유니버스를 정확히 한 바퀴 도는 유일한 지점**이다. 캐시를 밖에서 세면 분모가 틀린다 —
   * 실측(2026-08-18): 캐시 신선분 561행 > 프리웜 유니버스 450. `discovery-supply.ts` 가
   * 후보 종목의 캔들을 기회적으로 같이 쓰기 때문이다. 그래서 캐시 기준 확보율은 123.1% 라는
   * 말이 안 되는 값이 나왔다.
   *
   * `stored` 는 `MIN_USEFUL_DAYS`(120) 기준이라 250 을 분해할 수 없었다. 그것이 B-2 가 두 판
   * 연속 `미확인` 으로 남은 이유다 — 새 수집 없이 카운터 하나로 풀린다.
   */
  let stored250 = 0;
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
          if (daily.candles.length >= 250) stored250 += 1;
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
      /** CTX-00 B-2 — `stored` 는 ≥120, 이쪽이 ≥250 이다. 둘을 헷갈리면 안 된다. */
      stored250,
      /** 유니버스 기준 ≥250 확보율(%). 분모가 이 루프가 돈 종목 수라 의미가 확정된다. */
      rate250Pct: codes.length > 0 ? Math.round((stored250 / codes.length) * 1000) / 10 : null,
      short,
      failed,
      skippedForBudget,
      tookMs: Date.now() - startedAt,
    })
  );
}
