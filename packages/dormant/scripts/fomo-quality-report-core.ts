export type QualityHookKind =
  | "news_event"
  | "axis_tension"
  | "dday"
  | "supply_streak"
  | "volume_event"
  | "mention_event"
  | "relative"
  | "position"
  | "accumulation"
  | "ta_fact"
  | "fallback";

export type QualityHookTier = "material" | "tension" | "shape" | "fallback";

export interface LatencySample {
  endpoint: string;
  ok: boolean;
  ms: number;
}

export interface EndpointLatencySummary {
  endpoint: string;
  count: number;
  ok: number;
  error: number;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
}

export interface HookSample {
  stock: string;
  kind: QualityHookKind;
  headline: string;
}

export interface HookDistributionRow {
  key: string;
  count: number;
  rate: number;
}

export interface KeywordQualityInput {
  cardCount: number;
  confidence?: string;
  stale?: boolean;
  snapshotDate?: string | null;
  sourceCount: number;
  relatedStockCount: number;
  duplicateHeadlineCount: number;
}

export interface StockQualityInput {
  liteHooks: readonly HookSample[];
  fullHooks: readonly HookSample[];
  insightCount: number;
  insufficientInsightCount: number;
}

export interface QualityFinding {
  severity: "ok" | "warn" | "critical";
  message: string;
}

export const MATERIAL_HOOKS = new Set<QualityHookKind>([
  "news_event",
  "dday",
  "supply_streak",
  "mention_event",
  "relative",
]);

export const SHAPE_HOOKS = new Set<QualityHookKind>([
  "volume_event",
  "position",
  "accumulation",
  "ta_fact",
]);

export function hookTier(kind: QualityHookKind): QualityHookTier {
  if (MATERIAL_HOOKS.has(kind)) return "material";
  if (kind === "axis_tension") return "tension";
  if (SHAPE_HOOKS.has(kind)) return "shape";
  return "fallback";
}

export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const bounded = Math.max(0, Math.min(1, p));
  const index = Math.ceil(sorted.length * bounded) - 1;
  return Math.round(sorted[Math.max(0, index)]!);
}

export function summarizeLatencies(samples: readonly LatencySample[]): EndpointLatencySummary[] {
  const endpoints = [...new Set(samples.map((sample) => sample.endpoint))].sort();
  return endpoints.map((endpoint) => {
    const rows = samples.filter((sample) => sample.endpoint === endpoint);
    const okRows = rows.filter((sample) => sample.ok);
    const latencies = okRows.map((sample) => sample.ms);
    return {
      endpoint,
      count: rows.length,
      ok: okRows.length,
      error: rows.length - okRows.length,
      p50Ms: percentile(latencies, 0.5),
      p95Ms: percentile(latencies, 0.95),
      maxMs: latencies.length > 0 ? Math.round(Math.max(...latencies)) : null,
    };
  });
}

export function distribution<T extends string>(values: readonly T[]): HookDistributionRow[] {
  const total = values.length || 1;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count, rate: count / total }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function evaluateQuality(
  keyword: KeywordQualityInput,
  stock: StockQualityInput,
  latency: readonly EndpointLatencySummary[],
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const add = (severity: QualityFinding["severity"], message: string) => findings.push({ severity, message });
  const liteTiers = stock.liteHooks.map((hook) => hookTier(hook.kind));
  const liteFallbackRate = rateOf(liteTiers, "fallback");
  const liteMaterialRate = rateOf(liteTiers, "material");
  const insightInsufficientRate =
    stock.insightCount > 0 ? stock.insufficientInsightCount / stock.insightCount : null;

  if (keyword.cardCount === 0) add("critical", "keywords 카드가 0개입니다.");
  else add("ok", `keywords 카드 ${keyword.cardCount}개를 받았습니다.`);

  if (keyword.confidence === "fallback") add("critical", "keywords confidence가 fallback입니다.");
  else if (keyword.stale) add("warn", `keywords snapshot이 stale입니다(${keyword.snapshotDate ?? "unknown"}).`);
  else add("ok", `keywords confidence=${keyword.confidence ?? "unknown"}입니다.`);

  if (keyword.sourceCount < keyword.cardCount) add("warn", "카드 중 원문 source가 없는 항목이 있습니다.");
  if (keyword.duplicateHeadlineCount > 0) add("warn", `중복 카드 코멘트 ${keyword.duplicateHeadlineCount}건이 있습니다.`);
  if (stock.liteHooks.length > 0 && liteFallbackRate >= 0.5) {
    add("warn", `카드 lite hook fallback 비율이 ${formatPercent(liteFallbackRate)}입니다.`);
  }
  if (stock.liteHooks.length > 0 && liteMaterialRate < 0.25) {
    add("warn", `카드 lite hook 재료형 비율이 ${formatPercent(liteMaterialRate)}로 낮습니다.`);
  }
  if (insightInsufficientRate !== null && insightInsufficientRate >= 0.5) {
    add("warn", `뎁스 insight insufficient 비율이 ${formatPercent(insightInsufficientRate)}입니다.`);
  }

  for (const row of latency) {
    if (row.error > 0) add("warn", `${row.endpoint} 에러 ${row.error}/${row.count}건이 있습니다.`);
    if (row.p95Ms !== null && row.p95Ms > 4500) add("warn", `${row.endpoint} p95가 ${row.p95Ms}ms입니다.`);
  }

  return findings;
}

export function formatPercent(value: number | null): string {
  if (value === null) return "N/A";
  return `${Math.round(value * 100)}%`;
}

function rateOf(values: readonly string[], target: string): number {
  if (values.length === 0) return 0;
  return values.filter((value) => value === target).length / values.length;
}
