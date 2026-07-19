import type { DiscoveryMarket, StockCountry } from "@fomo/core";

export type DiscoveryCountryScope = "KR" | "US" | "all";

export interface DiscoveryMarketRow {
  canonical: string;
  symbol: string;
  naverCode?: string;
  market: DiscoveryMarket;
  country: StockCountry;
  marketCapRank?: number;
  marketCapRankSource?: "live" | "curated";
  /** 시총(USD) — US 다이내믹 행 큐레이션 하한 검증용(2026-07-11). 스크리너 원천값. */
  marketCapUsd?: number;
  priceText?: string;
  changeText?: string;
  changeDir?: "up" | "down" | "flat";
  changePct?: number;
  tradingValue?: number;
  currency?: "KRW" | "USD";
  sparkline?: number[];
  sectorHint?: string;
  sessionLabel?: string;
}

export interface MarketSource {
  id: string;
  country: DiscoveryCountryScope;
  fetchMarketRows(): Promise<DiscoveryMarketRow[]>;
}
