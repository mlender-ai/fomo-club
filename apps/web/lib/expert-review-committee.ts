import { callAI, isAiConfigured } from "@fomo/shared";
import { companyFinancialsFromBasics, computeCompanyScore, type StockBasics } from "@fomo/core";
import { buildDaily30CandidatePoolResponse, writeDaily30PicksSnapshot, type Daily30Response } from "./daily-30";
import type { DiscoveryDeckCardPayload, DiscoveryFrontSeed, DiscoveryStockPayload } from "./discovery-supply";
import {
  publishCommitteeSnapshot,
  readPublishedCommitteeSnapshot,
  writeFailedCommitteeRun,
  type CommitteeReviewAudit,
  type CommitteeRunReport,
  type PublishedCommitteeSnapshot,
} from "./expert-review-store";
import { fetchStockBasics } from "./stock-basics";
import { kstDate } from "./fomo";
import { readFeedContent, writeFeedContent } from "./feed-content-store";

const COMMITTEE_VERSION = "committee-v1";
const CANDIDATE_TARGET = 50;
const MIN_CANDIDATES = 40;
const FINAL_TARGET = 30;
// Groq free/developer 조직의 TPM을 넘지 않도록 입력을 압축하고 호출 수를 줄인다.
// 후보 50장 기준 분석가 5콜 + 5콜, 편집장 1콜로 일일 11콜이다.
const BATCH_SIZE = 10;
const BATCH_CONCURRENCY = 1;
const MAX_CALLS = 110;
const DEFAULT_COMMITTEE_MODEL = "llama-3.1-8b-instant";
const DEFAULT_CALL_INTERVAL_MS = 3_000;

type Grade = "A" | "B" | "C";
type AnalystRole = "trading" | "financial";

interface CandidateRecord {
  id: string;
  assetClass: string;
  signalScore: number;
  hypePenalty: number;
  quietScore: number;
  cardIndex: number;
  card: { kind: "stock" } & DiscoveryStockPayload;
  front: DiscoveryFrontSeed;
  basics?: StockBasics;
  input: CommitteeCandidateInput;
}

export interface CommitteeCandidateInput {
  candidateId: string;
  assetClass: string;
  stock: {
    canonical: string;
    symbol?: string;
    naverCode?: string;
    country: string;
    market?: string;
    sector: string;
  };
  material: {
    headline?: string;
    whyShown?: string;
    reason?: string;
    sourceLabel?: string;
    sourceUrl?: string;
  };
  selection: {
    signalScore: number;
    hypePenalty: number;
    quietScore: number;
  };
  trading: {
    signals: DiscoveryFrontSeed["signals"];
    verdict?: DiscoveryFrontSeed["verdict"];
    wyckoff?: DiscoveryFrontSeed["wyckoff"];
    companyChartAxis?: DiscoveryFrontSeed["companyScore"];
    candleSummary: ReturnType<typeof summarizeCandles>;
  };
  financial: {
    companySummary?: string;
    marketCap?: string;
    metrics: StockBasics["metrics"];
    financials?: StockBasics["financials"];
    valuationHistory?: StockBasics["valuationHistory"];
    scoreAxes: NonNullable<DiscoveryFrontSeed["companyScore"]>["axes"];
  };
}

interface RawAnalystReview {
  candidateId: string;
  approved: boolean;
  grade: Grade;
  paragraph: string;
  concerns: string[];
  responseMissing?: boolean;
}

interface CheckedAnalystReview extends RawAnalystReview {
  factFallback: boolean;
  invalidNumbers: string[];
}

interface EditorOutput {
  selectedIds: string[];
  rejected: Array<{ candidateId: string; reasons: string[] }>;
  compositionSummary: string;
}

interface CallState {
  callCount: number;
  model: string;
  lastCallAt: number;
  minCallIntervalMs: number;
}

export interface CommitteeAgentCaller {
  (args: { role: AnalystRole | "editor"; system: string; input: unknown; trace: string }): Promise<{ ok: boolean; content: string; model: string; status?: number; retryAfterMs?: number }>;
}

export interface CommitteeRunResult {
  ok: boolean;
  report: CommitteeRunReport;
  response?: Daily30Response;
  previousRunRetained: boolean;
}

