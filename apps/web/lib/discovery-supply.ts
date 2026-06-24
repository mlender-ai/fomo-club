import {
  STOCK_VOCAB,
  applyAxisRarity,
  buildAxisSignals,
  computeFomoScore,
  discoveryWhy,
  hasPublicMaterialEvent,
  rankDiscoveryCandidates,
  resolveStock,
  sectorOf,
  selectMultiAxisHook,
  type AxisSignal,
  type CardFrontSignals,
  type DiscoveryCandidate,
  type DiscoveryEvent,
  type DiscoveryMarket,
  type FomoScoreResult,
  type MultiAxisHookSelection,
  type SectorStock,
  type StockCountry,
} from "@fomo/core";
import { fetchStockDaily } from "./stock-front";
import { computeStockAttentionSignals, type StockAttentionSignal } from "./stock-signal-coverage";

const UA = { "User-Agent": "Mozilla/5.0", Accept: "application/json,text/plain,*/*" };
const MARKETS: DiscoveryMarket[] = ["KOSPI", "KOSDAQ"];
const PAGE_SIZE = 100;
const PAGES_PER_MARKET = 5;
const SPARKLINE_CONCURRENCY = 8;

export interface DiscoveryFrontSeed {
  signals: CardFrontSignals;
  fomo: FomoScoreResult;
  sparkline: number[];
  priceText?: string;
  changeText?: string;
  changeDir?: "up" | "down" | "flat";
  axisSignals?: AxisSignal[];
  axisHook?: MultiAxisHookSelection;
}

export interface DiscoveryStockPayload extends Omit<SectorStock, "sector"> {
  sector: string;
  whyShown?: string;
  reason?: string;
}

export interface DiscoveryResponse {
  asOf: string;
  stocks: DiscoveryStockPayload[];
  fronts: Record<string, DiscoveryFrontSeed>;
  confidence: "L" | "M" | "H";
  source: string;
}

interface NaverMarketRow {
  canonical: string;
  naverCode: string;
  market: DiscoveryMarket;
  priceText?: string;
  changeText?: string;
  changeDir?: "up" | "down" | "flat";
  changePct?: number;
  tradingValue?: number;
}

interface RawNaverStock {
  itemCode?: string;
  stockName?: string;
  itemName?: string;
  closePrice?: string;
  compareToPreviousClosePrice?: string;
  fluctuationsRatio?: string;
  compareToPreviousPrice?: { code?: string; text?: string; name?: string };
  accumulatedTradingValue?: string;
  accumulatedTradingVolume?: string;
}

function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function numberFromText(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value.replace(/,/g, "").replace(/%/g, "").trim());
  return Number.isFinite(n) ? n : undefined;
}

function changeDirFrom(row: RawNaverStock, pct: number | undefined): "up" | "down" | "flat" {
  const raw = `${row.compareToPreviousPrice?.code ?? ""} ${row.compareToPreviousPrice?.text ?? ""} ${row.compareToPreviousPrice?.name ?? ""}`;
  if (/하락|DOWN|5/.test(raw) || (typeof pct === "number" && pct < 0)) return "down";
  if (/상승|UP|2/.test(raw) || (typeof pct === "number" && pct > 0)) return "up";
  return "flat";
}

function signedChangeText(row: RawNaverStock, dir: "up" | "down" | "flat", pct: number | undefined): string | undefined {
  const change = row.compareToPreviousClosePrice?.trim();
  if (!change && typeof pct !== "number") return undefined;
  const pctText = typeof pct === "number" ? `${pct.toFixed(2)}%` : undefined;
  const prefix = dir === "down" ? "-" : "";
  return change && pctText ? `${prefix}${change} (${pctText})` : pctText;
}

function parseMarketRow(row: RawNaverStock, market: DiscoveryMarket): NaverMarketRow | null {
  const canonical = (row.stockName ?? row.itemName ?? "").trim();
  const naverCode = row.itemCode?.trim();
  if (!canonical || !naverCode) return null;
  const rawPct = numberFromText(row.fluctuationsRatio);
  const dir = changeDirFrom(row, rawPct);
  const changePct = typeof rawPct === "number" ? (dir === "down" ? -Math.abs(rawPct) : Math.abs(rawPct)) : undefined;
  const changeText = signedChangeText(row, dir, changePct);
  const tradingValue = numberFromText(row.accumulatedTradingValue);
  return {
    canonical,
    naverCode,
    market,
    ...(row.closePrice ? { priceText: `${row.closePrice.replace(/원$/, "")}원` } : {}),
    ...(changeText ? { changeText } : {}),
    changeDir: dir,
    ...(typeof changePct === "number" ? { changePct } : {}),
    ...(tradingValue ? { tradingValue } : {}),
  };
}

