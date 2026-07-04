import { sectorOf } from "@fomo/core";
import { getCachedDaily30Response } from "./daily-30";
import { fetchDeckContentCards, type DeckContentCard } from "./deck-content";
import { fetchKrMarketRows, type DiscoveryNarrativeCardPayload } from "./discovery-supply";
import { readUsMarketQuoteRows } from "./us-market-cache";
import { fetchDartDisclosuresByStock } from "./dart-disclosures";
import { fetchRecentSecFilings } from "./sec-edgar";
import { fetchFredSeriesHistory } from "./fred";
import { fetchStockDaily } from "./stock-front";
import { kstDate } from "./fomo";
import type { DiscoveryMarketRow } from "./market-source-types";

/**
 * 피드 집계 계층 (WO 피드 파이프라인 통합) — 모든 콘텐츠 생산자를 하나의 응답으로.
 * FeedView(모바일 피드 탭)와 PC 우측 컬럼은 이것만 읽는다(daily-30 은 종목 덱 전용).
 *
 * ⚠️ 타입 레지스트리 원칙(회귀 방지): FEED_ITEM_TYPES 에서 타입을 제거하는 것은
 * **명시 지시 없이 금지**다. "새 포맷 추가 = 기존 제거"가 이번 붕괴의 원인이었다.
 * feed-hub.test.ts 의 타입별 최소 존재 테스트가 이 원칙을 지킨다.
 */
export const FEED_ITEM_TYPES = [
  "briefing", // 데일리 브리핑(간밤 미장/오늘 국장)
  "buzz", // 떠들썩 스토리(언급 급증 사건)
  "recap", // 주간 회고(일주일 전에 샀으면)
  "narrative", // 사건→연결 종목 스토리
  "sector", // 섹터 강세·약세(KR+US)
  "index", // 시장 지수(KR+US)
  "macro", // FRED 거시(환율·금리·VIX)
  "whale", // 고래·코인 시장
  "stock-issue", // 종목 이슈 단신(공시·실적 1줄) — 신규
  "macro-issue", // 거시 이슈(환율·유가·금리 임계 변동) — 신규
] as const;
export type FeedItemType = (typeof FEED_ITEM_TYPES)[number];

/** 피드 항목 — 콘텐츠/내러티브/섹터/종목이슈 payload 중 하나. 전 타입 뎁스 도달 가능해야 한다(막다른 탭 0). */
export interface FeedSectorStockRef {
  canonical: string;
  market: string;
  country: string;
  naverCode?: string;
  symbol?: string;
  changePct?: number;
}

export interface FeedSectorCard {
  id: string;
  sector: string;
  country: "KR" | "US";
  stance: "bull-dominant" | "bear-dominant" | "balanced" | "insufficient";
  stanceNote: string;
  stocks: FeedSectorStockRef[];
}

export interface FeedStockIssue {
  id: string;
  stock: string;
  market: string;
  country: "KR" | "US";
  naverCode?: string;
  symbol?: string;
  changePct?: number;
  headline: string;
  source: string;
  url?: string;
  asOf: string;
}

export type FeedHubItem =
  | { type: "briefing" | "buzz" | "recap" | "index" | "macro" | "whale" | "macro-issue"; scope: "KR" | "US" | "GLOBAL"; content: DeckContentCard & { series?: number[] } }
  | { type: "narrative"; scope: "KR" | "US"; narrative: DiscoveryNarrativeCardPayload }
  | { type: "sector"; scope: "KR" | "US"; sector: FeedSectorCard }
  | { type: "stock-issue"; scope: "KR" | "US"; stockIssue: FeedStockIssue };

export interface FeedHubResponse {
  asOf: string;
  items: FeedHubItem[];
  /** 실측 타입 카운트 — 수용 기준 검증·모니터링용. */
  typeCounts: Record<string, number>;
  scopeCounts: { KR: number; US: number; GLOBAL: number };
  source: string;
}