function isStockCard(card: DiscoveryDeckCardPayload): card is { kind: "stock" } & DiscoveryStockPayload {
  return !((card as { kind?: string }).kind) || (card as { kind?: string }).kind === "stock";
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function summarizeCandles(front: DiscoveryFrontSeed) {
  const candles = (front.candles ?? []).filter((candle) => finite(candle.close) && candle.close > 0);
  const latest = candles.at(-1);
  const prior20 = candles.at(-21);
  const window = candles.slice(-20);
  const averageVolume = window.length > 0
    ? window.reduce((sum, candle) => sum + (finite(candle.volume) ? candle.volume : 0), 0) / window.length
    : undefined;
  const closes = candles.map((candle) => candle.close);
  return {
    sourceLength: candles.length,
    historyLabel: candles.length >= 240 ? "52주" : `${Math.max(1, Math.round(candles.length / 21))}개월`,
    ...(latest ? { latest } : {}),
    ...(latest && prior20 ? { return20dPct: Number((((latest.close - prior20.close) / prior20.close) * 100).toFixed(2)) } : {}),
    ...(finite(averageVolume) ? { averageVolume20d: Math.round(averageVolume) } : {}),
    ...(closes.length ? { rangeLow: Math.min(...closes), rangeHigh: Math.max(...closes) } : {}),
    maLatest: {
      ma20: front.chartSeries?.ma20.at(-1),
      ma60: front.chartSeries?.ma60.at(-1),
      ma120: front.chartSeries?.ma120.at(-1),
    },
  };
}

function numericTokens(text: string): string[] {
  const matches = text.match(/[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g) ?? [];
  return matches.flatMap((token) => {
    const value = Number(token.replace(/,/g, ""));
    return Number.isFinite(value) ? [String(value)] : [];
  });
}

function collectAllowedNumbers(value: unknown, allowed: Set<string>): void {
  if (finite(value)) {
    allowed.add(String(value));
    allowed.add(String(Math.round(value)));
    allowed.add(value.toFixed(1));
    allowed.add(value.toFixed(2));
    return;
  }
  if (typeof value === "string") {
    for (const token of numericTokens(value)) allowed.add(token);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAllowedNumbers(item, allowed);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) collectAllowedNumbers(item, allowed);
  }
}

/** 에이전트 문장에 입력 JSON에 없던 숫자가 섞이면 해당 숫자를 모두 반환한다. */
export function validateAgentNumbers(text: string, input: unknown): string[] {
  const allowed = new Set<string>();
  collectAllowedNumbers(input, allowed);
  return [...new Set(numericTokens(text).filter((token) => !allowed.has(token)))];
}

function parseJsonObjects(text: string): unknown[] {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const objects: unknown[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < cleaned.length; index += 1) {
    const character = cleaned[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (character !== "}" || depth === 0) continue;
    depth -= 1;
    if (depth !== 0 || start < 0) continue;
    try {
      objects.push(JSON.parse(cleaned.slice(start, index + 1)));
    } catch {
      // Keep scanning: a later complete object can still contain valid reviews.
    }
    start = -1;
  }
  if (objects.length === 0) throw new Error("agent output is not JSON");
  return objects;
}

function parseJsonObject(text: string): unknown {
  return parseJsonObjects(text).at(-1);
}

function isGrade(value: unknown): value is Grade {
  return value === "A" || value === "B" || value === "C";
}

function parseAnalystBatch(text: string, expectedIds: readonly string[]): RawAnalystReview[] {
  const parsed = parseJsonObjects(text) as Array<{ reviews?: unknown[]; candidateId?: unknown }>;
  const values = parsed.flatMap((value) => Array.isArray(value.reviews) ? value.reviews : value.candidateId ? [value] : []);
  const rows = values.flatMap((value) => {
    const row = value as Partial<RawAnalystReview> & { candidateId?: unknown };
    const approved = typeof row.approved === "boolean"
      ? row.approved
      : row.approved === "true"
        ? true
        : row.approved === "false"
          ? false
          : undefined;
    const grade = typeof row.grade === "string" && isGrade(row.grade.toUpperCase())
      ? row.grade.toUpperCase() as Grade
      : undefined;
    const concerns = Array.isArray(row.concerns)
      ? row.concerns.filter((item): item is string => typeof item === "string")
      : [];
    if (approved === undefined || !grade || typeof row.paragraph !== "string") return [];
    return [{
      candidateId: typeof row.candidateId === "string" ? row.candidateId : undefined,
      approved,
      grade,
      paragraph: row.paragraph,
      concerns,
    }];
  });
  const expected = new Set(expectedIds);
  const byId = new Map<string, RawAnalystReview>();
  const unassigned: Array<Omit<RawAnalystReview, "candidateId" | "responseMissing">> = [];
  for (const row of rows) {
    if (row.candidateId && expected.has(row.candidateId) && !byId.has(row.candidateId)) {
      byId.set(row.candidateId, { ...row, candidateId: row.candidateId, responseMissing: false });
    } else {
      // 일부 모델은 JSON 스키마는 지키지만 긴 candidateId를 생략하거나 변형한다.
      // 배치 순서가 유지된 응답만 남은 후보에 순서대로 붙이고, 실제 누락 행은 아래에서 hard reject한다.
      unassigned.push(row);
    }
  }
  const remainingIds = expectedIds.filter((id) => !byId.has(id));
  for (const row of unassigned) {
    const candidateId = remainingIds.shift();
    if (!candidateId) break;
    byId.set(candidateId, { ...row, candidateId, responseMissing: false });
  }
  return expectedIds.map((id) => byId.get(id) ?? {
    candidateId: id,
    approved: false,
    grade: "C",
    paragraph: "검수 응답이 누락되어 이 후보는 이번 위원회 선별에서 제외합니다.",
    concerns: ["에이전트 검수 응답 누락"],
    responseMissing: true,
  });
}

function tradingFallback(input: CommitteeCandidateInput): string {
  if (input.trading.wyckoff?.summary) return input.trading.wyckoff.summary;
  if (input.trading.verdict?.stanceText) return input.trading.verdict.stanceText;
  return "결정론 차트 엔진에서 확정할 수 있는 구간 근거가 부족해 타이밍 판단을 보류합니다.";
}

function financialFallback(input: CommitteeCandidateInput): string {
  const axes = input.financial.scoreAxes.filter((axis) => axis.key === "valuation" || axis.key === "growth" || axis.key === "profitability");
  const evidence = axes.flatMap((axis) => axis.evidence).filter(Boolean);
  if (evidence.length > 0) return evidence.join(" · ");
  return "검증 가능한 재무 시계열이 충분하지 않아 기업가치 판단을 보류합니다.";
}

export function applyAnalystFactGate(
  role: AnalystRole,
  review: RawAnalystReview,
  input: CommitteeCandidateInput
): CheckedAnalystReview {
  const invalidNumbers = validateAgentNumbers([review.paragraph, ...review.concerns].join(" "), input);
  if (invalidNumbers.length === 0) return { ...review, factFallback: false, invalidNumbers: [] };
  return {
    ...review,
    paragraph: role === "trading" ? tradingFallback(input) : financialFallback(input),
    concerns: ["입력에 없는 수치가 감지되어 에이전트 문단을 결정론 산출로 교체했습니다."],
    factFallback: true,
    invalidNumbers,
  };
}

async function defaultAgentCaller(args: Parameters<CommitteeAgentCaller>[0]) {
  const result = await callAI({
    model: process.env.COMMITTEE_AI_MODEL || DEFAULT_COMMITTEE_MODEL,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: JSON.stringify(args.input) },
    ],
    temperature: 0.1,
    maxTokens: args.role === "editor" ? 900 : 1_500,
    jsonMode: true,
    timeoutMs: 45_000,
    trace: args.trace,
    metadata: { committeeVersion: COMMITTEE_VERSION, role: args.role },
  });
  return result;
}

