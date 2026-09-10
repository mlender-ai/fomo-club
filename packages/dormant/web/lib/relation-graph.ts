import {
  STOCK_VOCAB,
  sectorOf,
  type DiscoveryRelationKind,
  type StockCountry,
  type StockMarket,
} from "@fomo/core";
import { usSymbolForStock } from "./us-symbols";

export interface RelatedNode {
  ticker: string;
  label: string;
  market: StockMarket;
  country: StockCountry;
  relation: DiscoveryRelationKind;
  reason: string;
  source: string;
  confidence: "L" | "M" | "H";
  sector?: string;
  symbol?: string;
  naverCode?: string;
}

export type RelationQuery =
  | { kind: "ticker"; ticker: string }
  | { kind: "theme"; theme: string }
  | { kind: "event"; ticker?: string; theme?: string };

interface CuratedRelationSeed {
  from: { kind: "sector"; id: string } | { kind: "ticker"; ticker: string };
  ticker: string;
  reason: string;
  relation: DiscoveryRelationKind;
  source: "FOMO curated relation map";
  confidence: "M";
}

const RELATION_LIMIT = 8;
const THEME_TO_RESEARCH_SECTOR: Record<string, string> = {
  반도체: "semiconductors",
  AI: "ai-infra",
  "2차전지": "battery-chain",
  자동차: "ev-mobility",
  에너지: "energy-oil",
};

const CURATED_RELATION_SEEDS: readonly CuratedRelationSeed[] = [
  {
    from: { kind: "sector", id: "semiconductors" },
    ticker: "005930.KS",
    reason: "국장 메모리·파운드리 체인으로 미국 리더십의 국내 확산을 읽을 수 있습니다.",
    relation: "supplier",
    source: "FOMO curated relation map",
    confidence: "M",
  },
  {
    from: { kind: "sector", id: "semiconductors" },
    ticker: "000660.KS",
    reason: "HBM/메모리 업황의 국내 수혜 강도를 확인하는 대표 축입니다.",
    relation: "beneficiary",
    source: "FOMO curated relation map",
    confidence: "M",
  },
  {
    from: { kind: "sector", id: "semiconductors" },
    ticker: "NVDA",
    reason: "AI 수요 확산의 최전선이라 업종 심리의 선행 지표 역할을 합니다.",
    relation: "peer",
    source: "FOMO curated relation map",
    confidence: "M",
  },
  {
    from: { kind: "sector", id: "ai-infra" },
    ticker: "VRT",
    reason: "실제 데이터센터 전력·냉각 투자가 열리는지 보여줍니다.",
    relation: "beneficiary",
    source: "FOMO curated relation map",
    confidence: "M",
  },
  {
    from: { kind: "sector", id: "ai-infra" },
    ticker: "ETN",
    reason: "전력 장비 발주가 장기화되는지 확인하기 좋습니다.",
    relation: "beneficiary",
    source: "FOMO curated relation map",
    confidence: "M",
  },
  {
    from: { kind: "sector", id: "battery-chain" },
    ticker: "373220.KS",
    reason: "국내 셀 리더로 완성차 수요와 셀 단가 개선을 동시에 반영합니다.",
    relation: "peer",
    source: "FOMO curated relation map",
    confidence: "M",
  },
  {
    from: { kind: "sector", id: "battery-chain" },
    ticker: "006400.KS",
    reason: "고부가 배터리 수요가 열릴 때 먼저 확인할 수 있는 축입니다.",
    relation: "peer",
    source: "FOMO curated relation map",
    confidence: "M",
  },
  {
    from: { kind: "sector", id: "battery-chain" },
    ticker: "ALB",
    reason: "리튬 가격과 원재료 스프레드가 공급망 전체에 미치는 영향을 대표합니다.",
    relation: "material",
    source: "FOMO curated relation map",
    confidence: "M",
  },
  {
    from: { kind: "ticker", ticker: "005930.KS" },
    ticker: "NVDA",
    reason: "AI 서버 수요가 메모리 업황을 끌고 가는 핵심 수요처입니다.",
    relation: "customer",
    source: "FOMO curated relation map",
    confidence: "M",
  },
  {
    from: { kind: "ticker", ticker: "005930.KS" },
    ticker: "000660.KS",
    reason: "국내 메모리 업황 강도를 비교하는 직접 동행주입니다.",
    relation: "peer",
    source: "FOMO curated relation map",
    confidence: "M",
  },
  {
    from: { kind: "ticker", ticker: "NVDA" },
    ticker: "VRT",
    reason: "GPU 수요가 실제 데이터센터 증설로 번지는지 확인하는 후행 수혜주입니다.",
    relation: "beneficiary",
    source: "FOMO curated relation map",
    confidence: "M",
  },
  {
    from: { kind: "ticker", ticker: "NVDA" },
    ticker: "005930.KS",
    reason: "메모리/HBM 수요가 국장으로 확산되는 대표 수혜 축입니다.",
    relation: "supplier",
    source: "FOMO curated relation map",
    confidence: "M",
  },
];

