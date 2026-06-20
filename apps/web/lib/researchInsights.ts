import {
  findResearchTickerOption,
  getResearchSectorLabel,
  inferResearchTickerInputMarket,
  normalizeResearchTicker,
  researchSectorOptions,
  researchTickerOptions,
  type ResearchNewsItem,
  type ResearchSectorOption,
  type ResearchSectorTag,
  type ResearchTickerInputMarket,
  type ResearchTickerMarket,
  type TickerAnalysis
} from "@fomo/shared/src/research";
import { analyzeLiveTicker, buildLiveResearchWorkspace, searchResearchTickers } from "@fomo/shared/src/researchLive";

const INSIGHT_CACHE_TTL_MS = 90_000;

const tickerInsightCache = new Map<string, { expiresAt: number; value: TickerDeepDiveData | null }>();
const sectorInsightCache = new Map<string, { expiresAt: number; value: SectorDeepDiveData | null }>();

export interface RelatedOpportunity {
  ticker: string;
  label: string;
  market: ResearchTickerMarket;
  exchange: string;
  sectorTag: ResearchSectorTag;
  relation: "customer" | "supplier" | "material" | "peer" | "beneficiary";
  reason: string;
}

export interface OpportunityMapGroup {
  relation: RelatedOpportunity["relation"];
  title: string;
  description: string;
  items: RelatedOpportunity[];
}

export interface OpportunityMapData {
  thesis: string;
  groups: OpportunityMapGroup[];
}

export interface InsightCatalyst {
  title: string;
  reason: string;
  horizon: "today" | "this-week" | "next";
}

export interface ThesisScenario {
  label: "bull" | "base" | "bear";
  title: string;
  description: string;
}

export interface TickerDeepDiveData {
  ticker: string;
  company: string;
  sectorTag: ResearchSectorTag;
  sectorLabel: string;
  analysis: TickerAnalysis;
  linkedNews: ResearchNewsItem[];
  sectorWorkspace: Awaited<ReturnType<typeof buildLiveResearchWorkspace>>["workspace"];
  relatedOpportunities: RelatedOpportunity[];
  opportunityMap: OpportunityMapData;
  adjacentSectors: ResearchSectorOption[];
  themeBullets: string[];
  catalysts: InsightCatalyst[];
  scenarios: ThesisScenario[];
  warnings: string[];
}

export interface SectorDeepDiveData {
  sector: ResearchSectorOption;
  workspace: Awaited<ReturnType<typeof buildLiveResearchWorkspace>>["workspace"];
  relatedOpportunities: RelatedOpportunity[];
  adjacentSectors: ResearchSectorOption[];
  catalysts: InsightCatalyst[];
  warnings: string[];
}

const adjacentSectorMap: Record<ResearchSectorTag, ResearchSectorTag[]> = {
  semiconductors: ["ai-infra", "battery-chain"],
  "energy-oil": ["industrial-tech", "battery-chain"],
  "ai-infra": ["semiconductors", "industrial-tech"],
  "industrial-tech": ["ev-mobility", "ai-infra"],
  "ev-mobility": ["battery-chain", "industrial-tech"],
  "battery-chain": ["ev-mobility", "semiconductors"]
};

const sectorOpportunityMap: Record<
  ResearchSectorTag,
  Array<{ ticker: string; reason: string; relation: RelatedOpportunity["relation"] }>