async function callWithRetry(
  caller: CommitteeAgentCaller,
  args: Parameters<CommitteeAgentCaller>[0],
  state: CallState
): Promise<string> {
  let lastError = "agent call failed";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (state.callCount >= MAX_CALLS) throw new Error(`committee call cap exceeded: ${MAX_CALLS}`);
    const waitMs = Math.max(0, state.lastCallAt + state.minCallIntervalMs - Date.now());
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    state.callCount += 1;
    const result = await caller(args);
    state.lastCallAt = Date.now();
    if (result.model) state.model = result.model;
    if (result.ok && result.content.trim()) return result.content;
    if (result.status === 429) {
      if (!result.retryAfterMs || result.retryAfterMs > 15_000) {
        const retryAfter = result.retryAfterMs ? `; retry after ${Math.ceil(result.retryAfterMs / 1_000)}s` : "";
        throw new Error(`${args.role} agent rate limited${retryAfter}`);
      }
      // 짧은 Retry-After만 한 번 존중하고, 긴 대기는 크론을 붙잡지 않는다.
      state.lastCallAt = Date.now() + result.retryAfterMs - state.minCallIntervalMs;
    }
    lastError = `${args.role} agent call failed${result.status ? ` HTTP ${result.status}` : ""}`;
  }
  throw new Error(lastError);
}

const TRADING_SYSTEM = `당신은 FOMO Club의 트레이딩 분석 검수자다.
입력 JSON의 signals, verdict, wyckoff, candleSummary만 근거로 구간 판정의 타당성을 검수한다.
입력에 없는 숫자를 새로 만들거나 계산하지 않는다. approved=false는 엔진 판정과 입력 데이터가 명백히 충돌할 때만 사용한다.
각 후보에 timing grade A/B/C와 서로 다른 한국어 한 문장을 45~90자로 쓴다. 예측 확정이 아니라 구간, 타이밍, 무효화 근거를 설명한다.
반드시 {"reviews":[{"candidateId":"...","approved":true,"grade":"A","paragraph":"...","concerns":[]}]} JSON만 반환한다.`;

const FINANCIAL_SYSTEM = `당신은 FOMO Club의 재무 분석 검수자다.
입력 JSON의 financial, material, companyScore 근거만 사용해 수익성, 성장, 밸류와 핵심 리스크를 검수한다.
입력에 없는 숫자를 새로 만들거나 계산하지 않는다. 재무가 얇으면 C 등급과 보류 문장을 쓰되 그 이유만으로 반려하지 않는다.
approved=false는 표시된 사실이 서로 명백히 충돌하거나 품질상 발행할 수 없을 때만 사용한다.
각 후보에 valuation grade A/B/C와 서로 다른 한국어 한 문장을 45~90자로 쓴다.
반드시 {"reviews":[{"candidateId":"...","approved":true,"grade":"A","paragraph":"...","concerns":[]}]} JSON만 반환한다.`;

const EDITOR_SYSTEM = `당신은 FOMO Club 편집장이다.
정상 응답이 있는 후보 중 정확히 targetCount개를 고른다. 두 분석가의 approved 플래그와 concerns는 참고 의견이며,
companyScore, quietScore, 두 등급, 자산군 다양성, 문구 중복을 함께 보고 최종 승인 여부를 결정한다.
입력에 없는 후보를 고르지 말고 입력에 없는 숫자를 쓰지 않는다. selectedIds는 중복 없이 정확히 targetCount개다.
반드시 {"selectedIds":["..."],"rejected":[{"candidateId":"...","reasons":["..."]}],"compositionSummary":"..."} JSON만 반환한다.`;

async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function run() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return results;
}

async function runAnalyst(
  role: AnalystRole,
  candidates: readonly CandidateRecord[],
  caller: CommitteeAgentCaller,
  state: CallState
): Promise<Map<string, CheckedAnalystReview>> {
  const batches = Array.from({ length: Math.ceil(candidates.length / BATCH_SIZE) }, (_, index) =>
    candidates.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE)
  );
  const system = role === "trading" ? TRADING_SYSTEM : FINANCIAL_SYSTEM;
  const results = await mapConcurrent(batches, BATCH_CONCURRENCY, async (batch) => {
    const input = batch.map((candidate) => compactAnalystInput(role, candidate.input));
    const text = await callWithRetry(caller, {
      role,
      system,
      input,
      trace: `expert-committee-${role}`,
    }, state);
    return parseAnalystBatch(text, batch.map((candidate) => candidate.id)).map((review, index) =>
      applyAnalystFactGate(role, review, batch[index]!.input)
    );
  });
  return new Map(results.flat().map((review) => [review.candidateId, review]));
}

