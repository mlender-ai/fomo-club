import { readFeedContentHistoryByPrefix } from "../apps/web/lib/feed-content-store";
import { appendJudgmentLedger } from "../apps/web/lib/judgment-ledger";
import {
  buildLegacyDaily30BackfillEntries,
  type LegacyDaily30Snapshot,
} from "../apps/web/lib/ledger-backfill";
import { prisma } from "../apps/web/lib/prisma";

async function main() {
  const snapshots = await readFeedContentHistoryByPrefix<LegacyDaily30Snapshot>("daily30-picks:", 5_000);
  const entries = buildLegacyDaily30BackfillEntries(snapshots);
  let appended = 0;
  for (let index = 0; index < entries.length; index += 500) {
    appended += await appendJudgmentLedger(entries.slice(index, index + 500));
  }
  const tasteRows = await prisma.tasteSignal.count().catch(() => 0);
  console.log(JSON.stringify({
    snapshots: snapshots.length,
    eligibleSelections: entries.length,
    appended,
    actor: "backfill",
    earliestSnapshotAt: snapshots[0]?.updatedAt.toISOString() ?? null,
    latestSnapshotAt: snapshots.at(-1)?.updatedAt.toISOString() ?? null,
    legacyTasteRowsWithoutPriceSkipped: tasteRows,
  }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
