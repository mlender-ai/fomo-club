import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { symbolsMissingVolumeHistory, writeUsMarketQuoteRows } from "@/lib/us-market-cache";
import { fetchNasdaqDailyCandles, fetchUsMarketRowsFromSource, latestUsSessionAsOf } from "@/lib/us-market-source";
import { fetchInsiderClusterSymbols } from "@/lib/insider-source";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SLOT_COUNT = 2;

/**
 * 거래량 이력 부트스트랩 (US-02 B-2).
 *
 * 스크리너는 오늘 거래량만 준다 — 20일 평균은 세션이 쌓여야 나온다. 그걸 기다리면
 * "거래량 각성이 미국에서 나온다"가 3주 뒤 일이 된다. 그래서 이력이 빈 종목만 골라
 * **일봉 1콜로 과거 거래량을 한 번에 채운다.** 유니버스 전체를 매 판 돌지는 않는다 —
 * 한 판의 몫을 예산으로 끊고, 프리웜이 반복되며 나머지를 메운다(다음 판은 남은 것부터).
 *
 * 예산은 `maxDuration` 60초에서 스크리너·쓰기 몫을 뺀 값이다. 넘기면 그 판은 거기서 멈춘다 —
 * 조용히 자르지 않고 응답에 `bootstrapSkipped` 로 남긴다.
 */
const VOLUME_BOOTSTRAP_BUDGET_MS = 24_000;
const VOLUME_BOOTSTRAP_MAX_SYMBOLS = 90;
const VOLUME_BOOTSTRAP_CONCURRENCY = 6;
/** 20일 평균에 여유를 둔 창 — 휴장·상장 공백을 감당한다. */
const VOLUME_BOOTSTRAP_CALENDAR_DAYS = 45;

async function bootstrapVolumeHistory(
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
      if (Date.now() - startedAt > VOLUME_BOOTSTRAP_BUDGET_MS) {
        skipped += 1;
        continue;
      }
      attempted += 1;
      const daily = await fetchNasdaqDailyCandles(symbol, VOLUME_BOOTSTRAP_CALENDAR_DAYS).catch(() => null);
      if (!daily) continue;
      const history: Record<string, number> = {};
      for (const candle of daily.candles) {
        if (candle.date && typeof candle.volume === "number" && candle.volume > 0) history[candle.date] = candle.volume;
      }
      if (Object.keys(history).length > 0) seed.set(symbol.toUpperCase(), history);
    }
  };
  await Promise.all(Array.from({ length: VOLUME_BOOTSTRAP_CONCURRENCY }, worker));
  return { seed, attempted, skipped };
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function parseSlot(value: string | undefined): number | null {
  const slot = Number(value);
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT) return null;
  return slot;
}

export async function GET(request: Request, context: { params: Promise<{ slot?: string }> }) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const params = await context.params;
  const slot = parseSlot(params.slot);
  if (slot === null) {
    return NextResponse.json({ ok: false, error: "invalid_slot", slot: params.slot, slotCount: SLOT_COUNT }, { status: 400 });
  }

  // 신호 보유 심볼(SEC Form 4 클러스터 매수) — 시총 하한을 $20B → $2B 로 낮춰 유니버스에 넣는다
  // (US-02 C). 이 조회는 **크론에만** 둔다 — `us-market-source` 가 직접 import 하면 그 의존성이
  // 조회 라우트의 콜드스타트에 실린다(성능 회귀 게이트). 실패해도 빈 집합으로 계속한다.
  const signalBypassSymbols = await fetchInsiderClusterSymbols()
    .then((clusters) => new Set(clusters.map((cluster) => cluster.symbol.toUpperCase())))
    .catch(() => new Set<string>());
  const rows = await fetchUsMarketRowsFromSource({
    slot,
    slotCount: SLOT_COUNT,
    hydrateSparklineFallback: true,
    signalBypassSymbols,
  });
  const sessionDate = latestUsSessionAsOf().date;
  // 이력이 빈 종목부터 채운다 — 이미 쌓인 종목은 세션 누적으로 알아서 갱신된다.
  const missing = await symbolsMissingVolumeHistory(rows.map((row) => row.symbol)).catch((): string[] => []);
  const bootstrap = await bootstrapVolumeHistory(missing.slice(0, VOLUME_BOOTSTRAP_MAX_SYMBOLS));
  const written = await writeUsMarketQuoteRows(rows, {
    slot,
    sessionDate,
    volumeHistorySeed: bootstrap.seed,
  });
  revalidateTag("daily-30", { expire: 0 });
  revalidateTag("feed-hub", { expire: 0 });
  revalidateTag("us-stock-front", { expire: 0 });

  return NextResponse.json({
    ok: true,
    slot,
    slotCount: SLOT_COUNT,
    fetched: rows.length,
    written: written.rows,
    rowsWithPrice: written.rowsWithPrice,
    rowsWithSparkline: written.rowsWithSparkline,
    rowsWithVolumeRatio: written.rowsWithVolumeRatio,
    volumeHistoryMissing: missing.length,
    volumeBootstrapAttempted: bootstrap.attempted,
    volumeBootstrapFilled: bootstrap.seed.size,
    volumeBootstrapSkipped: bootstrap.skipped,
    signalBypassSymbols: signalBypassSymbols.size,
  });
}