function compactAnalystInput(role: AnalystRole, input: CommitteeCandidateInput): unknown {
  const base = {
    candidateId: input.candidateId,
    stock: { canonical: input.stock.canonical, symbol: input.stock.symbol, assetClass: input.assetClass },
    headline: input.material.headline?.slice(0, 120),
  };
  if (role === "trading") {
    const zone = input.trading.wyckoff?.currentZone;
    return {
      ...base,
      facts: [
        input.trading.verdict?.stanceText,
        ...(input.trading.verdict?.evidence ?? []),
        input.trading.verdict?.invalidation,
        input.trading.wyckoff?.summary,
        zone?.label,
        ...(zone?.evidence ?? []),
        ...(input.trading.wyckoff?.events.slice(-2).map((event) => event.label) ?? []),
      ].filter((fact): fact is string => typeof fact === "string").slice(0, 3).map((fact) => fact.slice(0, 80)),
    };
  }
  const metricFacts = input.financial.metrics.slice(0, 5).map((metric) => `${metric.label} ${metric.value}`);
  const scoreFacts = input.financial.scoreAxes.flatMap((axis) => [`${axis.label} ${axis.score}점`, ...axis.evidence]).slice(0, 8);
  const periods = input.financial.financials?.periods.map((period) => period.title) ?? [];
  const financialFacts = input.financial.financials?.rows.slice(0, 3).flatMap((row) => {
    const latest = row.rawValues?.at(-1);
    const previous = row.rawValues?.at(-2);
    return [`${row.label} ${periods.at(-2) ?? "직전"} ${previous ?? "결측"} / ${periods.at(-1) ?? "최근"} ${latest ?? "결측"}`];
  }) ?? [];
  return {
    ...base,
    companySummary: input.financial.companySummary?.slice(0, 120),
    facts: [
      ...(input.financial.marketCap ? [`시가총액 ${input.financial.marketCap}`] : []),
      ...metricFacts,
      ...scoreFacts,
      ...financialFacts,
    ].slice(0, 4).map((fact) => fact.slice(0, 80)),
  };
}

function enforceAnalystCopyQuality(
  role: AnalystRole,
  reviews: Map<string, CheckedAnalystReview>,
  candidates: readonly CandidateRecord[]
): Map<string, CheckedAnalystReview> {
  const keys = new Map<string, string[]>();
  for (const candidate of candidates) {
    const review = reviews.get(candidate.id);
    if (!review) continue;
    const key = review.paragraph
      .replaceAll(candidate.card.canonical, "")
      .replace(/\s+/g, "")
      .trim();
    keys.set(key, [...(keys.get(key) ?? []), candidate.id]);
  }
  const repeatedIds = new Set([...keys.values()].filter((ids) => ids.length >= 3).flat());
  return new Map([...reviews].map(([id, review]) => {
    const candidate = candidates.find((item) => item.id === id);
    const tooShort = review.paragraph.replace(/\s+/g, "").length < 30;
    if (!tooShort && !repeatedIds.has(id)) return [id, review];
    const qualityReason = tooShort ? "전문 분석 문단이 지나치게 짧음" : "후보 간 분석 문구 반복";
    // 모델이 후보별로 같은 문장을 반복하면 문구만 엔진 근거로 교체한다.
    // 승인 자체를 전부 취소하면 정상 후보 40~50장이 편집장 단계에 0장으로 전달될 수 있다.
    if (review.approved && candidate) {
      return [id, {
        ...review,
        paragraph: role === "trading" ? tradingFallback(candidate.input) : financialFallback(candidate.input),
        concerns: [...review.concerns, `${qualityReason} — 결정론 엔진 문장으로 보강`],
        factFallback: true,
      }];
    }
    return [id, {
      ...review,
      approved: false,
      grade: "C",
      concerns: [...review.concerns, qualityReason],
    }];
  }));
}

function parseEditor(text: string): EditorOutput {
  const parsed = parseJsonObject(text) as Partial<EditorOutput>;
  if (
    !Array.isArray(parsed.selectedIds) ||
    !parsed.selectedIds.every((id) => typeof id === "string") ||
    !Array.isArray(parsed.rejected) ||
    typeof parsed.compositionSummary !== "string"
  ) throw new Error("editor output invalid");
  const rejected = parsed.rejected.flatMap((item) => {
    if (
      !item ||
      typeof item.candidateId !== "string" ||
      !Array.isArray(item.reasons) ||
      !item.reasons.every((reason) => typeof reason === "string")
    ) return [];
    return [{ candidateId: item.candidateId, reasons: item.reasons }];
  });
  return { selectedIds: parsed.selectedIds, rejected, compositionSummary: parsed.compositionSummary };
}

async function runEditor(
  candidates: readonly CandidateRecord[],
  trading: Map<string, CheckedAnalystReview>,
  financial: Map<string, CheckedAnalystReview>,
  caller: CommitteeAgentCaller,
  state: CallState
): Promise<EditorOutput> {
  // 분석가의 approved는 편집장이 참고하는 검수 의견이다. 정상 JSON 응답이 있으면
  // 편집장이 반려 사유·등급·조용함을 종합해 최종 결정한다. 응답 누락만 hard reject다.
  const eligible = candidates.filter((candidate) => {
    const tradingReview = trading.get(candidate.id);
    const financialReview = financial.get(candidate.id);
    return Boolean(tradingReview && financialReview && !tradingReview.responseMissing && !financialReview.responseMissing);
  });
  if (eligible.length < FINAL_TARGET) throw new Error(`committee eligible candidates ${eligible.length}/${FINAL_TARGET}`);
  const assetCounts = eligible.reduce<Record<string, number>>((counts, candidate) => {
    counts[candidate.assetClass] = (counts[candidate.assetClass] ?? 0) + 1;
    return counts;
  }, {});
  const input = {
    targetCount: FINAL_TARGET,
    candidateCount: eligible.length,
    assetCounts,
    candidates: eligible.map((candidate) => ({
      candidateId: candidate.id,
      canonical: candidate.card.canonical,
      assetClass: candidate.assetClass,
      sector: candidate.card.sector,
      headline: candidate.card.headline?.slice(0, 100),
      companyScore: candidate.front.companyScore?.score,
      quietScore: candidate.quietScore,
      timingGrade: trading.get(candidate.id)!.grade,
      valuationGrade: financial.get(candidate.id)!.grade,
      tradingApproved: trading.get(candidate.id)!.approved,
      financialApproved: financial.get(candidate.id)!.approved,
      analystConcerns: [...trading.get(candidate.id)!.concerns, ...financial.get(candidate.id)!.concerns]
        .slice(0, 2)
        .map((concern) => concern.slice(0, 80)),
    })),
  };
  const text = await callWithRetry(caller, { role: "editor", system: EDITOR_SYSTEM, input, trace: "expert-committee-editor" }, state);
  const output = parseEditor(text);
  const known = new Set(eligible.map((candidate) => candidate.id));
  const selected = [...new Set(output.selectedIds)];
  if (selected.length !== FINAL_TARGET || selected.some((id) => !known.has(id))) {
    throw new Error(`editor selection invalid: ${selected.length}/${FINAL_TARGET}`);
  }
  const summaryInvalid = validateAgentNumbers(output.compositionSummary, input);
  const rejected = output.rejected.map((row) => {
    const invalid = validateAgentNumbers(row.reasons.join(" "), input);
    return invalid.length > 0 ? { candidateId: row.candidateId, reasons: ["편집 품질 기준 미달"] } : row;
  });
  return {
    selectedIds: selected,
    rejected,
    compositionSummary: summaryInvalid.length > 0
      ? "자산군·등급·조용함을 함께 보고 중복을 줄인 구성입니다."
      : output.compositionSummary,
  };
}

