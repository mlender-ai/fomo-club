import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { writeUsMarketQuoteRows } from "@/lib/us-market-cache";
import { fetchUsMarketRowsFromSource, latestUsSessionAsOf } from "@/lib/us-market-source";
import { fetchInsiderClusterSymbols } from "@/lib/insider-source";
import { withDeadline } from "@/lib/stale-serve";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SLOT_COUNT = 2;

/**
 * 신호 심볼 조회 상한 (US-02).
 *
 * 이 라우트의 임무는 **미국 시세 캐시를 살려두는 것**이다. 캐시가 18시간 넘게 안 채워지면
 * 유니버스가 `seedRows()`(가격 없는 큐레이션 95)로 무너지고 미국 덱이 통째로 죽는다.
 * 그러니 여기에 붙는 부가 작업은 **전부 시간이 잘려야 한다.**
 *
 * 실제로 한 번 다쳤다: 거래량 부트스트랩(예산 24초)을 이 라우트에 넣었더니
 * `maxDuration` 60초를 넘겨 **504** 로 죽었다(2026-09-01 실측). 부트스트랩은
 * `cron/us-volume-bootstrap` 으로 분리했고, 남은 신호 조회에는 마감을 건다.
 * 실패하면 빈 집합으로 계속한다 — 신호 목록이 없다고 시세 캐시를 굶기지 않는다.
 */
const SIGNAL_SYMBOLS_DEADLINE_MS = 8_000;

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
  // (US-02 C). 마감 안에 못 받으면 빈 집합으로 간다(그 판만 우회분이 빠질 뿐, 시세는 정상).
  const signalBypassSymbols =
    (await withDeadline(
      fetchInsiderClusterSymbols()
        .then((clusters) => new Set(clusters.map((cluster) => cluster.symbol.toUpperCase())))
        .catch(() => new Set<string>()),
      SIGNAL_SYMBOLS_DEADLINE_MS
    )) ?? new Set<string>();

  const rows = await fetchUsMarketRowsFromSource({
    slot,
    slotCount: SLOT_COUNT,
    hydrateSparklineFallback: true,
    signalBypassSymbols,
  });
  const written = await writeUsMarketQuoteRows(rows, {
    slot,
    sessionDate: latestUsSessionAsOf().date,
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
    signalBypassSymbols: signalBypassSymbols.size,
  });
}