> = {
  semiconductors: [
    { ticker: "NVDA", reason: "AI 수요 확산의 최전선이라 업종 심리의 선행 지표 역할을 합니다.", relation: "peer" },
    { ticker: "AMD", reason: "GPU/CPU 대체 수요 확산이 실제로 뒤따르는지 확인하기 좋습니다.", relation: "peer" },
    { ticker: "005930.KS", reason: "국장 메모리·파운드리 체인으로 미국 리더십의 국내 확산을 읽을 수 있습니다.", relation: "supplier" },
    { ticker: "000660.KS", reason: "HBM/메모리 업황의 국내 수혜 강도를 확인하는 대표 축입니다.", relation: "beneficiary" }
  ],
  "energy-oil": [
    { ticker: "XOM", reason: "메이저 오일의 현금흐름 안정성이 업종 방어력을 대표합니다.", relation: "peer" },
    { ticker: "CVX", reason: "메이저 capex 유지 여부가 서비스주 확산의 선행 신호가 됩니다.", relation: "peer" },
    { ticker: "010950.KS", reason: "국장 정유 마진과 배당 방어 논리를 동시에 볼 수 있습니다.", relation: "beneficiary" },
    { ticker: "096770.KS", reason: "정유보다 공격적인 에너지 전환/정제 스프레드 베팅 축입니다.", relation: "beneficiary" }
  ],
  "ai-infra": [
    { ticker: "VRT", reason: "실제 데이터센터 전력·냉각 투자가 열리는지 보여줍니다.", relation: "beneficiary" },
    { ticker: "ETN", reason: "전력 장비 발주가 장기화되는지 확인하기 좋습니다.", relation: "beneficiary" },
    { ticker: "NVDA", reason: "AI 인프라 수요가 여전히 반도체 리더십을 통해 검증됩니다.", relation: "customer" }
  ],
  "industrial-tech": [
    { ticker: "ROK", reason: "제조 자동화 투자 회복이 실제 주문으로 번지는지 보여줍니다.", relation: "peer" },
    { ticker: "ETN", reason: "산업 전력 장비는 CAPEX 회복의 확인 지표입니다.", relation: "beneficiary" },
    { ticker: "GM", reason: "제조업 CAPEX가 완성차와 공급망으로 연결되는 수혜 축입니다.", relation: "beneficiary" }
  ],
  "ev-mobility": [
    { ticker: "TSLA", reason: "완성차 가격 정책과 자율주행 기대가 업종 밸류에이션을 끌고 갑니다.", relation: "peer" },
    { ticker: "RIVN", reason: "후발 EV 플레이어로 확산 수요가 이어지는지 보기에 좋습니다.", relation: "peer" },
    { ticker: "373220.KS", reason: "국장 셀 업체가 미국 EV 수요의 국내 수혜로 이어지는 축입니다.", relation: "supplier" },
    { ticker: "006400.KS", reason: "배터리 프리미엄 제품군이 EV 믹스 개선의 수혜를 받습니다.", relation: "supplier" }
  ],
  "battery-chain": [
    { ticker: "373220.KS", reason: "국내 셀 리더로 완성차 수요와 셀 단가 개선을 동시에 반영합니다.", relation: "peer" },
    { ticker: "006400.KS", reason: "고부가 배터리 수요가 열릴 때 먼저 확인할 수 있는 축입니다.", relation: "peer" },
    { ticker: "ALB", reason: "리튬 가격과 원재료 스프레드가 공급망 전체에 미치는 영향을 대표합니다.", relation: "material" },
    { ticker: "QS", reason: "차세대 배터리 기대가 얼마나 투기적 성격인지 비교하는 온도계입니다.", relation: "beneficiary" }
  ]
};

const tickerSpecificOpportunityMap: Record<
  string,
  Array<{ ticker: string; reason: string; relation: RelatedOpportunity["relation"] }>