async function candidateRecords(response: Daily30Response): Promise<CandidateRecord[]> {
  const cards: DiscoveryDeckCardPayload[] = response.cards ?? response.stocks.map((stock) => ({ kind: "stock", ...stock }));
  const raw = cards.flatMap((card, cardIndex) => {
    if (!isStockCard(card)) return [];
    const meta = response.meta.cards[cardIndex];
    const front = response.fronts[card.canonical];
    if (!meta || !front) return [];
    return [{ id: meta.id, assetClass: meta.assetClass, signalScore: meta.signalScore, hypePenalty: meta.hypePenalty, quietScore: meta.quietScore, cardIndex, card, front }];
  }).slice(0, CANDIDATE_TARGET);

  return mapConcurrent(raw, 6, async (candidate): Promise<CandidateRecord> => {
    const basics = candidate.card.market === "COIN"
      ? undefined
      : await fetchStockBasics(candidate.card.canonical, candidate.card.naverCode, candidate.card.symbol).catch(() => undefined);
    const financials = companyFinancialsFromBasics(basics);
    const latestPrice = candidate.front.candles?.at(-1)?.close;
    const companyScore = computeCompanyScore({
      ...(financials ? { financials } : {}),
      signals: candidate.front.signals,
      ...(candidate.front.verdict ? { verdict: candidate.front.verdict } : {}),
      ...(candidate.front.wyckoff ? { wyckoff: candidate.front.wyckoff } : {}),
      insiderPurchaseConfirmed: /내부자|임원|대주주|Form\s?4/i.test([
        candidate.card.headline,
        candidate.card.whyShown,
        candidate.card.reason,
      ].filter(Boolean).join(" ")),
      ...(finite(latestPrice) ? { currentPrice: latestPrice } : {}),
      quiet: {
        quietScore: candidate.quietScore,
        signalScore: candidate.signalScore,
        hypePenalty: candidate.hypePenalty,
      },
      asOf: candidate.front.signals.asOf ?? response.asOf,
    });
    const front: DiscoveryFrontSeed = { ...candidate.front, companyScore };
    const scoreAxes = companyScore.axes;
    return {
      ...candidate,
      front,
      ...(basics ? { basics } : {}),
      input: {
        candidateId: candidate.id,
        assetClass: candidate.assetClass,
        stock: {
          canonical: candidate.card.canonical,
          ...(candidate.card.symbol ? { symbol: candidate.card.symbol } : {}),
          ...(candidate.card.naverCode ? { naverCode: candidate.card.naverCode } : {}),
          country: candidate.card.country,
          ...(candidate.card.market ? { market: candidate.card.market } : {}),
          sector: candidate.card.sector,
        },
        material: {
          ...(candidate.card.headline ? { headline: candidate.card.headline } : {}),
          ...(candidate.card.whyShown ? { whyShown: candidate.card.whyShown } : {}),
          ...(candidate.card.reason ? { reason: candidate.card.reason } : {}),
          ...(candidate.card.sourceLabel ? { sourceLabel: candidate.card.sourceLabel } : {}),
          ...(candidate.card.sourceUrl ? { sourceUrl: candidate.card.sourceUrl } : {}),
        },
        selection: {
          signalScore: candidate.signalScore,
          hypePenalty: candidate.hypePenalty,
          quietScore: candidate.quietScore,
        },
        trading: {
          signals: front.signals,
          ...(front.verdict ? { verdict: front.verdict } : {}),
          ...(front.wyckoff ? { wyckoff: front.wyckoff } : {}),
          companyChartAxis: companyScore,
          candleSummary: summarizeCandles(front),
        },
        financial: {
          ...(basics?.summary ? { companySummary: basics.summary } : {}),
          ...(basics?.marketCap ? { marketCap: basics.marketCap } : {}),
          metrics: basics?.metrics ?? [],
          ...(basics?.financials ? { financials: basics.financials } : {}),
          ...(basics?.valuationHistory ? { valuationHistory: basics.valuationHistory } : {}),
          scoreAxes: scoreAxes.filter((axis) => axis.key === "valuation" || axis.key === "growth" || axis.key === "profitability"),
        },
      },
    };
  });
}

