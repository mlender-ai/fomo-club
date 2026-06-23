/**
 * FOMO 품질 리포트 — 프로덕션 API를 실제로 샘플링해 카드/뎁스 품질과 응답 시간을 숫자로 남긴다.
 *
 * 비용 방어:
 * - keywords 1회
 * - stock-front lite: 기본 최대 8종목
 * - stock-front full + stock-insight: 기본 최대 3종목
 * - LLM이 붙을 수 있는 stock-insight는 daily monitor에서도 작은 샘플만 호출한다.
 */
import { selectFomoHook, type FomoHookSignalKind } from "@fomo/core";
import {
  distribution,
  evaluateQuality,
  formatPercent,
  hookTier,
  summarizeLatencies,
  type HookSample,
  type LatencySample,
  type QualityHookKind,
} from "./fomo-quality-report-core";

const DEFAULT_API_BASE = "https://fomo-club-backend.vercel.app";
const DEFAULT_WEB_URL = "https://fomo-web-mlender-ais-projects.vercel.app";
const API_BASE = (process.env.FOMO_API_BASE ?? DEFAULT_API_BASE).replace(/\/$/, "");
const WEB_URL = (process.env.FOMO_WEB_URL ?? DEFAULT_WEB_URL).replace(/\/$/, "");
const STOCK_LIMIT = positiveInt(process.env.FOMO_QUALITY_STOCK_LIMIT, 8);
const DEPTH_LIMIT = positiveInt(process.env.FOMO_QUALITY_DEPTH_LIMIT, 3);
const TIMEOUT_MS = positiveInt(process.env.FOMO_QUALITY_TIMEOUT_MS, 8000);
const OUT_JSON = process.env.FOMO_QUALITY_JSON_OUT ?? "fomo-quality-report.json";
const OUT_MD = process.env.FOMO_QUALITY_MD_OUT ?? "fomo-quality-report.md";

interface KeywordCardLike {
  keyword?: string;
  comment?: string;
  related?: string[];
  sources?: unknown[];
  surpriseStock?: { name?: string };
}

interface KeywordsPayloadLike {
  date?: string;
  confidence?: string;
  stale?: boolean;
  snapshotDate?: string | null;
  cards?: KeywordCardLike[];
}

interface TimedResult<T> {
  endpoint: string;
  ok: boolean;
  ms: number;
  status: number | null;
  data?: T;
  error?: string;
}

interface StockFrontLike {
  signals?: Record<string, unknown>;
  fomo?: Record<string, unknown>;
  taFact?: unknown;
  sparkline?: unknown[];
  priceText?: string;
  changeText?: string;
}

