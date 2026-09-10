import { NextResponse } from "next/server";
import { readUsMarketQuoteRows, symbolsMissingVolumeHistory, seedUsVolumeHistories } from "@/lib/us-market-cache";
import { fetchNasdaqDailyCandles, latestUsSessionAsOf } from "@/lib/us-market-source";

/**
 * 거래량 이력 부트스트랩 (US-02 B-2) — **시세 프리웜에서 분리된 별도 크론**.
 *
 * ## 왜 분리했나
 *
 * 처음엔 `us-market-prewarm` 안에 넣었다. 그 라우트의 임무는 **미국 시세 캐시를 살려두는
 * 것**이고, 캐시가 18시간 안 채워지면 유니버스가 `seedRows()`(가격 없는 큐레이션 95)로
 * 무너져 미국 덱이 통째로 죽는다. 거기에 24초짜리 부가 작업을 얹었더니
 * **`maxDuration` 60초를 넘겨 504 로 죽었다**(2026-09-01 실측 — 첫 판은 이력이 전부 비어
 * 부트스트랩이 예산을 꽉 쓴다).
 *
 * 살아 있어야 하는 것과 있으면 좋은 것을 같은 함수에 두면, 있으면 좋은 것이 살아 있어야
 * 하는 것을 죽인다. 그래서 나눴다 — **이 라우트가 실패해도 시세는 멀쩡하다.**
 *
 * ## 무엇을 하나
 *
 * 스크리너는 오늘 거래량 하나만 준다. 20일 평균은 세션이 쌓여야 나오고, 그걸 기다리면
 * 거래량 각성이 3주 뒤에나 처음 뜬다. 그래서 이력이 빈 종목만 골라 **일봉 1콜로 과거
 * 거래량을 한 번에 채운다.** 한 판의 몫을 예산으로 끊고, 반복 호출로 나머지를 메운다.
 *
 * 이 라우트는 시세를 건드리지 않는다 — 기존 행의 `volumeHistory` 만 채운다.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** `maxDuration` 60초에서 조회·쓰기 몫을 넉넉히 남긴 값. 넘기면 그 판은 거기서 멈춘다. */
const BOOTSTRAP_BUDGET_MS = 30_000;
const BOOTSTRAP_MAX_SYMBOLS = 120;
const BOOTSTRAP_CONCURRENCY = 6;
/** 20일 평균에 여유를 둔 창 — 휴장·상장 공백을 감당한다. */
const BOOTSTRAP_CALENDAR_DAYS = 45;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function bootstrap(
  symbols: readonly string[]
): Promise<{ seed: Map<string, Record<string, number>>; attempted: number; skipped: number }> {
  const seed = new Map<string, Record<string, number>>();
  const startedAt = Date.now();
  let attempted = 0;
  let skipped = 0;
  const queue = [...symbols];
  const worker = async (): Promise<void> => {
    for (;;) {
      const symbol = queue.shift();
      if (!symbol) return;
      // 예산은 **새로 시작하는 것**만 막는다 — 이미 시작한 조회는 자체 타임아웃(6초)이 끊는다.
      if (Date.now() - startedAt > BOOTSTRAP_BUDGET_MS) {
        skipped += 1;
        continue;
      }
      attempted += 1;
      const daily = await fetchNasdaqDailyCandles(symbol, BOOTSTRAP_CALENDAR_DAYS).catch(() => null);
      if (!daily) continue;
      const history: Record<string, number> = {};
      for (const candle of daily.candles) {
        if (candle.date && typeof candle.volume === "number" && candle.volume > 0) history[candle.date] = candle.volume;
      }
      if (Object.keys(history).length > 0) seed.set(symbol.toUpperCase(), history);
    }
  };
  await Promise.all(Array.from({ length: BOOTSTRAP_CONCURRENCY }, worker));
  return { seed, attempted, skipped };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const rows = await readUsMarketQuoteRows().catch(() => []);
  if (rows.length === 0) {
    // 시세 캐시가 비어 있으면 채울 대상이 없다 — 프리웜이 먼저 돌아야 한다(조용한 성공 금지).
    return NextResponse.json({ ok: true, universe: 0, note: "시세 캐시가 비어 있다 — us-market-prewarm 먼저" });
  }
  const symbols = rows.map((row) => row.symbol.toUpperCase());
  const missing = await symbolsMissingVolumeHistory(symbols).catch((): string[] => []);
  const result = await bootstrap(missing.slice(0, BOOTSTRAP_MAX_SYMBOLS));
  const filled = await seedUsVolumeHistories(result.seed, latestUsSessionAsOf().date);

  return NextResponse.json({
    ok: true,
    universe: rows.length,
    missing: missing.length,
    attempted: result.attempted,
    fetched: result.seed.size,
    skippedForBudget: result.skipped,
    written: filled.written,
    rowsWithVolumeRatio: filled.rowsWithVolumeRatio,
    elapsedMs: Date.now() - startedAt,
  });
}
