import { inferStandardSignalTypes, SIGNAL_TAXONOMY_VERSION } from "@fomo/core";
import { assetForStock, ledgerKey, type LedgerAppendInput } from "./judgment-ledger";

export interface LegacyDaily30Pick {
  canonical?: string;
  headline?: string;
  price?: number;
  symbol?: string;
  naverCode?: string;
  market?: string;
  country?: string;
}

export interface LegacyDaily30Snapshot {
  date?: string;
  picks?: LegacyDaily30Pick[];
}

export interface LegacyDaily30SnapshotRow {
  id: string;
  row: LegacyDaily30Snapshot;
  updatedAt: Date;
}

/**
 * Project only fields that were actually persisted in the legacy snapshot. Signal taxonomy is
 * a deterministic classification of its stored headline, not a reconstructed event.
 */
export function buildLegacyDaily30BackfillEntries(
  snapshots: readonly LegacyDaily30SnapshotRow[]
): LedgerAppendInput[] {
  return snapshots.flatMap(({ id, row, updatedAt }) => {
    const date = row.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    if (!(updatedAt instanceof Date) || !Number.isFinite(updatedAt.getTime())) return [];
    return (row.picks ?? []).flatMap((pick) => {
      if (!pick.canonical?.trim() || typeof pick.price !== "number" || !Number.isFinite(pick.price) || pick.price <= 0) return [];
      const canonical = pick.canonical.trim();
      const asset = assetForStock({
        ...(pick.country ? { country: pick.country } : {}),
        ...(pick.market ? { market: pick.market } : {}),
      });
      const signalTypes = inferStandardSignalTypes({
        ...(pick.headline ? { headline: pick.headline } : {}),
      });
      return [{
        date,
        ts: updatedAt,
        subject: {
          asset,
          canonical,
          ...(pick.symbol || pick.naverCode ? { symbol: pick.symbol ?? pick.naverCode } : {}),
        },
        kind: "selection" as const,
        payload: {
          ...(pick.headline ? { headline: pick.headline } : {}),
          ...(pick.market ? { market: pick.market } : {}),
          ...(pick.country ? { country: pick.country } : {}),
          ...(pick.naverCode ? { naverCode: pick.naverCode } : {}),
          taxonomyVersion: SIGNAL_TAXONOMY_VERSION,
          signalTypes,
          migratedFrom: "daily30-picks",
          sourceSnapshotId: id,
          sourceSnapshotUpdatedAt: updatedAt.toISOString(),
        },
        priceAt: pick.price,
        actor: "backfill" as const,
        idempotencyKey: ledgerKey("legacy-daily30-backfill", id, asset, canonical),
      }];
    });
  });
}
