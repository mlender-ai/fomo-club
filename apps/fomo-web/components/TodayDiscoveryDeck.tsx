"use client";

import { useEffect, useState } from "react";
import { StockSwipeDeck } from "@/components/StockSwipeDeck";
import { DISCOVERY_UPDATED_EVENT, fetchDiscovery, type DiscoveryCountryScope, type DiscoveryResponse } from "@/lib/fomoApi";
import { FullPageLoading, LOADING_PRESETS } from "@/components/FullPageLoading";
import { MIN_DISCOVERY_STOCKS, type DiscoveryDeckCard } from "@/lib/discoveryDeck";
import type { FrontEntry } from "@/components/StockSwipeDeck";

interface TodayDiscoveryDeckProps {
  loggedIn?: boolean | undefined;
  onRequireLogin?: (() => void) | undefined;
}

const INITIAL_RETRY_DELAYS_MS = [1_200, 2_400] as const;

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function DiscoveryEmpty({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-16 px-8 text-center text-sm leading-6 text-whiteout" role="status">
      <p>
        오늘 발견 풀을 불러오지 못했어요.
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

export function TodayDiscoveryDeck({ loggedIn, onRequireLogin }: TodayDiscoveryDeckProps) {
  const [country, setCountry] = useState<DiscoveryCountryScope>("KR");
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "ready"; cards: DiscoveryDeckCard[]; fronts: Record<string, FrontEntry> }
  >({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    const applyDiscovery = (discovery: DiscoveryResponse) => {
      const cards = ((discovery.cards?.length ? discovery.cards : discovery.stocks) ?? []) as DiscoveryDeckCard[];
      if (cards.length === 0) {
        setState({ kind: "error" });
        return;
      }
      setState({ kind: "ready", cards, fronts: discovery.fronts as Record<string, FrontEntry> });
    };
    const onDiscoveryUpdated = (event: Event) => {
      const discovery = (event as CustomEvent<DiscoveryResponse>).detail;
      if (!alive || !discovery) return;
      applyDiscovery(discovery);
    };
    window.addEventListener(DISCOVERY_UPDATED_EVENT, onDiscoveryUpdated);
    setState({ kind: "loading" });
    (async () => {
      let lastError: unknown = null;
      for (let attempt = 0; attempt <= INITIAL_RETRY_DELAYS_MS.length; attempt += 1) {
        try {
          const discovery = await fetchDiscovery(country);
          if (!alive) return;
          applyDiscovery(discovery);
          return;
        } catch (err) {
          lastError = err;
          if (attempt < INITIAL_RETRY_DELAYS_MS.length) {
            await wait(INITIAL_RETRY_DELAYS_MS[attempt] ?? 0);
            if (!alive) return;
          }
        }
      }
      if (process.env.NODE_ENV !== "production") {
        console.warn("[TodayDiscoveryDeck] fetch failed", lastError);
      }
      if (alive) setState({ kind: "error" });
    })();
    return () => {
      alive = false;
      window.removeEventListener(DISCOVERY_UPDATED_EVENT, onDiscoveryUpdated);
    };
  }, [country, retryKey]);

  useEffect(() => {
    if (state.kind !== "error") return;
    const retry = window.setTimeout(() => setRetryKey((value) => value + 1), 3_500);
    return () => window.clearTimeout(retry);
  }, [state.kind]);

  const scopeTabs = (
    <div className="mb-4 flex gap-2 px-1" role="tablist" aria-label="시장 선택">
      {[
        ["KR", "국내"],
        ["US", "미국"],
      ].map(([value, label]) => {
        const active = country === value;
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setCountry(value as DiscoveryCountryScope)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              active ? "border-whiteout bg-whiteout text-canvas" : "border-hairline text-muted hover:text-whiteout"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  if (state.kind === "loading") {
    return (
      <>
        {scopeTabs}
        <FullPageLoading estimateMs={LOADING_PRESETS.main.estimateMs} steps={LOADING_PRESETS.main.steps} />
      </>
    );
  }
  if (state.kind === "error") {
    return (
      <>
        {scopeTabs}
        <DiscoveryEmpty onRetry={() => setRetryKey((value) => value + 1)} />
      </>
    );
  }

  return (
    <>
      {scopeTabs}
      <StockSwipeDeck
        key={country}
        stocks={state.cards.slice(0, Math.max(MIN_DISCOVERY_STOCKS, state.cards.length))}
        initialFronts={state.fronts}
        contextLabel={country === "US" ? "미국 발견" : "오늘의 발견"}
        loggedIn={loggedIn}
        onRequireLogin={onRequireLogin}
      />
    </>
  );
}
