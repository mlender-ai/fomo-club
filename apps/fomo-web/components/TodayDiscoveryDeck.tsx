"use client";

import { useEffect, useState } from "react";
import { SECTORS, type StockSector } from "@fomo/core";
import { StockSwipeDeck } from "@/components/StockSwipeDeck";
import { fetchAxisSnapshot, fetchSectorStocks, getCachedKeywords, warmKeywords } from "@/lib/fomoApi";
import { FullPageLoading, LOADING_PRESETS } from "@/components/FullPageLoading";
import {
  applyAxisSnapshotToStocks,
  buildTodayDiscoveryStocks,
  MIN_DISCOVERY_STOCKS,
  type DeckStock,
  type SectorPool,
} from "@/lib/discoveryDeck";

const DISCOVERY_SECTORS: readonly StockSector[] = SECTORS.filter((sector) => sector !== "코인").slice(0, 6);
const AXIS_SNAPSHOT_TIMEOUT_MS = 1800;

interface TodayDiscoveryDeckProps {
  loggedIn?: boolean | undefined;
  onRequireLogin?: (() => void) | undefined;
}

function DiscoveryEmpty() {
  return (
    <div className="mt-16 px-8 text-center text-sm leading-6 text-whiteout">
      오늘 발견 풀을 불러오지 못했어요.
      <br />
      잠깐 뒤 다시 들어와 주세요.
    </div>
  );
}

async function applyAxisSnapshot(stocks: DeckStock[]): Promise<DeckStock[]> {
  try {
    const snapshot = await Promise.race([
      fetchAxisSnapshot(stocks.map((s) => s.canonical)),
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("axis snapshot timeout")), AXIS_SNAPSHOT_TIMEOUT_MS)),
    ]);
    return applyAxisSnapshotToStocks(stocks, snapshot.items);
  } catch (err) {
    console.warn("[TodayDiscoveryDeck] axis snapshot fallback", (err as Error)?.message);
    return applyAxisSnapshotToStocks(stocks);
  }
}

export function TodayDiscoveryDeck({ loggedIn, onRequireLogin }: TodayDiscoveryDeckProps) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "ready"; stocks: DeckStock[] }
  >({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    (async () => {
      try {
        const cachedKeywords = getCachedKeywords();
        if (!cachedKeywords) {
          warmKeywords().catch((err) => console.warn("[TodayDiscoveryDeck] keywords warm failed", err));
        }

        const settled = await Promise.allSettled(
          DISCOVERY_SECTORS.map(async (sector) => ({
            sector,
            stocks: (await fetchSectorStocks(sector, true)).stocks ?? [],
          }))
        );
        if (!alive) return;

        const pools: SectorPool[] = [];
        for (const result of settled) {
          if (result.status === "fulfilled" && result.value.stocks.length > 0) {
            pools.push(result.value);
          }
        }
        const stocks = buildTodayDiscoveryStocks(pools, cachedKeywords?.cards ?? [], DISCOVERY_SECTORS);
        if (stocks.length === 0) {
          setState({ kind: "error" });
          return;
        }
        const withAxis = await applyAxisSnapshot(stocks);
        if (!alive) return;
        setState({ kind: "ready", stocks: withAxis });
      } catch (err) {
        console.warn("[TodayDiscoveryDeck] fetch failed", err);
        if (alive) setState({ kind: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (state.kind === "loading") {
    return <FullPageLoading estimateMs={LOADING_PRESETS.main.estimateMs} steps={LOADING_PRESETS.main.steps} />;
  }
  if (state.kind === "error") return <DiscoveryEmpty />;

  return (
    <StockSwipeDeck
      stocks={state.stocks.slice(0, Math.max(MIN_DISCOVERY_STOCKS, state.stocks.length))}
      contextLabel="오늘의 발견"
      loggedIn={loggedIn}
      onRequireLogin={onRequireLogin}
    />
  );
}