function normalizeKey(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function canonicalFromRelationTicker(ticker: string): string | undefined {
  const clean = ticker.trim();
  if (!clean) return undefined;
  const upper = clean.toUpperCase();
  const krCode = upper.match(/^(\d{6})\.K[QS]$/)?.[1] ?? (/^\d{6}$/.test(upper) ? upper : undefined);
  if (krCode) {
    return STOCK_VOCAB.find((stock) => stock.naverCode === krCode)?.canonical;
  }
  const usSymbol = usSymbolForStock(upper);
  if (usSymbol) {
    return STOCK_VOCAB.find((stock) => stock.country !== "KR" && stock.aliases.some((alias) => normalizeKey(alias) === usSymbol))?.canonical ?? upper;
  }
  return STOCK_VOCAB.find((stock) => normalizeKey(stock.canonical) === normalizeKey(clean))?.canonical ?? clean;
}

function relationTickerKeys(ticker: string): Set<string> {
  const keys = new Set<string>();
  const clean = ticker.trim();
  const canonical = canonicalFromRelationTicker(clean) ?? clean;
  keys.add(normalizeKey(clean));
  keys.add(normalizeKey(canonical));
  const def = STOCK_VOCAB.find((stock) => stock.canonical === canonical);
  if (def?.naverCode) {
    keys.add(normalizeKey(def.naverCode));
    keys.add(normalizeKey(`${def.naverCode}.KS`));
  }
  const symbol = usSymbolForStock(clean) ?? usSymbolForStock(canonical);
  if (symbol) keys.add(normalizeKey(symbol));
  for (const alias of def?.aliases ?? []) keys.add(normalizeKey(alias));
  return keys;
}

function nodeFromSeed(seed: CuratedRelationSeed): RelatedNode | null {
  const canonical = canonicalFromRelationTicker(seed.ticker);
  if (!canonical) return null;
  const def = STOCK_VOCAB.find((stock) => stock.canonical === canonical);
  const symbol = usSymbolForStock(seed.ticker) ?? usSymbolForStock(canonical);
  const market = def?.market ?? (symbol ? "NASDAQ" : undefined);
  const country = def?.country ?? (symbol ? "US" : undefined);
  if (!market || !country) return null;
  const sector = sectorOf(canonical);
  return {
    ticker: canonical,
    label: canonical,
    market,
    country,
    relation: seed.relation,
    reason: seed.reason,
    source: seed.source,
    confidence: seed.confidence,
    ...(sector ? { sector } : {}),
    ...(def?.naverCode ? { naverCode: def.naverCode } : {}),
    ...(symbol ? { symbol } : {}),
  };
}

function uniqueNodes(nodes: RelatedNode[]): RelatedNode[] {
  const seen = new Set<string>();
  const out: RelatedNode[] = [];
  for (const node of nodes) {
    if (!node.source || !node.confidence || seen.has(node.ticker)) continue;
    seen.add(node.ticker);
    out.push(node);
  }
  return out;
}

export function relatedTo(query: RelationQuery): RelatedNode[] {
  const seeds = CURATED_RELATION_SEEDS;
  const themeId =
    query.kind === "theme"
      ? (THEME_TO_RESEARCH_SECTOR[query.theme] ?? query.theme)
      : query.kind === "event" && query.theme
        ? (THEME_TO_RESEARCH_SECTOR[query.theme] ?? query.theme)
        : undefined;
  const matched =
    query.kind === "ticker"
      ? seeds.filter((seed) => seed.from.kind === "ticker" && relationTickerKeys(query.ticker).has(normalizeKey(seed.from.ticker)))
      : query.kind === "theme"
        ? seeds.filter((seed) => seed.from.kind === "sector" && seed.from.id === themeId)
        : seeds.filter((seed) => {
            const tickerMatch =
              query.ticker && seed.from.kind === "ticker" && relationTickerKeys(query.ticker).has(normalizeKey(seed.from.ticker));
            const themeMatch = themeId && seed.from.kind === "sector" && seed.from.id === themeId;
            return tickerMatch || themeMatch;
          });
  return uniqueNodes(matched.map(nodeFromSeed).filter((node): node is RelatedNode => node !== null)).slice(0, RELATION_LIMIT);
}
