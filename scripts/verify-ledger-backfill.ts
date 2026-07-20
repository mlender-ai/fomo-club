import { readTrackRecord } from "../apps/web/lib/ledger-track-record";
import { prisma } from "../apps/web/lib/prisma";

async function main() {
  const [selectionCount, sample, trackRecord] = await Promise.all([
    prisma.judgmentLedger.count({ where: { kind: "selection", actor: "backfill" } }),
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
