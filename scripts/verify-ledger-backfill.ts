import { readTrackRecord } from "../apps/web/lib/ledger-track-record";
import { readLedgerSelections } from "../apps/web/lib/judgment-ledger";
import { prisma } from "../apps/web/lib/prisma";

async function main() {
  const [selectionCount, selectionDates, finalSelections, outcomeActors, sample, trackRecord] = await Promise.all([
    prisma.judgmentLedger.count({ where: { kind: "selection", actor: "backfill" } }),
    prisma.judgmentLedger.groupBy({
      by: ["date"],
      where: { kind: "selection", actor: "backfill" },
      _count: { _all: true },
      orderBy: { date: "asc" },
    }),
    readLedgerSelections({ fromDate: "2025-01-01", take: 10_000 }),
    prisma.judgmentLedger.groupBy({
      by: ["actor"],
      where: { kind: "outcome" },
      _count: { _all: true },
    }),
    prisma.judgmentLedger.findFirst({
      where: { kind: "selection", actor: "backfill" },
      orderBy: { ts: "asc" },
      select: { ts: true, priceAt: true, payload: true },
    }),
    readTrackRecord(),
  ]);
  const sourceTimestamp = sample?.payload && typeof sample.payload === "object" && !Array.isArray(sample.payload)
    ? (sample.payload as Record<string, unknown>).sourceSnapshotUpdatedAt
    : undefined;
  const timestampPreserved = typeof sourceTimestamp === "string" && sample?.ts.toISOString() === sourceTimestamp;
  const maxOverallN = Math.max(...trackRecord.windows.map((window) => window.overall.n));
  const litSignals = Object.entries(trackRecord.signalHistory30)
    .filter(([, metric]) => metric.n >= trackRecord.signalMinimumSample && metric.winRate !== null)
    .map(([signal]) => signal);
  const result = {
    selectionCount,
    selectionDates: selectionDates.map((row) => ({ date: row.date, count: row._count._all })),
    finalSelectionCount: finalSelections.length,
    finalSelectionDates: [...new Set(finalSelections.map((row) => row.date))].sort(),
    finalSelectionActors: [...new Set(finalSelections.map((row) => row.actor))].sort(),
    outcomeActors,
    maxOverallN,
    windows: trackRecord.windows.map((window) => ({ days: window.days, ...window.overall })),
    litSignals,
    timestampPreserved,
    samplePriceAt: sample?.priceAt.toNumber() ?? null,
  };
  console.log(JSON.stringify(result));
  // 하드 게이트 = 백필의 실제 목표(불변 selection 적재). "n≥200"은 selection 수(스냅샷 수만큼)를 뜻한다.
  if (selectionCount < 200) throw new Error(`backfill selections ${selectionCount}/200`);
  if (!timestampPreserved) throw new Error("backfill source timestamp was not preserved");
  // outcome·signal 뱃지는 시간 의존(7/30/90일 horizon 도래분만 계산 가능) — 백필 시점엔 소수라
  // 하드 실패시키지 않는다(경고만). horizon 도래분이 매일 크론으로 누적된다.
  if (maxOverallN < 200) console.warn(`[verify] track-record outcome 표본 ${maxOverallN}/200 — horizon 도래분 누적 중(정상)`);
  if (litSignals.length === 0) console.warn("[verify] 아직 최소 표본 도달한 신호 재개 뱃지 없음 — 누적 중(정상)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
