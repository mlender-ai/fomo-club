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
  feedBull?: unknown;
  feedBear?: unknown;
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

function rate(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

// WO-LASTMILE 공통: 크론 자가검증에 "밸류축 확보율 · 트랙레코드 n" 추가 → 0/미달이면 액션 경고.
// "머지≠배포/재생성" 재발 방지: 코드가 살아있어도 덱 재생성·원장 누적이 멈추면 여기서 잡힌다.
const VALUATION_WARN_RATE = 0.8; // 주식 밸류축 확보율 목표(북극성)
const VALUATION_CRITICAL_RATE = 0.4; // 이 밑이면 전종목 결손급 = critical

interface Daily30Like {
  fronts?: Record<string, { score?: { axes?: { key?: string }[] } }>;
  cards?: { kind?: string; canonical?: string; country?: string; market?: string }[];
}
interface TrackRecordLike {
  windows?: { days?: number; overall?: { n?: number; winRate?: number | null } }[];
}

interface SelfCheck {
  valuation: { stocks: number; withAxis: number; rate: number; us: number; usWithAxis: number };
  trackRecord: { maxN: number; best: { days: number; n: number; winRate: number | null } | null };
}

function evaluateSelfCheck(
  daily30: Daily30Like | undefined,
  track: TrackRecordLike | undefined
): { selfCheck: SelfCheck; findings: { severity: "ok" | "warn" | "critical"; message: string }[] } {
  const findings: { severity: "ok" | "warn" | "critical"; message: string }[] = [];
  const fronts = daily30?.fronts ?? {};
  const cardByName = new Map((daily30?.cards ?? []).filter((c) => c.kind === "stock").map((c) => [c.canonical ?? "", c]));
  let stocks = 0;
  let withAxis = 0;
  let us = 0;
  let usWithAxis = 0;
  for (const [name, front] of Object.entries(fronts)) {
    const card = cardByName.get(name);
    if (!card || card.market === "COIN") continue; // 주식만 — 코인은 밸류축 대상 아님
    stocks += 1;
    const hasVal = (front.score?.axes ?? []).some((axis) => axis.key === "valuation");
    if (hasVal) withAxis += 1;
    if (card.country === "US") {
      us += 1;
      if (hasVal) usWithAxis += 1;
    }
  }
  const valRate = rate(withAxis, stocks);
  if (stocks > 0) {
    if (valRate < VALUATION_CRITICAL_RATE) {
      findings.push({
        severity: "critical",
        message: `덱 밸류축 확보율 ${Math.round(valRate * 100)}% (${withAxis}/${stocks}, US ${usWithAxis}/${us}) — 전종목 결손급. 덱 재생성(committee) 또는 밸류 주입 경로 점검 필요.`,
      });
    } else if (valRate < VALUATION_WARN_RATE) {
      findings.push({
        severity: "warn",
        message: `덱 밸류축 확보율 ${Math.round(valRate * 100)}% (${withAxis}/${stocks}, US ${usWithAxis}/${us}) — 목표 ${Math.round(VALUATION_WARN_RATE * 100)}% 미달.`,
      });
    }
  }

  const windows = (track?.windows ?? []).map((w) => ({
    days: Number(w.days ?? 0),
    n: Number(w.overall?.n ?? 0),
    winRate: w.overall?.winRate ?? null,
  }));
  const maxN = windows.length > 0 ? Math.max(...windows.map((w) => w.n)) : 0;
  const best = windows.length > 0 ? windows.reduce((a, b) => (b.n > a.n ? b : a)) : null;
  if (maxN === 0) {
    findings.push({
      severity: "warn",
      message: "트랙레코드 outcome n=0 — 원장 outcome 산출(ledger-outcomes 크론)이 멈췄거나 아직 horizon 미도래. 크론 실행 여부 확인 필요.",
    });
  }

  return {
    selfCheck: {
      valuation: { stocks, withAxis, rate: valRate, us, usWithAxis },
      trackRecord: { maxN, best },
    },
    findings,
  };
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
  // WO-LASTMILE 공통 자가검증 — 덱 밸류축 확보율 + 트랙레코드 n (GET 2회, LLM 없음).
  const daily30 = await timedJson<Daily30Like>("daily_30", `${API_BASE}/api/fomo/daily-30`);
  const trackRecord = await timedJson<TrackRecordLike>("track_record", `${API_BASE}/api/fomo/track-record`);
  samples.push(daily30, trackRecord);
  rawResults.push(daily30 as TimedResult<unknown>, trackRecord as TimedResult<unknown>);
  const { selfCheck, findings: selfCheckFindings } = evaluateSelfCheck(daily30.data, trackRecord.data);

  const latency = summarizeLatencies(samples);
  const findings = [...evaluateQuality(keywordInput, stockInput, latency), ...selfCheckFindings];
  const liteTierDist = distribution(liteHooks.map((hook) => hookTier(hook.kind)));
  const liteKindDist = distribution(liteHooks.map((hook) => hook.kind));
  const fullTierDist = distribution(fullHooks.map((hook) => hookTier(hook.kind)));
  const liteOk = liteResults.map((row) => row.res.data).filter((data): data is StockFrontLike => !!data);
  const liteCoverage = {
    sample: liteOk.length,
    mention: rate(liteOk.filter((row) => typeof row.signals?.mentionScore === "number").length, liteOk.length),
    themeRelative: rate(liteOk.filter((row) => typeof row.signals?.themeRelativeRank === "number").length, liteOk.length),
    feedBull: rate(liteOk.filter((row) => !!row.feedBull).length, liteOk.length),
    feedBear: rate(liteOk.filter((row) => !!row.feedBear).length, liteOk.length),
  };

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
    liteCoverage,
    selfCheck,
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
        ["Lite mention coverage", formatPercent(liteCoverage.mention)],
        ["Lite theme-relative coverage", formatPercent(liteCoverage.themeRelative)],
        ["Lite feed bull/bear", `${formatPercent(liteCoverage.feedBull)} / ${formatPercent(liteCoverage.feedBear)}`],
        [
          "Depth insufficient",
          stockInput.insightCount > 0 ? `${stockInput.insufficientInsightCount}/${stockInput.insightCount}` : "N/A",
        ],
        [
          "덱 밸류축 확보율",
          `${formatPercent(selfCheck.valuation.rate)} (${selfCheck.valuation.withAxis}/${selfCheck.valuation.stocks}, US ${selfCheck.valuation.usWithAxis}/${selfCheck.valuation.us})`,
        ],
        [
          "트랙레코드 n",
          selfCheck.trackRecord.best
            ? `${selfCheck.trackRecord.maxN} (${selfCheck.trackRecord.best.days}일 승률 ${selfCheck.trackRecord.best.winRate ?? "N/A"}%)`
            : "0",
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
