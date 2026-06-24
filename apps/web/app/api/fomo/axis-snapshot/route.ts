import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  applyAxisRarity,
  resolveStock,
  sectorOf,
  selectMultiAxisHook,
  type AxisSignal,
  type MultiAxisHookSelection,
  type StockSector,
} from "@fomo/core";
import { withCors, kstDate, cacheVersion } from "../../../../lib/fomo";
import { assembleStockFront } from "../../../../lib/stock-front";
import {
  computeStockAttentionSignals,
  computeThemeRelativeSignals,
  type StockAttentionSignal,
  type ThemeRelativeSignal,
} from "../../../../lib/stock-signal-coverage";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const REVALIDATE_S = 600;
const MAX_STOCKS = 60;

export interface AxisSnapshotItem {
  axisSignals: AxisSignal[];
  axisHook: MultiAxisHookSelection;
}

export interface AxisSnapshotResponse {
  items: Record<string, AxisSnapshotItem>;
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

async function getAttentionMap(): Promise<Record<string, StockAttentionSignal>> {
  const load = unstable_cache(
    async () => computeStockAttentionSignals(),
    ["fomo-stock-attention", cacheVersion(), kstDate()],
    { revalidate: 1800 }
  );
  return load();
}

async function getThemeRelativeMap(sector: StockSector): Promise<Record<string, ThemeRelativeSignal>> {
  const load = unstable_cache(
    async () => computeThemeRelativeSignals(sector),
    ["fomo-theme-relative", cacheVersion(), kstDate(), sector],
    { revalidate: 1800 }
  );
  return load();
}

function parseStocks(req: Request): string[] {
  const url = new URL(req.url);
  const raw = url.searchParams.get("stocks") ?? "";
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const stock = part.trim();
    if (!stock || seen.has(stock)) continue;
    seen.add(stock);
    out.push(stock);
    if (out.length >= MAX_STOCKS) break;
  }
  return out;
}

async function buildSnapshot(stocks: readonly string[]): Promise<AxisSnapshotResponse> {
  const attentionMap = await getAttentionMap().catch((): Record<string, StockAttentionSignal> => ({}));
  const sectorMaps = new Map<StockSector, Record<string, ThemeRelativeSignal>>();
  const rows = await Promise.allSettled(
    stocks.map(async (stock) => {
      const def = resolveStock(stock);
      const canonical = def?.canonical ?? stock;
      const sector = def ? sectorOf(def.canonical) : undefined;
      let themeRelativeMap: Record<string, ThemeRelativeSignal> = {};
      if (sector) {
        const cached = sectorMaps.get(sector);
        if (cached) {
          themeRelativeMap = cached;
        } else {
          themeRelativeMap = await getThemeRelativeMap(sector).catch((): Record<string, ThemeRelativeSignal> => ({}));
          sectorMaps.set(sector, themeRelativeMap);
        }
      }
      const front = await assembleStockFront(
        canonical,
        {},
        {
          ...(attentionMap[canonical] ? { attention: attentionMap[canonical] } : {}),
          ...(themeRelativeMap[canonical] ? { themeRelative: themeRelativeMap[canonical] } : {}),
        },
        { lite: true }
      );
      return { canonical, axisSignals: front.axisSignals ?? [] };
    })
  );

  const ok = rows
    .filter((row): row is PromiseFulfilledResult<{ canonical: string; axisSignals: AxisSignal[] }> => row.status === "fulfilled")
    .map((row) => row.value)
    .filter((row) => row.axisSignals.length > 0);
  const withRarity = applyAxisRarity(ok.map((row) => row.axisSignals));
  const items: Record<string, AxisSnapshotItem> = {};
  ok.forEach((row, index) => {
    const axisSignals = withRarity[index] ?? row.axisSignals;
    items[row.canonical] = {
      axisSignals,
      axisHook: selectMultiAxisHook(axisSignals),
    };
  });
  return { items };
}

export async function GET(req: Request) {
  const stocks = parseStocks(req);
  if (stocks.length === 0) {
    return withCors(NextResponse.json({ error: "stocks required" }, { status: 400 }));
  }
  try {
    const load = unstable_cache(
      async () => buildSnapshot(stocks),
      ["fomo-axis-snapshot", cacheVersion(), kstDate(), stocks.join("|")],
      { revalidate: REVALIDATE_S }
    );
    return withCors(
      NextResponse.json(await load(), {
        headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" },
      })
    );
  } catch (err) {
    console.warn("[axis-snapshot] failed", (err as Error)?.message);
    return withCors(
      NextResponse.json(
        { items: {} } satisfies AxisSnapshotResponse,
        { headers: { "Cache-Control": "no-store" } }
      )
    );
  }
}