function finalResponse(
  pool: Daily30Response,
  candidates: readonly CandidateRecord[],
  selectedIds: readonly string[],
  trading: Map<string, CheckedAnalystReview>,
  financial: Map<string, CheckedAnalystReview>,
  runMeta: NonNullable<Daily30Response["meta"]["committee"]>
): Daily30Response {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const selected = selectedIds.map((id) => byId.get(id)!).filter(Boolean);
  const poolCards: DiscoveryDeckCardPayload[] = pool.cards ?? pool.stocks.map((stock) => ({ kind: "stock", ...stock }));
  const feedPairs = poolCards.flatMap((card, index) => (isStockCard(card) ? [] : [{ card, meta: pool.meta.cards[index] }])).filter((pair) => pair.meta);
  const fronts: Daily30Response["fronts"] = {};
  const stocks: DiscoveryStockPayload[] = [];
  const cards: DiscoveryDeckCardPayload[] = [];
  const metaCards: Daily30Response["meta"]["cards"] = [];
  for (const candidate of selected) {
    const tradingReview = trading.get(candidate.id)!;
    const financialReview = financial.get(candidate.id)!;
    const { kind: _kind, ...stock } = candidate.card;
    void _kind;
    stocks.push(stock);
    cards.push(candidate.card);
    metaCards.push({ id: candidate.id, assetClass: candidate.assetClass as Daily30Response["meta"]["cards"][number]["assetClass"], quietScore: candidate.quietScore, signalScore: candidate.signalScore, hypePenalty: candidate.hypePenalty });
    fronts[candidate.card.canonical] = {
      ...candidate.front,
      committeeReview: {
        runId: runMeta.runId,
        reviewedAt: runMeta.reviewedAt,
        tradingView: tradingReview.paragraph,
        fundamentalView: financialReview.paragraph,
        timingGrade: tradingReview.grade,
        valuationGrade: financialReview.grade,
        factChecked: true,
      },
    };
  }
  for (const pair of feedPairs) {
    cards.push(pair.card);
    metaCards.push(pair.meta!);
  }
  const assetCounts = metaCards.reduce<Daily30Response["meta"]["assetCounts"]>((counts, meta) => {
    counts[meta.assetClass] += 1;
    return counts;
  }, { "kr-stock": 0, "us-stock": 0, coin: 0, macro: 0 });
  return {
    ...pool,
    stocks,
    cards,
    fronts,
    confidence: "H",
    source: `${pool.source} · 전문가 위원회 승인`,
    meta: {
      ...pool.meta,
      targetCount: FINAL_TARGET,
      cards: metaCards,
      assetCounts,
      committee: runMeta,
    },
  };
}

function rejectionReasons(
  candidate: CandidateRecord,
  selected: ReadonlySet<string>,
  editor: EditorOutput,
  trading: CheckedAnalystReview,
  financial: CheckedAnalystReview
): string[] {
  const reasons = [
    ...(!trading.approved ? trading.concerns : []),
    ...(!financial.approved ? financial.concerns : []),
    ...(!selected.has(candidate.id) ? (editor.rejected.find((row) => row.candidateId === candidate.id)?.reasons ?? []) : []),
  ].filter(Boolean);
  if (selected.has(candidate.id)) return reasons;
  return reasons.length > 0 ? reasons : ["최종 구성의 중복·다양성 기준에서 제외"];
}

export interface CommitteeRunOptions {
  caller?: CommitteeAgentCaller;
  buildPool?: () => Promise<Daily30Response>;
  readPrevious?: () => Promise<PublishedCommitteeSnapshot | null>;
  publish?: (snapshot: PublishedCommitteeSnapshot, report: CommitteeRunReport) => Promise<void>;
  writeFailure?: (report: CommitteeRunReport) => Promise<void>;
  writePicks?: (response: Daily30Response) => Promise<void>;
  minCallIntervalMs?: number;
  stageStorage?: {
    read: (date: string) => Promise<unknown | null>;
    write: (date: string, value: unknown) => Promise<void>;
  };
}

