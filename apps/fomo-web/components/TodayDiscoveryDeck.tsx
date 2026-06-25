"use client";

import { useEffect, useState } from "react";
import { StockSwipeDeck } from "@/components/StockSwipeDeck";
import { fetchDiscovery } from "@/lib/fomoApi";
import { FullPageLoading, LOADING_PRESETS } from "@/components/FullPageLoading";
import { MIN_DISCOVERY_STOCKS, type DeckStock } from "@/lib/discoveryDeck";
import type { FrontEntry } from "@/components/StockSwipeDeck";

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

export function TodayDiscoveryDeck({ loggedIn, onRequireLogin }: TodayDiscoveryDeckProps) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "ready"; stocks: DeckStock[]; fronts: Record<string, FrontEntry> }
  >({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    (async () => {
      try {
        const discovery = await fetchDiscovery();
        if (!alive) return;
        const stocks = discovery.stocks as DeckStock[];
        if (stocks.length === 0) {
          setState({ kind: "error" });
          return;
        }
        setState({ kind: "ready", stocks, fronts: discovery.fronts as Record<string, FrontEntry> });
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[TodayDiscoveryDeck] fetch failed", err);
        }
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
      initialFronts={state.fronts}
      contextLabel="오늘의 발견"
      loggedIn={loggedIn}
      onRequireLogin={onRequireLogin}
    />
  );
}