> = {
  TSLA: [
    { ticker: "373220.KS", reason: "미국 EV 수요가 강하면 국내 배터리 셀 수혜 여부를 같이 볼 수 있습니다.", relation: "supplier" },
    { ticker: "006400.KS", reason: "고성능 배터리 수요가 커질수록 프리미엄 셀 밸류체인에 우호적입니다.", relation: "supplier" },
    { ticker: "ALB", reason: "배터리 원재료 가격이 Tesla 마진과 연결되는 대표 원료 축입니다.", relation: "material" },
    { ticker: "RIVN", reason: "Tesla 강세가 업종 전체 확산인지 단독 리더십인지 비교할 수 있습니다.", relation: "peer" }
  ],
  NVDA: [
    { ticker: "VRT", reason: "GPU 수요가 실제 데이터센터 증설로 번지는지 확인하는 후행 수혜주입니다.", relation: "beneficiary" },
    { ticker: "ETN", reason: "전력 인프라 수요가 GPU 랠리를 따라 확산되는지 볼 수 있습니다.", relation: "beneficiary" },
    { ticker: "005930.KS", reason: "메모리/HBM 수요가 국장으로 확산되는 대표 수혜 축입니다.", relation: "supplier" }
  ],
  "373220.KS": [
    { ticker: "TSLA", reason: "Tesla 판매량과 가격 정책이 셀 수요 기대를 가장 크게 흔듭니다.", relation: "customer" },
    { ticker: "GM", reason: "완성차 수요가 확산될 때 후속 고객사 축으로 같이 봐야 합니다.", relation: "customer" },
    { ticker: "ALB", reason: "리튬 가격은 셀 수익성과 직결되는 upstream 원재료 변수입니다.", relation: "material" },
    { ticker: "006400.KS", reason: "국내 프리미엄 셀 경쟁 구도를 같이 봐야 밸류에이션이 읽힙니다.", relation: "peer" }
  ],
  "005930.KS": [
    { ticker: "NVDA", reason: "AI 서버 수요가 메모리 업황을 끌고 가는 핵심 수요처입니다.", relation: "customer" },
    { ticker: "000660.KS", reason: "국내 메모리 업황 강도를 비교하는 직접 동행주입니다.", relation: "peer" },
    { ticker: "AMD", reason: "GPU/CPU 수요 확산이 국내 메모리 체인에 어떻게 번지는지 함께 봐야 합니다.", relation: "beneficiary" }
  ]
};

const sectorThemeMap: Record<ResearchSectorTag, string[]> = {
  semiconductors: ["리더 종목 프리미엄", "HBM/메모리 확산", "실적 코멘트 중심 확인"],
  "energy-oil": ["현금흐름 방어력", "메이저 capex 유지", "정유 마진/서비스주 분리"],
  "ai-infra": ["전력·냉각 투자", "데이터센터 CAPEX", "GPU 이후 확산 확인"],
  "industrial-tech": ["제조업 CAPEX", "자동화 발주", "공급망 효율화"],
  "ev-mobility": ["완성차 수요", "가격 정책", "자율주행 기대"],
  "battery-chain": ["셀 단가/믹스", "원재료 스프레드", "완성차 수요 전이"]
};

const opportunityRelationMeta: Record<
  RelatedOpportunity["relation"],
  { title: string; description: string }
> = {
  customer: {
    title: "수요처",
    description: "이 종목 실적과 멀티플을 직접 흔드는 고객사 또는 최종 수요처입니다."
  },
  supplier: {
    title: "공급사",
    description: "핵심 부품·셀·메모리처럼 직접 공급망으로 연결된 축입니다."
  },
  material: {
    title: "원재료",
    description: "마진과 밸류에이션을 흔드는 upstream 원재료 변수입니다."
  },
  peer: {
    title: "동행주",
    description: "업종 리더십과 상대 강도를 비교하기 좋은 직접 비교군입니다."
  },
  beneficiary: {
    title: "확산 수혜",
    description: "핵심 리더의 강세가 넓게 번질 때 같이 반응할 가능성이 큰 종목입니다."
  }
};

const opportunityMapThesis: Record<ResearchSectorTag, string> = {
  semiconductors: "수요처와 메모리 공급망, 그리고 후행 확산주를 함께 봐야 업황의 진짜 강도를 읽을 수 있습니다.",
  "energy-oil": "메이저 오일, 정유, 서비스 간 자금 이동을 구분해야 섹터 내 승자와 패자가 보입니다.",
  "ai-infra": "GPU 이후에 전력과 냉각으로 CAPEX가 번지는지 확인해야 멀티플 확산을 읽을 수 있습니다.",
  "industrial-tech": "산업 자동화와 CAPEX 회복이 어떤 밸류체인으로 전이되는지 따라가야 합니다.",
  "ev-mobility": "완성차 리더, 배터리 공급사, 원재료 축을 같이 봐야 전기차 랠리의 지속성을 판단할 수 있습니다.",
  "battery-chain": "완성차 수요처와 리튬 같은 원재료, 셀 경쟁 구도를 함께 봐야 배터리 체인의 실질 수혜가 보입니다."
};

function uniqueByTicker(items: RelatedOpportunity[]): RelatedOpportunity[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.ticker)) {
      return false;
    }

    seen.add(item.ticker);
    return true;
  });
}