async function fetchMarketPage(market: DiscoveryMarket, page: number): Promise<NaverMarketRow[]> {
  const url = `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=${PAGE_SIZE}`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`naver market ${market} ${page} ${res.status}`);
  const data = (await res.json()) as { stocks?: RawNaverStock[] };
  return (data.stocks ?? []).map((row) => parseMarketRow(row, market)).filter((row): row is NaverMarketRow => row !== null);
}

async function fetchMarketRows(): Promise<NaverMarketRow[]> {
  const settled = await Promise.allSettled(
    MARKETS.flatMap((market) => Array.from({ length: PAGES_PER_MARKET }, (_, i) => fetchMarketPage(market, i + 1)))
  );
  const rows = settled.flatMap((row) => (row.status === "fulfilled" ? row.value : []));
  const byCode = new Map<string, NaverMarketRow>();
  for (const row of rows) if (!byCode.has(row.naverCode)) byCode.set(row.naverCode, row);
  return [...byCode.values()];
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        out[index] = { status: "fulfilled", value: await fn(items[index]!) };
      } catch (reason) {
        out[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

function eventFromPrice(row: NaverMarketRow, asOf: string): DiscoveryEvent | null {
  if (typeof row.changePct !== "number" || Math.abs(row.changePct) < 5) return null;
  return {
    kind: "price_move",
    firstSeen: true,
    strength: Math.min(1, Math.abs(row.changePct) / 15),
    source: "네이버 시세",
    asOf,
    confidence: "H",
    label: `오늘 가격이 ${row.changePct > 0 ? "+" : ""}${row.changePct.toFixed(2)}% 움직였어요.`,
  };
}

function eventFromNews(attention: StockAttentionSignal | undefined, asOf: string): DiscoveryEvent | null {
  if (!attention || attention.mentionCount <= 0) return null;
  return {
    kind: "news_mention",
    firstSeen: true,
    strength: Math.min(1, Math.max(0.32, attention.mentionScore / 100)),
    source: attention.newsEventSource ?? "뉴스",
    asOf,
    confidence: attention.newsEventLabel ? "H" : "M",
    ...(attention.newsEventLabel ? { label: attention.newsEventLabel } : {}),
  };
}

function stockPayload(row: NaverMarketRow, candidate: DiscoveryCandidate): DiscoveryStockPayload {
  const def = resolveStock(candidate.ticker);
  const sector = def ? sectorOf(def.canonical) : undefined;
  const why = discoveryWhy(candidate);
  const hasMaterial = hasPublicMaterialEvent(candidate);
  return {
    canonical: candidate.ticker,
    market: row.market,
    country: def?.country ?? "KR",
    naverCode: row.naverCode,
    marquee: def?.marquee === true,
    sector: sector ?? candidate.sector ?? row.market,
    whyShown: hasMaterial
      ? why
      : "큰 가격 움직임은 보였지만, 연결된 공개 재료는 아직 확인되지 않았어요.",
    ...(hasMaterial ? { reason: why } : {}),
  };
}

function frontSeed(row: NaverMarketRow, candidate: DiscoveryCandidate, attention: StockAttentionSignal | undefined, sparkline: number[]): DiscoveryFrontSeed {
  const signals: CardFrontSignals = {
    ...(typeof row.changePct === "number" ? { changePct: row.changePct } : {}),
    ...(attention ? { mentionCount: attention.mentionCount, mentionScore: attention.mentionScore } : {}),
    ...(attention?.newsEventLabel ? { newsEventLabel: attention.newsEventLabel } : {}),
    ...(attention?.newsEventSource ? { newsEventSource: attention.newsEventSource } : {}),
    asOf: candidate.asOf,
  };
  const fomo = computeFomoScore({
    ...(typeof signals.changePct === "number" ? { changePct: signals.changePct } : {}),
    ...(typeof signals.mentionScore === "number" ? { mentionScore: signals.mentionScore } : {}),
  });
  const axisSignals = buildAxisSignals({ signals });
  const axisHook = selectMultiAxisHook(axisSignals);
  return {
    signals,
    fomo,
    sparkline,
    ...(row.priceText ? { priceText: row.priceText } : {}),
    ...(row.changeText ? { changeText: row.changeText } : {}),
    ...(row.changeDir ? { changeDir: row.changeDir } : {}),
    axisSignals,
    axisHook,
  };
}

export async function buildDiscoveryResponse(): Promise<DiscoveryResponse> {
  const asOf = todayKst();
  const [rows, attentionMap] = await Promise.all([
    fetchMarketRows(),
    computeStockAttentionSignals().catch((): Record<string, StockAttentionSignal> => ({})),
  ]);
  const vocabByCode = new Map(STOCK_VOCAB.filter((s) => s.naverCode).map((s) => [s.naverCode!, s]));
  const byTicker = new Map<string, { row: NaverMarketRow; events: DiscoveryEvent[] }>();

  for (const row of rows) {
    const def = vocabByCode.get(row.naverCode);
    const ticker = def?.canonical ?? row.canonical;
    const events = [eventFromPrice(row, asOf)].filter((event): event is DiscoveryEvent => event !== null);
    if (events.length > 0) byTicker.set(ticker, { row: { ...row, canonical: ticker }, events });
  }

  for (const [ticker, attention] of Object.entries(attentionMap)) {
    const def = resolveStock(ticker);
    if (!def?.naverCode) continue;
    const row =
      rows.find((r) => r.naverCode === def.naverCode) ??
      ({ canonical: def.canonical, naverCode: def.naverCode, market: def.market as DiscoveryMarket } satisfies NaverMarketRow);
    const event = eventFromNews(attention, asOf);
    if (!event) continue;
    const current = byTicker.get(def.canonical);
    byTicker.set(def.canonical, { row: { ...row, canonical: def.canonical }, events: [...(current?.events ?? []), event] });
  }

  const candidates = [...byTicker.entries()].map(([ticker, { row, events }]): DiscoveryCandidate => {
    const def = resolveStock(ticker);
    const sector = sectorOf(ticker);
    const reason = events.find((event) => event.label)?.label;
    return {
      ticker,
      market: row.market,
      country: (def?.country ?? "KR") as StockCountry,
      naverCode: row.naverCode,
      ...(sector ? { sector } : {}),
      events,
      asOf,
      ...(reason ? { reason } : {}),
      marquee: def?.marquee === true,
    };
  });
  const ranked = rankDiscoveryCandidates(candidates, { maxCandidates: 100 });
  const rowsByTicker = new Map([...byTicker.entries()].map(([ticker, value]) => [ticker, value.row]));
  const fronts: Record<string, DiscoveryFrontSeed> = {};
  const stocks: DiscoveryStockPayload[] = [];

  const sparklineRows = await mapLimit(
    ranked.slice(0, 100),
    SPARKLINE_CONCURRENCY,
    async (candidate) => ({
      ticker: candidate.ticker,
      sparkline: candidate.naverCode ? (await fetchStockDaily(candidate.naverCode, 110)).closes.slice(-42) : [],
    })
  );
  const sparklineByTicker = new Map(
    sparklineRows
      .filter((row): row is PromiseFulfilledResult<{ ticker: string; sparkline: number[] }> => row.status === "fulfilled")
      .map((row) => [row.value.ticker, row.value.sparkline] as const)
  );

  for (const candidate of ranked) {
    const row = rowsByTicker.get(candidate.ticker);
    if (!row) continue;
    const attention = attentionMap[candidate.ticker];
    stocks.push(stockPayload(row, candidate));
    fronts[candidate.ticker] = frontSeed(row, candidate, attention, sparklineByTicker.get(candidate.ticker) ?? []);
  }
  const raritySets = applyAxisRarity(stocks.map((stock) => fronts[stock.canonical]?.axisSignals ?? []));
  stocks.forEach((stock, index) => {
    const current = fronts[stock.canonical];
    const axisSignals = raritySets[index];
    if (!current || !axisSignals) return;
    fronts[stock.canonical] = {
      ...current,
      axisSignals,
      axisHook: selectMultiAxisHook(axisSignals),
    };
  });

  return {
    asOf,
    stocks,
    fronts,
    confidence: stocks.length >= 30 ? "H" : stocks.length >= 10 ? "M" : "L",
    source: "네이버 시세·뉴스 언급",
  };
}
