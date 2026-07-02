"use client";

import { useEffect, useState } from "react";
import { StockSwipeDeck } from "@/components/StockSwipeDeck";
import { FullPageLoading, LOADING_PRESETS } from "@/components/FullPageLoading";
import { fetchDaily30, type Daily30Response } from "@/lib/fomoApi";
import { stockDeckCards, type DeckCard, type DiscoveryDeckCard } from "@/lib/discoveryDeck";
import type { FrontEntry } from "@/components/StockSwipeDeck";

interface UnifiedDailyDeckProps {
  loggedIn?: boolean | undefined;
  onRequireLogin?: (() => void) | undefined;
}

const RETRY_DELAYS_MS = [1_200, 2_400] as const;

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function Daily30Empty({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-16 px-8 text-center text-sm leading-6 text-whiteout" role="status">
      <p>
        오늘의 30장을 불러오지 못했어요.
        <br />
        다시 불러오는 중이에요.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-full border border-hairline bg-surface px-5 py-2 text-xs font-semibold text-whiteout transition-colors hover:border-whiteout/30"
      >
        지금 다시 불러오기
      </button>
    </div>
  );
}

function cardsFromDaily30(discovery: Daily30Response): { cards: DeckCard[]; fronts: Record<string, FrontEntry> } {
  const rawCards = ((discovery.cards?.length ? discovery.cards : discovery.stocks) ?? []) as DiscoveryDeckCard[];
  const fronts = discovery.fronts as Record<string, FrontEntry>;
  return { cards: stockDeckCards(rawCards).slice(0, 30), fronts };
}

export function UnifiedDailyDeck({ loggedIn = true, onRequireLogin }: UnifiedDailyDeckProps) {
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "ready"; cards: DeckCard[]; fronts: Record<string, FrontEntry> }
  >({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    (async () => {
      let lastError: unknown = null;
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
        try {
          const discovery = await fetchDaily30();
          if (!alive) return;
          const next = cardsFromDaily30(discovery);
          if (next.cards.length === 0) {
            setState({ kind: "error" });
            return;
          }
          setState({ kind: "ready", ...next });
          return;
        } catch (err) {
          lastError = err;
          if (attempt < RETRY_DELAYS_MS.length) {
            await wait(RETRY_DELAYS_MS[attempt] ?? 0);
            if (!alive) return;
          }
        }
      }
      if (process.env.NODE_ENV !== "production") {
        console.warn("[UnifiedDailyDeck] fetch failed", lastError);
      }
      if (alive) setState({ kind: "error" });
    })();
    return () => {
      alive = false;
    };
  }, [retryKey]);

  useEffect(() => {
    if (state.kind !== "error") return;
    const retry = window.setTimeout(() => setRetryKey((value) => value + 1), 3_500);
    return () => window.clearTimeout(retry);
  }, [state.kind]);

  if (state.kind === "loading") {
    return <FullPageLoading estimateMs={LOADING_PRESETS.main.estimateMs} steps={LOADING_PRESETS.main.steps} />;
  }
  if (state.kind === "error") {
    return <Daily30Empty onRetry={() => setRetryKey((value) => value + 1)} />;
  }

  return (
    <StockSwipeDeck
      cards={state.cards}
      initialFronts={state.fronts}
      contextLabel="오늘의 30장"
      loggedIn={loggedIn}
      onRequireLogin={onRequireLogin}
    />
  );
}