function signedPct(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function contentScope(card: DeckContentCard): "KR" | "US" | "GLOBAL" {
  if (card.scope === "domestic") return "KR";
  if (card.scope === "world") return "US";
  return "GLOBAL";
}

// ── 섹터 강세·약세 (KR + US — "미장 미미" 해소축 ①) ─────────────────────────

const SECTOR_MIN_MEMBERS = 4;
const SECTOR_TOP_STOCKS = 5;
/** 섹터 집계 유니버스 — 시총 상위만(소형주 노이즈로 섹터 평균이 왜곡되지 않게). */
const SECTOR_UNIVERSE = 400;

function buildSectorCards(rows: readonly DiscoveryMarketRow[], country: "KR" | "US", asOf: string): FeedSectorCard[] {
  const bySector = new Map<string, Array<{ row: DiscoveryMarketRow; changePct: number }>>();
  for (const row of rows.slice(0, SECTOR_UNIVERSE)) {
    if (typeof row.changePct !== "number" || !Number.isFinite(row.changePct)) continue;
    const sector = row.sectorHint ?? sectorOf(row.canonical);
    if (!sector || sector === "기타 업종" || sector === "미국주식") continue;
    const arr = bySector.get(sector) ?? [];
    arr.push({ row, changePct: row.changePct });
    bySector.set(sector, arr);
  }
  const ranked = [...bySector.entries()]
    .filter(([, members]) => members.length >= SECTOR_MIN_MEMBERS)
    .map(([sector, members]) => {
      const avg = members.reduce((sum, m) => sum + m.changePct, 0) / members.length;
      return { sector, members, avg };
    })
    .sort((a, b) => Math.abs(b.avg) - Math.abs(a.avg));

  // 강세 최대 2 + 약세 최대 2, 국가당 총 3 — 다양성·수량 목표(하루 20~30) 기여.
  const bulls = ranked.filter((entry) => entry.avg > 0.8).slice(0, 2);
  const bears = ranked.filter((entry) => entry.avg < -0.8).slice(0, 2);
  const picks = [...bulls, ...bears].slice(0, 3);

  return picks.map((entry) => {
    const stance: FeedSectorCard["stance"] = entry.avg > 0.8 ? "bull-dominant" : "bear-dominant";
    const up = entry.members.filter((m) => m.changePct > 0).length;
    const stocks = [...entry.members]
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .slice(0, SECTOR_TOP_STOCKS)
      .map(({ row, changePct }) => ({
        canonical: row.canonical,
        market: row.market,
        country: row.country,
        ...(row.naverCode ? { naverCode: row.naverCode } : {}),
        ...(row.symbol ? { symbol: row.symbol } : {}),
        changePct: Number(changePct.toFixed(2)),
      }));
    return {
      id: `feed:sector:${country}:${entry.sector}:${asOf}`,
      sector: entry.sector,
      country,
      stance,
      stanceNote: `${entry.sector} ${entry.members.length}종목 평균 ${signedPct(entry.avg)} · 상승 ${up}·하락 ${entry.members.length - up} — ${entry.avg > 0 ? "오늘 온기가 몰린" : "오늘 힘이 빠진"} 자리예요.`,
      stocks,
    };
  });
}

// ── 종목 이슈 단신 (신규 ① — 공시·실적 1줄, 수집 재료 재활용) ────────────────

const KR_ISSUE_LIMIT = 3;
const US_ISSUE_LIMIT = 3;
const US_ISSUE_MOVER_MIN_PCT = 3;

async function buildKrStockIssues(rows: readonly DiscoveryMarketRow[], asOf: string): Promise<FeedStockIssue[]> {
  const disclosureMap = await fetchDartDisclosuresByStock(asOf).catch((): Record<string, { label: string; source: string; url?: string }> => ({}));
  const rowByName = new Map(rows.map((row) => [row.canonical, row]));
  return Object.entries(disclosureMap)
    .slice(0, KR_ISSUE_LIMIT)
    .map(([stock, hit]) => {
      const row = rowByName.get(stock);
      return {
        id: `feed:issue:KR:${stock}:${asOf}`,
        stock,
        market: row?.market ?? "KOSPI",
        country: "KR" as const,
        ...(row?.naverCode ? { naverCode: row.naverCode } : {}),
        ...(typeof row?.changePct === "number" ? { changePct: row.changePct } : {}),
        headline: hit.label,
        source: hit.source,
        ...(hit.url ? { url: hit.url } : {}),
        asOf,
      };
    });
}

async function buildUsStockIssues(rows: readonly DiscoveryMarketRow[], asOf: string): Promise<FeedStockIssue[]> {
  const movers = rows
    .filter((row) => typeof row.changePct === "number" && Math.abs(row.changePct) >= US_ISSUE_MOVER_MIN_PCT)
    .sort((a, b) => Math.abs(b.changePct!) - Math.abs(a.changePct!))
    .slice(0, US_ISSUE_LIMIT * 2); // 공시 없는 종목 대비 여유
  const out: FeedStockIssue[] = [];
  for (const row of movers) {
    if (out.length >= US_ISSUE_LIMIT) break;
    const filings = await fetchRecentSecFilings(row.symbol, 3).catch(() => []);
    const filing = filings[0];
    if (!filing) continue;
    out.push({
      id: `feed:issue:US:${row.symbol}:${asOf}`,
      stock: row.canonical,
      market: row.market,
      country: "US",
      symbol: row.symbol,
      ...(typeof row.changePct === "number" ? { changePct: row.changePct } : {}),
      headline: filing.label,
      source: filing.source,
      ...(filing.url ? { url: filing.url } : {}),
      asOf,
    });
  }
  return out;
}

// ── 거시 이슈 (신규 ② — 환율·유가·금리 임계 변동, FRED 실데이터) ─────────────

const MACRO_ISSUE_SERIES: Array<{ id: string; label: string; unit: string; thresholdPct: number }> = [
  { id: "DEXKOUS", label: "원/달러 환율", unit: "원", thresholdPct: 0.7 },
  { id: "DCOILWTICO", label: "WTI 유가", unit: "달러", thresholdPct: 3 },
  { id: "DGS10", label: "미 10년물 금리", unit: "%", thresholdPct: 4 },
  { id: "VIXCLS", label: "VIX 변동성", unit: "", thresholdPct: 12 },
];

async function buildMacroIssues(asOf: string): Promise<Array<DeckContentCard & { series?: number[] }>> {
  const out: Array<DeckContentCard & { series?: number[] }> = [];
  for (const spec of MACRO_ISSUE_SERIES) {
    const history = await fetchFredSeriesHistory(spec.id).catch(() => []);
    if (history.length < 20) continue;
    const last = history[history.length - 1]!;
    const prev = history[history.length - 2]!;
    if (prev.value === 0) continue;
    const changePct = ((last.value - prev.value) / Math.abs(prev.value)) * 100;
    if (Math.abs(changePct) < spec.thresholdPct) continue; // 임계 미달 — 카드 없음(억지 생성 금지)
    const values = history.map((h) => h.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const position = max > min ? ((last.value - min) / (max - min)) * 100 : 50;
    const positionText = position >= 80 ? "최근 구간의 상단" : position <= 20 ? "최근 구간의 하단" : "최근 구간의 중간";
    out.push({
      kind: "content",
      id: `content:macro-issue:${spec.id}:${asOf}`,
      contentType: "macro-issue",
      scope: "world",
      headline: `${spec.label}, 하루 만에 ${signedPct(changePct)}`,
      facts: [
        { label: spec.label, value: `${last.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}${spec.unit}` },
        { label: "하루 변동", value: signedPct(changePct) },
      ],
      note: `약 5개월 범위에서 ${positionText}이에요(${last.date} 기준, FRED 공식 데이터).`,
      source: "FRED(미 연준)",
      asOf,
      series: values.slice(-60),
    });
  }
  return out;
}

// ── 지수 추이(매크로 뎁스용) — KR 지수 일봉 시리즈 부착 ─────────────────────

async function attachIndexSeries(cards: Array<DeckContentCard & { series?: number[] }>): Promise<void> {
  const domesticIndex = cards.find((card) => card.contentType === "index" && card.scope === "domestic");
  if (!domesticIndex) return;
  const kospi = await fetchStockDaily("KOSPI", 120).catch(() => ({ closes: [] as number[] }));
  if (kospi.closes.length >= 10) domesticIndex.series = kospi.closes.slice(-60);
}

// ── 인터리브 — 같은 타입 연속 3개 금지, 상단은 오늘의 중요도 ──────────────────

const TYPE_PRIORITY: Record<FeedItemType, number> = {
  briefing: 0,
  buzz: 1,
  "macro-issue": 2,
  recap: 3,
  narrative: 4,
  sector: 5,
  index: 6,
  "stock-issue": 7,
  macro: 8,
  whale: 9,
};

export function interleaveFeedItems(items: readonly FeedHubItem[]): FeedHubItem[] {
  const sorted = [...items].sort((a, b) => TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type]);
  const out: FeedHubItem[] = [];
  const queue = [...sorted];
  while (queue.length > 0) {
    const lastTwo = out.slice(-2);
    const blocked = lastTwo.length === 2 && lastTwo[0]!.type === lastTwo[1]!.type ? lastTwo[0]!.type : undefined;
    const index = blocked ? queue.findIndex((item) => item.type !== blocked) : 0;
    if (index === -1) {
      out.push(...queue); // 남은 게 전부 같은 타입이면 그대로(억지 삭제 금지)
      break;
    }
    out.push(queue.splice(index, 1)[0]!);
  }
  return out;
}

// ── 집계 ────────────────────────────────────────────────────────────────────

export async function buildFeedHubResponse(): Promise<FeedHubResponse> {
  const asOf = kstDate();
  const [daily30, deckContent, krRows, usRows] = await Promise.all([
    getCachedDaily30Response().catch(() => null),
    fetchDeckContentCards().catch(() => [] as DeckContentCard[]),
    fetchKrMarketRows().catch((): DiscoveryMarketRow[] => []),
    readUsMarketQuoteRows().catch((): DiscoveryMarketRow[] => []),
  ]);
  const [krIssues, usIssues, macroIssues] = await Promise.all([
    buildKrStockIssues(krRows, asOf).catch((): FeedStockIssue[] => []),
    buildUsStockIssues(usRows, asOf).catch((): FeedStockIssue[] => []),
    buildMacroIssues(asOf).catch((): Array<DeckContentCard & { series?: number[] }> => []),
  ]);

  const items: FeedHubItem[] = [];
  const seen = new Set<string>();
  const push = (item: FeedHubItem, id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    items.push(item);
  };

  // 1) daily-30 이 실어온 콘텐츠·내러티브(브리핑·버즈·회고 포함) — 생산된 것은 전부 표면으로.
  for (const card of daily30?.cards ?? []) {
    if (!("kind" in card)) continue;
    if (card.kind === "content") {
      const type = (card.contentType === "index" ? "index" : card.contentType) as FeedItemType;
      if (!FEED_ITEM_TYPES.includes(type)) continue;
      push({ type: type as "briefing", scope: contentScope(card), content: card }, card.id);
    } else if (card.kind === "narrative") {
      const narrative = card as DiscoveryNarrativeCardPayload;
      push({ type: "narrative", scope: narrative.scope, narrative }, narrative.id);
    }
  }
  // 2) 레거시 콘텐츠 엔진(지수·거시·고래) — daily-30 expand 에서 잘린 것 포함 전부.
  const contentWithSeries = deckContent as Array<DeckContentCard & { series?: number[] }>;
  await attachIndexSeries(contentWithSeries).catch(() => {});
  for (const card of contentWithSeries) {
    const type = (card.contentType === "index" ? "index" : card.contentType) as FeedItemType;
    if (!FEED_ITEM_TYPES.includes(type)) continue;
    push({ type: type as "index", scope: contentScope(card), content: card }, card.id);
  }
  // 3) 섹터 강세·약세 (KR+US).
  for (const sector of [...buildSectorCards(krRows, "KR", asOf), ...buildSectorCards(usRows, "US", asOf)]) {
    push({ type: "sector", scope: sector.country, sector }, sector.id);
  }
  // 4) 종목 이슈 단신 (KR DART + US SEC).
  for (const issue of [...krIssues, ...usIssues]) {
    push({ type: "stock-issue", scope: issue.country, stockIssue: issue }, issue.id);
  }
  // 5) 거시 이슈 (임계 변동일만).
  for (const card of macroIssues) {
    push({ type: "macro-issue", scope: "US", content: card }, card.id);
  }

  const ordered = interleaveFeedItems(items);
  const typeCounts: Record<string, number> = {};
  for (const type of FEED_ITEM_TYPES) typeCounts[type] = 0;
  const scopeCounts = { KR: 0, US: 0, GLOBAL: 0 };
  for (const item of ordered) {
    typeCounts[item.type] = (typeCounts[item.type] ?? 0) + 1;
    scopeCounts[item.scope] += 1;
  }
  if (scopeCounts.US < 5) console.warn("[feed-hub] 미장 콘텐츠 목표 미달", scopeCounts);

  return {
    asOf,
    items: ordered,
    typeCounts,
    scopeCounts,
    source: "브리핑·버즈·회고·내러티브·섹터·지수·거시·고래·종목이슈·거시이슈 통합(feed-hub)",
  };
}