function toRelatedOpportunity(entry: { ticker: string; reason: string; relation: RelatedOpportunity["relation"] }): RelatedOpportunity | null {
  const option = findResearchTickerOption(entry.ticker);

  if (!option) {
    return null;
  }

  return {
    ticker: option.ticker,
    label: option.label,
    market: option.market,
    exchange: option.exchange,
    sectorTag: option.sectorTag,
    relation: entry.relation,
    reason: entry.reason
  };
}

function getAdjacentSectors(sectorTag: ResearchSectorTag): ResearchSectorOption[] {
  return (adjacentSectorMap[sectorTag] ?? [])
    .map((id) => researchSectorOptions.find((sector) => sector.id === id) ?? null)
    .filter((sector): sector is ResearchSectorOption => Boolean(sector));
}

function buildRelatedOpportunities(sectorTag: ResearchSectorTag, ticker: string): RelatedOpportunity[] {
  const sectorBase = (sectorOpportunityMap[sectorTag] ?? []).map(toRelatedOpportunity).filter((item): item is RelatedOpportunity => Boolean(item));
  const tickerSpecific = (tickerSpecificOpportunityMap[ticker] ?? []).map(toRelatedOpportunity).filter((item): item is RelatedOpportunity => Boolean(item));

  return uniqueByTicker([...tickerSpecific, ...sectorBase].filter((item) => item.ticker !== ticker)).slice(0, 6);
}

function buildOpportunityMap(sectorTag: ResearchSectorTag, ticker: string, relatedOpportunities: RelatedOpportunity[]): OpportunityMapData {
  const relationOrder: RelatedOpportunity["relation"][] = ["customer", "supplier", "material", "peer", "beneficiary"];
  const groups = relationOrder
    .map((relation) => {
      const items = relatedOpportunities.filter((item) => item.relation === relation);

      if (items.length === 0) {
        return null;
      }

      return {
        relation,
        title: opportunityRelationMeta[relation].title,
        description: opportunityRelationMeta[relation].description,
        items
      } satisfies OpportunityMapGroup;
    })
    .filter((group): group is OpportunityMapGroup => Boolean(group));

  if (groups.length === 0) {
    return {
      thesis: opportunityMapThesis[sectorTag],
      groups: [
        {
          relation: "beneficiary",
          title: opportunityRelationMeta.beneficiary.title,
          description: opportunityRelationMeta.beneficiary.description,
          items: relatedOpportunities.filter((item) => item.ticker !== ticker)
        }
      ]
    };
  }

  return {
    thesis: opportunityMapThesis[sectorTag],
    groups
  };
}

function buildCatalysts(
  keyEvents: Array<{ title: string; reason: string }>
): InsightCatalyst[] {
  return keyEvents.slice(0, 3).map((event, index) => ({
    title: event.title,
    reason: event.reason,
    horizon: index === 0 ? "today" : index === 1 ? "this-week" : "next"
  }));
}

function buildTickerScenarios(
  ticker: string,
  analysis: TickerAnalysis,
  strategy: string,
  risks: string[]
): ThesisScenario[] {
  return [
    {
      label: "bull",
      title: `${ticker} 강세 시나리오`,
      description: `${strategy} 이 유지되고 ${analysis.patternAnalysis[0]?.name ?? "상방 구조"}가 살아 있으면 눌림 매수 전략이 유효합니다.`
    },
    {
      label: "base",
      title: `${ticker} 기본 시나리오`,
      description: `${analysis.recommendation} 핵심은 추격보다 조건 확인 뒤 대응하는 것입니다.`
    },
    {
      label: "bear",
      title: `${ticker} 리스크 시나리오`,
      description: risks[0] ?? "핵심 촉매가 깨지면 관망으로 전환하고, 후행 확산주는 함께 약해질 수 있습니다."
    }
  ];
}

function normalizeMarketHint(value?: string): ResearchTickerInputMarket {
  if (value === "KR" || value === "KRX") {
    return "KRX";
  }

  if (value === "KOSDAQ") {
    return "KOSDAQ";
  }

  return "US";
}

function readInsightCache<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string): T | null {
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function writeInsightCache<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string, value: T) {
  cache.set(key, {
    expiresAt: Date.now() + INSIGHT_CACHE_TTL_MS,
    value
  });
}

