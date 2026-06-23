"use client";

import { useEffect, useState } from "react";
import { SECTORS, type KeywordCard, type SectorStock, type StockSector } from "@fomo/core";
import {
  type DeckStock,
  rankInstantStocks,
  StockDiscoveryDeckInner,
} from "@/components/SectorStockDeck";
import { fetchSectorStocks, getCachedKeywords, warmKeywords } from "@/lib/fomoApi";
import { FullPageLoading, LOADING_PRESETS } from "@/components/FullPageLoading";

const MAX_DISCOVERY_STOCKS = 60;
const MIN_DISCOVERY_STOCKS = 30;
const DISCOVERY_SECTORS: readonly StockSector[] = SECTORS.filter((sector) => sector !== "코인").slice(0, 6);
const DISCOVERY_SECTOR_SET = new Set<string>(DISCOVERY_SECTORS);

interface TodayDiscoveryDeckProps {
  loggedIn?: boolean | undefined;
  onRequireLogin?: (() => void) | undefined;
}

interface SectorPool {
  sector: StockSector;
  stocks: SectorStock[];
}

function toSector(value: string): StockSector | null {
  return DISCOVERY_SECTOR_SET.has(value) ? (value as StockSector) : null;
}

function mergeTodayDiscoveryStocks(pools: readonly SectorPool[], cards: readonly KeywordCard[]): DeckStock[] {
  const byCanonical = new Map<string, DeckStock>();

  // 1) 캐시에 있는 발굴주를 먼저 넣는다. reason 이 있는 종목은 오늘 발견 풀의 핵심 신호다.
  for (const card of cards) {
    const sector = toSector(card.keyword);
    const surprise = card.surpriseStock;
    if (!sector || !surprise?.reason) continue;
    byCanonical.set(surprise.canonical, {
      canonical: surprise.canonical,
      market: surprise.market,
      country: surprise.country,
      marquee: false,
      sector,
      reason: surprise.reason,
    });
  }

  // 2) 여러 섹터 baseline pool 을 합친다. 이미 발굴주가 있으면 naverCode/marquee 메타만 보강한다.
  for (const pool of pools) {
    for (const stock of pool.stocks) {
      const current = byCanonical.get(stock.canonical);
      if (current) {
        byCanonical.set(stock.canonical, {
          ...stock,
          ...(current.reason ? { reason: current.reason } : {}),
        });
        continue;
      }
      byCanonical.set(stock.canonical, stock);
    }
  }

  const ranked = rankInstantStocks([...byCanonical.values()]);
  return ranked.slice(0, MAX_DISCOVERY_STOCKS);
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
        const stocks = mergeTodayDiscoveryStocks(pools, cachedKeywords?.cards ?? []);
        if (stocks.length === 0) {
          setState({ kind: "error" });
          return;
        }
        setState({ kind: "ready", stocks });
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
    <StockDiscoveryDeckInner
      stocks={state.stocks.slice(0, Math.max(MIN_DISCOVERY_STOCKS, state.stocks.length))}
      loggedIn={loggedIn}
      onRequireLogin={onRequireLogin}
    />
  );
}
