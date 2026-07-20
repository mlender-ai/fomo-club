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
  if (selectionCount < 200) throw new Error(`backfill selections ${selectionCount}/200`);
  if (maxOverallN < 200) throw new Error(`track record sample ${maxOverallN}/200`);
  if (!timestampPreserved) throw new Error("backfill source timestamp was not preserved");
  if (litSignals.length === 0) throw new Error("no M2 signal resume badge reached the minimum sample");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
