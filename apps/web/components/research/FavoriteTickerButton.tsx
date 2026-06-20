"use client";

import { useEffect, useMemo, useState } from "react";

import { normalizeResearchPreferences, type ResearchSectorTag } from "@fomo/shared/src/research";

import { getFavoriteStorageTicker } from "../../lib/researchInsights";

const STORAGE_KEY = "research-preferences-v1";

export function FavoriteTickerButton({ ticker, sectorTag }: { ticker: string; sectorTag: ResearchSectorTag }) {
  const normalizedTicker = useMemo(() => getFavoriteStorageTicker(ticker), [ticker]);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        setIsSaved(false);
        return;
      }

      const parsed = normalizeResearchPreferences(JSON.parse(raw));
      setIsSaved(parsed.tickers.includes(normalizedTicker));
    } catch {
      setIsSaved(false);
    }
  }, [normalizedTicker]);

  function handleToggleFavorite() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? normalizeResearchPreferences(JSON.parse(raw)) : normalizeResearchPreferences();
      const nextTickers = parsed.tickers.includes(normalizedTicker)
        ? parsed.tickers.filter((item) => item !== normalizedTicker)
        : [...parsed.tickers, normalizedTicker];
      const nextSectors = parsed.sectors.includes(sectorTag) ? parsed.sectors : [...parsed.sectors, sectorTag];
      const nextPreferences = normalizeResearchPreferences({
        sectors: nextSectors,
        tickers: nextTickers
      });

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPreferences));
      setIsSaved(nextPreferences.tickers.includes(normalizedTicker));
      window.dispatchEvent(new CustomEvent("research-preferences-updated"));
    } catch {
      // Ignore local persistence errors in the MVP.
    }
  }

  return (
    <button className={`detail-cta-button ${isSaved ? "active" : ""}`} onClick={handleToggleFavorite} type="button">
      {isSaved ? "메인에 고정됨" : "메인에 즐겨찾기 추가"}
    </button>
  );
}