interface InsightLike {
  confidence?: string;
  whyHot?: string;
  bull?: unknown[];
  bear?: unknown[];
  sources?: unknown[];
  reason?: string;
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function kstDate(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function timedJson<T>(endpoint: string, url: string): Promise<TimedResult<T>> {
  const started = performance.now();
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const ms = Math.round(performance.now() - started);
    if (!res.ok) {
      return { endpoint, ok: false, ms, status: res.status, error: `HTTP ${res.status}` };
    }
    return { endpoint, ok: true, ms, status: res.status, data: (await res.json()) as T };
  } catch (err) {
    return { endpoint, ok: false, ms: Math.round(performance.now() - started), status: null, error: (err as Error).message };
  }
}

async function timedHead(endpoint: string, url: string): Promise<TimedResult<null>> {
  const started = performance.now();
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const ms = Math.round(performance.now() - started);
    return { endpoint, ok: res.ok, ms, status: res.status, ...(res.ok ? { data: null } : { error: `HTTP ${res.status}` }) };
  } catch (err) {
    return { endpoint, ok: false, ms: Math.round(performance.now() - started), status: null, error: (err as Error).message };
  }
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = items[index++]!;
      out.push(await fn(current));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

function stocksFromKeywords(payload: KeywordsPayloadLike | undefined): string[] {
  const seen = new Set<string>();
  for (const card of payload?.cards ?? []) {
    for (const stock of card.related ?? []) {
      const cleaned = stock.trim();
      if (cleaned) seen.add(cleaned);
    }
    const surprise = card.surpriseStock?.name?.trim();
    if (surprise) seen.add(surprise);
  }
  if (seen.size === 0) {
    ["삼성전자", "SK하이닉스", "삼성SDI", "두산로보틱스"].forEach((stock) => seen.add(stock));
  }
  return [...seen].slice(0, STOCK_LIMIT);
}

function hookFromFront(stock: string, data: StockFrontLike | undefined): HookSample | null {
  if (!data?.fomo) return null;
  try {
    const hook = selectFomoHook({
      fomo: data.fomo as Parameters<typeof selectFomoHook>[0]["fomo"],
      signals: (data.signals ?? {}) as Parameters<typeof selectFomoHook>[0]["signals"],
      taFact: data.taFact as Parameters<typeof selectFomoHook>[0]["taFact"],
    });
    return { stock, kind: hook.kind as FomoHookSignalKind as QualityHookKind, headline: hook.headline };
  } catch {
    return null;
  }
}

function markdownTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function duplicateCount(values: readonly string[]): number {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
}

async function main() {
  const date = kstDate();
  const samples: LatencySample[] = [];
  const rawResults: TimedResult<unknown>[] = [];

  const home = await timedHead("web_home", `${WEB_URL}/`);
  samples.push(home);
  rawResults.push(home);

  const keywords = await timedJson<KeywordsPayloadLike>("keywords", `${API_BASE}/api/fomo/keywords`);
  samples.push(keywords);
  rawResults.push(keywords as TimedResult<unknown>);

  const stocks = stocksFromKeywords(keywords.data);
  const liteResults = await mapLimit(stocks, 3, (stock) =>
    timedJson<StockFrontLike>("stock_front_lite", `${API_BASE}/api/fomo/stock-front?stock=${encodeURIComponent(stock)}&lite=1`).then((res) => ({
      stock,
      res,
    }))
  );
  const depthStocks = stocks.slice(0, DEPTH_LIMIT);
  const fullResults = await mapLimit(depthStocks, 2, (stock) =>
    timedJson<StockFrontLike>("stock_front_full", `${API_BASE}/api/fomo/stock-front?stock=${encodeURIComponent(stock)}`).then((res) => ({
      stock,
      res,
    }))
  );
  const insightResults = await mapLimit(depthStocks, 1, (stock) =>
    timedJson<InsightLike>("stock_insight", `${API_BASE}/api/fomo/stock-insight?stock=${encodeURIComponent(stock)}`).then((res) => ({
      stock,
      res,
    }))
  );

  for (const row of [...liteResults, ...fullResults, ...insightResults]) {
    samples.push(row.res);
    rawResults.push(row.res as TimedResult<unknown>);
  }

  const cards = keywords.data?.cards ?? [];
  const comments = cards.map((card) => card.comment?.trim()).filter((comment): comment is string => !!comment);
  const keywordInput = {
    cardCount: cards.length,
    confidence: keywords.data?.confidence,
    stale: keywords.data?.stale,
    snapshotDate: keywords.data?.snapshotDate,
    sourceCount: cards.filter((card) => (card.sources ?? []).length > 0).length,
    relatedStockCount: stocks.length,
    duplicateHeadlineCount: duplicateCount(comments),
  };
  const liteHooks = liteResults
    .map(({ stock, res }) => hookFromFront(stock, res.data))
    .filter((hook): hook is HookSample => hook !== null);
  const fullHooks = fullResults
    .map(({ stock, res }) => hookFromFront(stock, res.data))
    .filter((hook): hook is HookSample => hook !== null);
  const insights = insightResults.map(({ res }) => res.data).filter((data): data is InsightLike => !!data);
  const stockInput = {
    liteHooks,
    fullHooks,
    insightCount: insights.length,
    insufficientInsightCount: insights.filter((insight) => insight.confidence === "insufficient").length,
  };
  const latency = summarizeLatencies(samples);
  const findings = evaluateQuality(keywordInput, stockInput, latency);
  const liteTierDist = distribution(liteHooks.map((hook) => hookTier(hook.kind)));
  const liteKindDist = distribution(liteHooks.map((hook) => hook.kind));
  const fullTierDist = distribution(fullHooks.map((hook) => hookTier(hook.kind)));

  const json = {
    date,
    apiBase: API_BASE,
    webUrl: WEB_URL,
    stockSample: stocks,
    keyword: keywordInput,
    stock: stockInput,
    latency,
    hookDistribution: {
      liteTier: liteTierDist,
      liteKind: liteKindDist,
      fullTier: fullTierDist,
    },
    findings,
    rawErrors: rawResults
      .filter((row) => !row.ok)
      .map((row) => ({ endpoint: row.endpoint, status: row.status, ms: row.ms, error: row.error })),
  };

  const md = [
    `# FOMO Quality Report — ${date}`,
    "",
    `API: ${API_BASE}`,
    `Web: ${WEB_URL}`,
    "",
    "## Summary",
    markdownTable(
      ["Metric", "Value"],
      [
        ["Keyword cards", String(keywordInput.cardCount)],
        ["Keyword confidence", keywordInput.confidence ?? "unknown"],
        ["Keyword stale", keywordInput.stale ? `yes (${keywordInput.snapshotDate ?? "unknown"})` : "no"],
        ["Cards with sources", `${keywordInput.sourceCount}/${keywordInput.cardCount}`],
        ["Sample stocks", stocks.join(", ") || "none"],
        ["Lite material hooks", formatPercent(liteTierDist.find((row) => row.key === "material")?.rate ?? 0)],
        ["Lite fallback hooks", formatPercent(liteTierDist.find((row) => row.key === "fallback")?.rate ?? 0)],
        [
          "Depth insufficient",
          stockInput.insightCount > 0 ? `${stockInput.insufficientInsightCount}/${stockInput.insightCount}` : "N/A",
        ],
      ]
    ),
    "",
    "## Latency",
    markdownTable(
      ["Endpoint", "OK", "Error", "p50", "p95", "max"],
      latency.map((row) => [
        row.endpoint,
        `${row.ok}/${row.count}`,
        String(row.error),
        row.p50Ms === null ? "N/A" : `${row.p50Ms}ms`,
        row.p95Ms === null ? "N/A" : `${row.p95Ms}ms`,
        row.maxMs === null ? "N/A" : `${row.maxMs}ms`,
      ])
    ),
    "",
    "## Card Hook Distribution",
    markdownTable(
      ["Tier", "Count", "Rate"],
      liteTierDist.map((row) => [row.key, String(row.count), formatPercent(row.rate)])
    ),
    "",
    markdownTable(
      ["Kind", "Count", "Rate"],
      liteKindDist.map((row) => [row.key, String(row.count), formatPercent(row.rate)])
    ),
    "",
    "## Depth Hook Distribution",
    markdownTable(
      ["Tier", "Count", "Rate"],
      fullTierDist.map((row) => [row.key, String(row.count), formatPercent(row.rate)])
    ),
    "",
    "## Findings",
    ...findings.map((finding) => `- ${finding.severity.toUpperCase()}: ${finding.message}`),
    "",
  ].join("\n");

  await import("node:fs/promises").then((fs) =>
    Promise.all([fs.writeFile(OUT_JSON, `${JSON.stringify(json, null, 2)}\n`), fs.writeFile(OUT_MD, md)])
  );
  process.stdout.write(md);
}

main().catch((err) => {
  console.error("[fomo-quality-report] failed", err);
  process.exitCode = 1;
});