export async function runExpertReviewCommittee(options: CommitteeRunOptions = {}): Promise<CommitteeRunResult> {
  const startedAt = new Date();
  const date = kstDate();
  const runId = `${date}-${startedAt.getTime().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const previous = await (options.readPrevious ?? readPublishedCommitteeSnapshot)().catch(() => null);
  const configuredInterval = Number(process.env.COMMITTEE_MIN_CALL_INTERVAL_MS ?? DEFAULT_CALL_INTERVAL_MS);
  const state: CallState = {
    callCount: 0,
    model: process.env.COMMITTEE_AI_MODEL || DEFAULT_COMMITTEE_MODEL,
    lastCallAt: 0,
    minCallIntervalMs: options.minCallIntervalMs ?? (Number.isFinite(configuredInterval) ? Math.max(0, configuredInterval) : DEFAULT_CALL_INTERVAL_MS),
  };
  let candidateCount = 0;
  try {
    if (!(options.caller ?? (isAiConfigured() ? defaultAgentCaller : undefined))) {
      throw new Error("committee AI is not configured");
    }
    const caller = options.caller ?? defaultAgentCaller;
    const pool = await (options.buildPool ?? (() => buildDaily30CandidatePoolResponse(CANDIDATE_TARGET)))();
    const candidates = await candidateRecords(pool);
    candidateCount = candidates.length;
    if (candidateCount < MIN_CANDIDATES) throw new Error(`committee candidate pool ${candidateCount}/${MIN_CANDIDATES}`);
    const trading = enforceAnalystCopyQuality("trading", await runAnalyst("trading", candidates, caller, state), candidates);
    const financial = enforceAnalystCopyQuality("financial", await runAnalyst("financial", candidates, caller, state), candidates);
    const editor = await runEditor(candidates, trading, financial, caller, state);
    const completedAt = new Date().toISOString();
    const committeeMeta = {
      runId,
      version: COMMITTEE_VERSION,
      reviewedAt: completedAt,
      candidateCount,
      selectedCount: editor.selectedIds.length,
      callCount: state.callCount,
    };
    const response = finalResponse(pool, candidates, editor.selectedIds, trading, financial, committeeMeta);
    const selected = new Set(editor.selectedIds);
    const reviews: CommitteeReviewAudit[] = candidates.map((candidate) => {
      const tradingReview = trading.get(candidate.id)!;
      const financialReview = financial.get(candidate.id)!;
      return {
        candidateId: candidate.id,
        canonical: candidate.card.canonical,
        approved: selected.has(candidate.id),
        timingGrade: tradingReview.grade,
        valuationGrade: financialReview.grade,
        tradingView: tradingReview.paragraph,
        fundamentalView: financialReview.paragraph,
        rejectionReasons: rejectionReasons(candidate, selected, editor, tradingReview, financialReview),
        factGate: {
          tradingFallback: tradingReview.factFallback,
          financialFallback: financialReview.factFallback,
          invalidNumbers: [...new Set([...tradingReview.invalidNumbers, ...financialReview.invalidNumbers])],
        },
      };
    });
    const report: CommitteeRunReport = {
      runId,
      version: COMMITTEE_VERSION,
      date,
      status: "published",
      startedAt: startedAt.toISOString(),
      completedAt,
      model: state.model,
      callCount: state.callCount,
      candidateCount,
      selectedCount: editor.selectedIds.length,
      selectedIds: editor.selectedIds,
      reviews,
      compositionSummary: editor.compositionSummary,
      assetCounts: response.meta.assetCounts,
    };
    const { reviews: _reviews, ...reportSummary } = report;
    void _reviews;
    const snapshot: PublishedCommitteeSnapshot = {
      runId,
      version: COMMITTEE_VERSION,
      reviewedAt: completedAt,
      response,
      report: reportSummary,
    };
    await (options.publish ?? publishCommitteeSnapshot)(snapshot, report);
    await (options.writePicks ?? writeDaily30PicksSnapshot)(response).catch(() => {});
    return { ok: true, report, response, previousRunRetained: false };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const report: CommitteeRunReport = {
      runId,
      version: COMMITTEE_VERSION,
      date,
      status: "failed",
      startedAt: startedAt.toISOString(),
      completedAt,
      model: state.model,
      callCount: state.callCount,
      candidateCount,
      selectedCount: 0,
      selectedIds: [],
      reviews: [],
      compositionSummary: "위원회 실행 실패로 직전 승인 덱을 유지했습니다.",
      assetCounts: previous?.response.meta.assetCounts ?? {},
      error: error instanceof Error ? error.message : String(error),
      previousRunRetained: Boolean(previous),
    };
    await (options.writeFailure ?? writeFailedCommitteeRun)(report).catch(() => {});
    return { ok: false, report, previousRunRetained: Boolean(previous) };
  }
}

export type CommitteeStage = "trading" | "financial" | "editor";

interface StoredCommitteeStage {
  runId: string;
  version: string;
  date: string;
  startedAt: string;
  model: string;
  totalCallCount: number;
  pool: Daily30Response;
  candidates: CandidateRecord[];
  trading?: Array<[string, CheckedAnalystReview]>;
  financial?: Array<[string, CheckedAnalystReview]>;
}

export interface CommitteeStageResult {
  ok: boolean;
  stage: CommitteeStage;
  runId: string;
  candidateCount: number;
  selectedCount: number;
  callCount: number;
  previousRunRetained: boolean;
  error?: string;
}

const committeeStageId = (date: string) => `expert-committee:stage:${date}`;

function callState(options: Pick<CommitteeRunOptions, "minCallIntervalMs">, model?: string): CallState {
  const configuredInterval = Number(process.env.COMMITTEE_MIN_CALL_INTERVAL_MS ?? DEFAULT_CALL_INTERVAL_MS);
  return {
    callCount: 0,
    model: model || process.env.COMMITTEE_AI_MODEL || DEFAULT_COMMITTEE_MODEL,
    lastCallAt: 0,
    minCallIntervalMs: options.minCallIntervalMs ?? (Number.isFinite(configuredInterval) ? Math.max(0, configuredInterval) : DEFAULT_CALL_INTERVAL_MS),
  };
}

function reviewAudits(
  candidates: readonly CandidateRecord[],
  selectedIds: readonly string[],
  editor: EditorOutput,
  trading: Map<string, CheckedAnalystReview>,
  financial: Map<string, CheckedAnalystReview>
): CommitteeReviewAudit[] {
  const selected = new Set(selectedIds);
  return candidates.map((candidate) => {
    const tradingReview = trading.get(candidate.id)!;
    const financialReview = financial.get(candidate.id)!;
    return {
      candidateId: candidate.id,
      canonical: candidate.card.canonical,
      approved: selected.has(candidate.id),
      timingGrade: tradingReview.grade,
      valuationGrade: financialReview.grade,
      tradingView: tradingReview.paragraph,
      fundamentalView: financialReview.paragraph,
      rejectionReasons: rejectionReasons(candidate, selected, editor, tradingReview, financialReview),
      factGate: {
        tradingFallback: tradingReview.factFallback,
        financialFallback: financialReview.factFallback,
        invalidNumbers: [...new Set([...tradingReview.invalidNumbers, ...financialReview.invalidNumbers])],
      },
    };
  });
}

/**
 * Vercel 300초 상한과 Groq 조직 TPM을 함께 지키는 일일 3단 실행.
 * trading → financial → editor 순서로 같은 날짜 stage JSON을 이어받고 editor 성공 때만 활성 덱을 교체한다.
 */
export async function runExpertReviewCommitteeStage(
  stage: CommitteeStage,
  options: CommitteeRunOptions = {}
): Promise<CommitteeStageResult> {
  const date = kstDate();
  const previous = await (options.readPrevious ?? readPublishedCommitteeSnapshot)().catch(() => null);
  let stored = options.stageStorage
    ? (await options.stageStorage.read(date).catch(() => null)) as StoredCommitteeStage | null
    : await readFeedContent<StoredCommitteeStage>(committeeStageId(date)).catch(() => null);
  const now = new Date();
  const fallbackRunId = `${date}-${now.getTime().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const state = callState(options, stored?.model);
  const caller = options.caller ?? (isAiConfigured() ? defaultAgentCaller : undefined);

  try {
    if (!caller) throw new Error("committee AI is not configured");

    if (stage === "trading") {
      const pool = await (options.buildPool ?? (() => buildDaily30CandidatePoolResponse(CANDIDATE_TARGET)))();
      const candidates = await candidateRecords(pool);
      if (candidates.length < MIN_CANDIDATES) throw new Error(`committee candidate pool ${candidates.length}/${MIN_CANDIDATES}`);
      const trading = enforceAnalystCopyQuality("trading", await runAnalyst("trading", candidates, caller, state), candidates);
      stored = {
        runId: fallbackRunId,
        version: COMMITTEE_VERSION,
        date,
        startedAt: now.toISOString(),
        model: state.model,
        totalCallCount: state.callCount,
        pool,
        candidates,
        trading: [...trading],
      };
      if (options.stageStorage) await options.stageStorage.write(date, stored);
      else await writeFeedContent(committeeStageId(date), stored);
      return { ok: true, stage, runId: stored.runId, candidateCount: candidates.length, selectedCount: 0, callCount: stored.totalCallCount, previousRunRetained: Boolean(previous) };
    }

    if (!stored?.trading?.length) throw new Error("trading stage is not ready");
    const trading = new Map(stored.trading);

    if (stage === "financial") {
      const financial = enforceAnalystCopyQuality("financial", await runAnalyst("financial", stored.candidates, caller, state), stored.candidates);
      stored = {
        ...stored,
        model: state.model,
        totalCallCount: stored.totalCallCount + state.callCount,
        financial: [...financial],
      };
      if (options.stageStorage) await options.stageStorage.write(date, stored);
      else await writeFeedContent(committeeStageId(date), stored);
      return { ok: true, stage, runId: stored.runId, candidateCount: stored.candidates.length, selectedCount: 0, callCount: stored.totalCallCount, previousRunRetained: Boolean(previous) };
    }

    if (!stored.financial?.length) throw new Error("financial stage is not ready");
    const financial = new Map(stored.financial);
    const editor = await runEditor(stored.candidates, trading, financial, caller, state);
    const totalCallCount = stored.totalCallCount + state.callCount;
    const completedAt = new Date().toISOString();
    const committeeMeta = {
      runId: stored.runId,
      version: COMMITTEE_VERSION,
      reviewedAt: completedAt,
      candidateCount: stored.candidates.length,
      selectedCount: editor.selectedIds.length,
      callCount: totalCallCount,
    };
    const response = finalResponse(stored.pool, stored.candidates, editor.selectedIds, trading, financial, committeeMeta);
    const reviews = reviewAudits(stored.candidates, editor.selectedIds, editor, trading, financial);
    const report: CommitteeRunReport = {
      runId: stored.runId,
      version: COMMITTEE_VERSION,
      date,
      status: "published",
      startedAt: stored.startedAt,
      completedAt,
      model: state.model,
      callCount: totalCallCount,
      candidateCount: stored.candidates.length,
      selectedCount: editor.selectedIds.length,
      selectedIds: editor.selectedIds,
      reviews,
      compositionSummary: editor.compositionSummary,
      assetCounts: response.meta.assetCounts,
    };
    const { reviews: _reviews, ...reportSummary } = report;
    void _reviews;
    const snapshot: PublishedCommitteeSnapshot = {
      runId: stored.runId,
      version: COMMITTEE_VERSION,
      reviewedAt: completedAt,
      response,
      report: reportSummary,
    };
    await (options.publish ?? publishCommitteeSnapshot)(snapshot, report);
    await (options.writePicks ?? writeDaily30PicksSnapshot)(response).catch(() => {});
    return { ok: true, stage, runId: stored.runId, candidateCount: stored.candidates.length, selectedCount: editor.selectedIds.length, callCount: totalCallCount, previousRunRetained: false };
  } catch (error) {
    const runId = stored?.runId ?? fallbackRunId;
    const totalCallCount = (stored?.totalCallCount ?? 0) + state.callCount;
    const report: CommitteeRunReport = {
      runId,
      version: COMMITTEE_VERSION,
      date,
      status: "failed",
      startedAt: stored?.startedAt ?? now.toISOString(),
      completedAt: new Date().toISOString(),
      model: state.model,
      callCount: totalCallCount,
      candidateCount: stored?.candidates.length ?? 0,
      selectedCount: 0,
      selectedIds: [],
      reviews: [],
      compositionSummary: `${stage} 단계 실패로 직전 승인 덱을 유지했습니다.`,
      assetCounts: previous?.response.meta.assetCounts ?? {},
      error: error instanceof Error ? error.message : String(error),
      previousRunRetained: Boolean(previous),
    };
    await (options.writeFailure ?? writeFailedCommitteeRun)(report).catch(() => {});
    return {
      ok: false,
      stage,
      runId,
      candidateCount: report.candidateCount,
      selectedCount: 0,
      callCount: totalCallCount,
      previousRunRetained: Boolean(previous),
      ...(report.error ? { error: report.error } : {}),
    };
  }
}