export async function getTickerDeepDiveData(symbol: string, marketHint?: string): Promise<TickerDeepDiveData | null> {
  const normalizedTicker = normalizeResearchTicker(symbol, normalizeMarketHint(marketHint)) ?? symbol.trim().toUpperCase();
  const cacheKey = `${normalizedTicker}:${marketHint ?? "auto"}`;
  const cached = readInsightCache(tickerInsightCache, cacheKey);

  if (cached) {
    return cached;
  }

  const searchMarket = normalizedTicker.endsWith(".KS") || normalizedTicker.endsWith(".KQ") ? "KR" : marketHint === "KR" ? "KR" : marketHint === "US" ? "US" : undefined;
  const searchResults = await searchResearchTickers(normalizedTicker, searchMarket);
  const resolvedSearch =
    searchResults.find((item) => item.ticker === normalizedTicker) ??
    searchResults.find((item) => item.ticker.replace(/\.KS$|\.KQ$/u, "") === symbol.toUpperCase()) ??
    searchResults[0];
  const option = findResearchTickerOption(normalizedTicker);
  const sectorTag = resolvedSearch?.sectorTag ?? option?.sectorTag ?? "industrial-tech";
  const analysisResult = await analyzeLiveTicker(normalizedTicker, sectorTag, {
    sectors: [sectorTag],
    tickers: [normalizedTicker]
  });

  if (!analysisResult.analysis) {
    writeInsightCache(tickerInsightCache, cacheKey, null);
    return null;
  }

  const sectorWorkspaceResult = await buildLiveResearchWorkspace({
    sectors: [sectorTag],
    tickers: [normalizedTicker]
  });
  const analysis = analysisResult.analysis;
  const relatedOpportunities = buildRelatedOpportunities(sectorTag, analysis.ticker);

  const result = {
    ticker: analysis.ticker,
    company: resolvedSearch?.label ?? option?.label ?? analysis.company,
    sectorTag,
    sectorLabel: getResearchSectorLabel(sectorTag),
    analysis,
    linkedNews: analysisResult.relatedNews,
    sectorWorkspace: sectorWorkspaceResult.workspace,
    relatedOpportunities,
    opportunityMap: buildOpportunityMap(sectorTag, analysis.ticker, relatedOpportunities),
    adjacentSectors: getAdjacentSectors(sectorTag),
    themeBullets: sectorThemeMap[sectorTag] ?? [],
    catalysts: buildCatalysts(sectorWorkspaceResult.workspace.agentPipeline.market.keyEvents),
    scenarios: buildTickerScenarios(
      analysis.ticker,
      analysis,
      sectorWorkspaceResult.workspace.agentPipeline.actionPlan.strategy,
      sectorWorkspaceResult.workspace.agentPipeline.actionPlan.risks
    ),
    warnings: [...analysisResult.warnings, ...sectorWorkspaceResult.warnings]
  };

  writeInsightCache(tickerInsightCache, cacheKey, result);
  return result;
}

export async function getSectorDeepDiveData(sectorTag: ResearchSectorTag): Promise<SectorDeepDiveData | null> {
  const cached = readInsightCache(sectorInsightCache, sectorTag);

  if (cached) {
    return cached;
  }

  const sector = researchSectorOptions.find((item) => item.id === sectorTag);

  if (!sector) {
    writeInsightCache(sectorInsightCache, sectorTag, null);
    return null;
  }

  const workspaceResult = await buildLiveResearchWorkspace({
    sectors: [sectorTag]
  });

  const result = {
    sector,
    workspace: workspaceResult.workspace,
    relatedOpportunities: buildRelatedOpportunities(sectorTag, ""),
    adjacentSectors: getAdjacentSectors(sectorTag),
    catalysts: buildCatalysts(workspaceResult.workspace.agentPipeline.market.keyEvents),
    warnings: workspaceResult.warnings
  };

  writeInsightCache(sectorInsightCache, sectorTag, result);
  return result;
}

export function getFavoriteStorageTicker(ticker: string) {
  return normalizeResearchTicker(ticker, inferResearchTickerInputMarket(ticker)) ?? ticker.toUpperCase();
}
