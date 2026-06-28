import type { StockCountry, StockMarket } from "@fomo/core";

export type DiscoveryCountryScope = "KR" | "US" | "all";

export interface DiscoveryScopeStock {
  kind?: "stock";
  canonical?: string;
  market: StockMarket;
  country?: StockCountry;
  naverCode?: string;
  symbol?: string;
  marquee?: boolean;
  sector?: string;
}

export interface DiscoveryScopeThemeBundle {
  kind: "theme_bundle";
  items: DiscoveryScopeStock[];
}

export interface DiscoveryScopeResponse {
  asOf?: string;
  country?: DiscoveryCountryScope;
  stocks: DiscoveryScopeStock[];
  cards?: Array<DiscoveryScopeStock | DiscoveryScopeThemeBundle>;
  fronts: Record<string, unknown>;
  confidence?: "L" | "M" | "H";
  source?: string;
}

function stockMatchesCountry(stock: DiscoveryScopeStock, country: DiscoveryCountryScope): boolean {
  if (country === "all") return true;
  if (country === "KR") return stock.country === "KR" && (stock.market === "KOSPI" || stock.market === "KOSDAQ");
  return stock.country === "US" && (stock.market === "NASDAQ" || stock.market === "NYSE") && !!stock.symbol && !stock.naverCode;
}

function cardMatchesCountry(card: DiscoveryScopeStock | DiscoveryScopeThemeBundle, country: DiscoveryCountryScope): boolean {
  if (country === "all") return true;
  if (card.kind === "theme_bundle") return card.items.length > 0 && card.items.every((item) => stockMatchesCountry(item, country));
  return stockMatchesCountry(card, country);
}

export function discoveryMatchesCountry(
  value: DiscoveryScopeResponse | null | undefined,
  country: DiscoveryCountryScope,
): value is DiscoveryScopeResponse {
  if (!value || !Array.isArray(value.stocks) || !value.fronts || typeof value.fronts !== "object") return false;
  if (value.country && value.country !== country) return false;
  return value.stocks.every((stock) => stockMatchesCountry(stock, country)) && (value.cards ?? []).every((card) => cardMatchesCountry(card, country));
}
