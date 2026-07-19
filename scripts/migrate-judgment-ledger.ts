import { readFeedContentByPrefix } from "../apps/web/lib/feed-content-store";
import { appendJudgmentLedger, assetForStock, ledgerKey } from "../apps/web/lib/judgment-ledger";
import { prisma } from "../apps/web/lib/prisma";

interface LegacyPick {
  canonical?: string;
  headline?: string;
  price?: number;
  symbol?: string;
  naverCode?: string;
  market?: string;
  country?: string;
}

interface LegacySnapshot {
  date?: string;
  picks?: LegacyPick[];
}

async function main() {
  const snapshots = await readFeedContentByPrefix<LegacySnapshot>("daily30-picks:", 50);
  const entries = snapshots.flatMap(({ row }) => {
    if (!row.date || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return [];
    return (row.picks ?? []).flatMap((pick) => {
      if (!pick.canonical || typeof pick.price !== "number" || pick.price <= 0) return [];
      const asset = assetForStock({ country: pick.country, market: pick.market });
      return [{
        date: row.date,
        ts: new Date(`${row.date}T12:00:00+09:00`),
        subject: {
          asset,
          canonical: pick.canonical,
          ...(pick.symbol || pick.naverCode ? { symbol: pick.symbol ?? pick.naverCode } : {}),
        },
        kind: "selection" as const,
        payload: {
          ...(pick.headline ? { headline: pick.headline } : {}),
          ...(pick.market ? { market: pick.market } : {}),
          ...(pick.country ? { country: pick.country } : {}),
          ...(pick.naverCode ? { naverCode: pick.naverCode } : {}),
          signalTypes: [],
          migratedFrom: "daily30-picks",
        },
        priceAt: pick.price,
        actor: "engine" as const,
        idempotencyKey: ledgerKey("legacy-daily30", row.date, asset, pick.canonical),
      }];
    });
  });
  let appended = 0;
  for (let index = 0; index < entries.length; index += 500) {
    appended += await appendJudgmentLedger(entries.slice(index, index + 500));
  }
  const tasteRows = await prisma.tasteSignal.count().catch(() => 0);
  console.log(JSON.stringify({ snapshots: snapshots.length, eligibleSelections: entries.length, appended, legacyTasteRowsWithoutPriceSkipped: tasteRows }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
