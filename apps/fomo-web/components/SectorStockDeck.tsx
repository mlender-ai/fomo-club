"use client";

import { useEffect, useState } from "react";
import type { StockSector } from "@fomo/core";
import { StockSwipeDeck } from "@/components/StockSwipeDeck";
import { FullPageLoading, LOADING_PRESETS } from "@/components/FullPageLoading";
import { fetchAxisSnapshot, fetchSectorStocks, getCachedKeywords, warmKeywords } from "@/lib/fomoApi";
import { applyAxisSnapshotToStocks, buildSectorDiscoveryStocks, type DeckStock } from "@/lib/discoveryDeck";

interface SectorDeckProps {
  sector: StockSector;
  loggedIn?: boolean | undefined;
  onRequireLogin?: (() => void) | undefined;
}

const AXIS_SNAPSHOT_TIMEOUT_MS = 1800;

async function applyAxisSnapshot(stocks: DeckStock[]): Promise<DeckStock[]> {
  try {
    const snapshot = await Promise.race([
      fetchAxisSnapshot(stocks.map((s) => s.canonical)),
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("axis snapshot timeout")), AXIS_SNAPSHOT_TIMEOUT_MS)),
    ]);
    return applyAxisSnapshotToStocks(stocks, snapshot.items);
  } catch (err) {
    console.warn("[SectorStockDeck] axis snapshot fallback", (err as Error)?.message);
    return applyAxisSnapshotToStocks(stocks);
  }
}

/**
 * 섹터별 종목 발견 덱.
 * 데이터 로딩과 섹터 풀 구성만 책임지고, 스와이프 동작은 StockSwipeDeck 이 공유한다.
 */
export function SectorStockDeck({ sector, loggedIn, onRequireLogin }: SectorDeckProps) {
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
          warmKeywords().catch((err) => console.warn("[SectorStockDeck] keywords warm failed", err));
        }
        const poolRes = await fetchSectorStocks(sector, true);
        if (!alive) return;
        if (!poolRes.stocks?.length) {
          setState({ kind: "error" });
          return;
        }
        const stocks = buildSectorDiscoveryStocks(poolRes.stocks, cachedKeywords?.cards ?? [], sector);
        const withAxis = await applyAxisSnapshot(stocks.length ? stocks : poolRes.stocks);
        if (!alive) return;
        setState({ kind: "ready", stocks: withAxis });
      } catch (err) {
        console.warn("[SectorStockDeck] fetch failed", err);
        if (alive) setState({ kind: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [sector]);

  if (state.kind === "loading") {
    return <FullPageLoading estimateMs={LOADING_PRESETS.main.estimateMs} steps={LOADING_PRESETS.main.steps} />;
  }
  if (state.kind === "error") {
    return (
      <div className="mt-16 px-8 text-center text-sm leading-6 text-whiteout">
        이 섹터는 지금 보여줄 종목이 잠깐 비었어요.
        <br />
        다른 섹터를 둘러봐 주세요.
      </div>
    );
  }

  return (
    <StockSwipeDeck
      stocks={state.stocks}
      contextLabel={sector}
      loggedIn={loggedIn}
      onRequireLogin={onRequireLogin}
    />
  );
}
