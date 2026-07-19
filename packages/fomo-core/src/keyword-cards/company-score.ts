import type { StockBasics } from "../stock-basics";
import type { CardFrontSignals } from "./card-front-hook";
import type { CardVerdict } from "./verdict";
import type { WyckoffAnalysis } from "./wyckoff-analysis";

export type CompanyScoreAxisKey = "valuation" | "growth" | "profitability" | "flow" | "chart" | "quiet";

export interface CompanyScoreAxis {
  key: CompanyScoreAxisKey;
  label: string;
  score: number;
  evidence: string[];
}

export interface CompanyFinancialScoreInput {
  currentPer?: number;
  currentPbr?: number;
  currentPsr?: number;
  perHistory?: number[];
  pbrHistory?: number[];
  psrHistory?: number[];
  valuationHistoryLabel?: string;
  revenue?: number[];
  operatingIncome?: number[];
  periods?: string[];
}

export interface CompanyQuietScoreInput {
  quietScore: number;
  signalScore?: number;
  hypePenalty?: number;
}

export interface CompanyScoreInput {
  financials?: CompanyFinancialScoreInput;
  signals?: Pick<CardFrontSignals, "foreignNetStreak" | "institutionNetStreak">;
  insiderPurchaseConfirmed?: boolean;
  whaleStrength?: number;
  verdict?: CardVerdict;
  wyckoff?: WyckoffAnalysis;
  currentPrice?: number;
  quiet?: CompanyQuietScoreInput;
  asOf?: string;
}

export interface CompanyScoreResult {
  score: number | null;
  label: string;
  interpretation: string;
  axes: CompanyScoreAxis[];
  availableAxisCount: number;
  omittedAxes: CompanyScoreAxisKey[];
  asOf?: string;
}

const AXIS_LABEL: Record<CompanyScoreAxisKey, string> = {
  valuation: "밸류에이션",
  growth: "성장",
  profitability: "수익성·체력",
  flow: "수급",
  chart: "차트 타이밍",
  quiet: "조용함",
};

const ALL_AXES = Object.keys(AXIS_LABEL) as CompanyScoreAxisKey[];
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const pct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

function lastTwo(values: readonly number[] | undefined): [number, number] | undefined {
  const clean = (values ?? []).filter(Number.isFinite);
  return clean.length >= 2 ? [clean[clean.length - 2]!, clean[clean.length - 1]!] : undefined;
}

function yoy(pair: [number, number] | undefined): number | undefined {
  if (!pair || pair[0] === 0) return undefined;
  return ((pair[1] - pair[0]) / Math.abs(pair[0])) * 100;
}

function historicalPosition(current: number | undefined, history: readonly number[] | undefined): number | undefined {
  if (!finite(current)) return undefined;
  const clean = (history ?? []).filter((value) => Number.isFinite(value) && value > 0);
  if (clean.length < 3) return undefined;
  const low = Math.min(...clean);
  const high = Math.max(...clean);
  if (high === low) return current <= low ? 0 : 100;
  return clamp(((current - low) / (high - low)) * 100);
}

function valuationAxis(financials: CompanyFinancialScoreInput | undefined): CompanyScoreAxis | undefined {
  if (!financials) return undefined;
  const operating = lastTwo(financials.operatingIncome)?.[1];
  const useSales = finite(operating) && operating <= 0;
  const candidates = useSales
    ? [{ term: "PSR", value: financials.currentPsr, history: financials.psrHistory }]
    : [
        { term: "PER", value: financials.currentPer, history: financials.perHistory },
        { term: "PBR", value: financials.currentPbr, history: financials.pbrHistory },
      ];
  const available = candidates.flatMap((candidate) => {
    const position = historicalPosition(candidate.value, candidate.history);
    return finite(candidate.value) && finite(position) ? [{ ...candidate, position }] : [];
  });
  if (available.length === 0) return undefined;
  const score = Math.round(available.reduce((sum, item) => sum + (100 - item.position), 0) / available.length);
  const band = financials.valuationHistoryLabel ?? `최근 ${available[0]!.history?.length ?? 0}개년`;
  return {
    key: "valuation",
    label: AXIS_LABEL.valuation,
    score: clamp(score),
    evidence: available.map((item) => {
      const position = Math.round(item.position);
      const bandPosition = position <= 50 ? `하단 ${position}%` : `상단 ${100 - position}%`;
      return `${item.term} ${item.value!.toFixed(2)}배 · ${band} 밴드 ${bandPosition}`;
    }),
  };
}

function growthAxis(financials: CompanyFinancialScoreInput | undefined): CompanyScoreAxis | undefined {
  if (!financials) return undefined;
  const revenueYoy = yoy(lastTwo(financials.revenue));
  const operatingYoy = yoy(lastTwo(financials.operatingIncome));
  const components: number[] = [];
  if (finite(revenueYoy)) components.push(clamp(((revenueYoy + 20) / 50) * 100));
  if (finite(operatingYoy)) components.push(clamp(((operatingYoy + 50) / 150) * 100));
  if (components.length === 0) return undefined;
  const evidence: string[] = [];
  const latest = financials.periods?.at(-1);
  if (finite(revenueYoy)) evidence.push(`매출 YoY ${pct(revenueYoy)}${latest ? ` · ${latest}` : ""}`);
  if (finite(operatingYoy)) evidence.push(`영업이익 YoY ${pct(operatingYoy)}${latest ? ` · ${latest}` : ""}`);
  const revenue = financials.revenue ?? [];
  if (revenue.length >= 3 && revenue.at(-2)! !== 0 && revenue.at(-3)! !== 0) {
    const previous = ((revenue.at(-2)! - revenue.at(-3)!) / Math.abs(revenue.at(-3)!)) * 100;
    if (finite(revenueYoy)) evidence.push(`매출 성장 ${revenueYoy >= previous ? "가속" : "감속"} · 직전 ${pct(previous)}`);
  }
  return {
    key: "growth",
    label: AXIS_LABEL.growth,
    score: Math.round(components.reduce((sum, value) => sum + value, 0) / components.length),
    evidence,
  };
}

function profitabilityAxis(financials: CompanyFinancialScoreInput | undefined): CompanyScoreAxis | undefined {
  if (!financials) return undefined;
  const revenue = lastTwo(financials.revenue);
  const operating = lastTwo(financials.operatingIncome);
  if (!revenue || !operating || revenue[1] === 0) return undefined;
  const currentMargin = (operating[1] / Math.abs(revenue[1])) * 100;
  const previousMargin = revenue[0] === 0 ? undefined : (operating[0] / Math.abs(revenue[0])) * 100;
  let score = clamp(50 + currentMargin * 1.6);
  if (finite(previousMargin)) score = clamp(score + clamp(currentMargin - previousMargin, -10, 10));
  return {
    key: "profitability",
    label: AXIS_LABEL.profitability,
    score: Math.round(score),
    evidence: [
      `영업이익률 ${currentMargin.toFixed(1)}% · ${operating[1] >= 0 ? "흑자" : "적자"}`,
      ...(finite(previousMargin) ? [`직전 ${previousMargin.toFixed(1)}% → 현재 ${currentMargin.toFixed(1)}%`] : []),
    ],
  };
}

function flowAxis(input: CompanyScoreInput): CompanyScoreAxis | undefined {
  const foreign = input.signals?.foreignNetStreak;
  const institution = input.signals?.institutionNetStreak;
  const whale = input.whaleStrength;
  if (!finite(foreign) && !finite(institution) && input.insiderPurchaseConfirmed !== true && !finite(whale)) return undefined;
  let score = 50;
  const evidence: string[] = [];
  if (finite(foreign) && foreign !== 0) {
    score += clamp(foreign, -8, 8) * 4;
    evidence.push(`외국인 ${Math.abs(foreign)}일 연속 순${foreign > 0 ? "매수" : "매도"}`);
  }
  if (finite(institution) && institution !== 0) {
    score += clamp(institution, -8, 8) * 4;
    evidence.push(`기관 ${Math.abs(institution)}일 연속 순${institution > 0 ? "매수" : "매도"}`);
  }
  if (input.insiderPurchaseConfirmed) {
    score += 24;
    evidence.push("내부자 공개시장 매수 공시 확인");
  }
  if (finite(whale)) {
    score += clamp(whale, -1, 1) * 25;
    evidence.push(`고래 신호 강도 ${whale.toFixed(2)}`);
  }
  return { key: "flow", label: AXIS_LABEL.flow, score: Math.round(clamp(score)), evidence };
}

function chartAxis(input: CompanyScoreInput): CompanyScoreAxis | undefined {
  const phase = input.wyckoff?.currentZone?.kind ?? input.verdict?.phase;
  const events = input.wyckoff?.events ?? [];
  if (!phase && events.length === 0 && !finite(input.verdict?.invalidationLevel)) return undefined;
  const phaseScore = { accumulation: 74, markup: 64, distribution: 26, markdown: 30 } as const;
  let score = phase ? phaseScore[phase] : 50;
  const evidence: string[] = [];
  const zone = input.wyckoff?.currentZone;
  if (zone) evidence.push(zone.label.includes("주차") ? zone.label : `${zone.label} · ${zone.weeks}주차`);
  else if (phase) evidence.push(`${phase === "accumulation" ? "매집" : phase === "markup" ? "상승" : phase === "distribution" ? "분산" : "하락"} 국면`);
  const latestEvent = [...events].reverse().find((event) => ["spring", "pullback", "impulse", "upthrust"].includes(event.kind));
  if (latestEvent) {
    score += latestEvent.kind === "spring" ? 12 : latestEvent.kind === "pullback" ? 9 : latestEvent.kind === "impulse" ? 5 : -14;
    evidence.push(latestEvent.label);
  }
  if (finite(input.currentPrice) && finite(input.verdict?.invalidationLevel) && input.currentPrice > 0) {
    const distance = ((input.currentPrice - input.verdict.invalidationLevel) / input.currentPrice) * 100;
    if (distance >= 0 && distance <= 12) score += 6;
    else if (distance < 0) score -= 16;
    evidence.push(`무효선 거리 ${pct(distance)}`);
  }
  return { key: "chart", label: AXIS_LABEL.chart, score: Math.round(clamp(score)), evidence };
}

function quietAxis(quiet: CompanyQuietScoreInput | undefined): CompanyScoreAxis | undefined {
  if (!quiet || !finite(quiet.quietScore)) return undefined;
  const score = Math.round(clamp((quiet.quietScore / 80) * 100));
  const equation = finite(quiet.signalScore) && finite(quiet.hypePenalty)
    ? `신호 ${quiet.signalScore.toFixed(1)} - 화제성 ${quiet.hypePenalty.toFixed(1)} = ${quiet.quietScore.toFixed(1)}`
    : `quietScore ${quiet.quietScore.toFixed(1)}`;
  return { key: "quiet", label: AXIS_LABEL.quiet, score, evidence: [equation] };
}

function axisOf(axes: readonly CompanyScoreAxis[], key: CompanyScoreAxisKey): CompanyScoreAxis | undefined {
  return axes.find((axis) => axis.key === key);
}

function chartWeeks(axes: readonly CompanyScoreAxis[], input: CompanyScoreInput): number | undefined {
  const inputWeeks = input.wyckoff?.currentZone?.weeks;
  if (finite(inputWeeks)) return inputWeeks;
  const chartEvidence = axisOf(axes, "chart")?.evidence.join(" ") ?? "";
  const parsed = Number(chartEvidence.match(/(\d+)주차/u)?.[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function scoreLabel(axes: readonly CompanyScoreAxis[], input: CompanyScoreInput): string {
  const value = axisOf(axes, "valuation");
  const growth = axisOf(axes, "growth");
  const flow = axisOf(axes, "flow");
  const chart = axisOf(axes, "chart");
  const quiet = axisOf(axes, "quiet");
  const weeks = chartWeeks(axes, input);
  if ((value?.score ?? 0) >= 70 && (chart?.score ?? 0) >= 65) {
    return `역사 밴드 하단 + ${weeks ? `매집 ${weeks}주차` : "차트 타이밍 우위"}`;
  }
  if ((growth?.score ?? 0) >= 70 && finite(value?.score) && value!.score <= 40) return "성장은 강하지만 밸류 부담";
  if ((chart?.score ?? 0) <= 35) {
    const distribution = input.verdict?.phase === "distribution" || chart?.evidence.some((item) => item.includes("분산"));
    return `${distribution ? "분산" : "하락"} 신호 우세`;
  }
  if ((flow?.score ?? 0) >= 70 && (quiet?.score ?? 0) >= 65) return "조용한 수급 유입 + 낮은 화제성";
  if ((chart?.score ?? 0) >= 65) return weeks ? `매집 추정 ${weeks}주차` : "차트 타이밍 우위";
  if ((growth?.score ?? 0) >= 70) return "성장 가속이 가장 강한 축";
  const top = [...axes].sort((a, b) => b.score - a.score).slice(0, 2);
  return top.length > 0 ? `${top.map((axis) => axis.label).join(" + ")} 우위` : "근거 축 수집 중";
}

function interpretation(axes: readonly CompanyScoreAxis[], label: string): string {
  if (axes.length === 0) return "계산에 필요한 실데이터가 아직 부족해 종합 점수를 보류했어요.";
  const sorted = [...axes].sort((a, b) => b.score - a.score);
  const top = sorted[0]!;
  const bottom = sorted.at(-1)!;
  const leadEvidence = top.evidence[0] ?? "확인된 근거";
  if (top.key === bottom.key) return `${label}. ${leadEvidence}를 근거로 계산했어요.`;
  return `${label}. 가장 강한 축은 ${top.label} ${top.score}점(${leadEvidence})이고, ${bottom.label} ${bottom.score}점이 상대적으로 약해요.`;
}

export function computeCompanyScore(input: CompanyScoreInput): CompanyScoreResult {
  const axes = [
    valuationAxis(input.financials),
    growthAxis(input.financials),
    profitabilityAxis(input.financials),
    flowAxis(input),
    chartAxis(input),
    quietAxis(input.quiet),
  ].filter((axis): axis is CompanyScoreAxis => axis !== undefined);
  const score = axes.length > 0 ? Math.round(axes.reduce((sum, axis) => sum + axis.score, 0) / axes.length) : null;
  const label = scoreLabel(axes, input);
  return {
    score,
    label,
    interpretation: interpretation(axes, label),
    axes,
    availableAxisCount: axes.length,
    omittedAxes: ALL_AXES.filter((key) => !axes.some((axis) => axis.key === key)),
    ...(input.asOf ? { asOf: input.asOf } : {}),
  };
}

export function withCompanyQuietScore(
  base: CompanyScoreResult | undefined,
  quiet: CompanyQuietScoreInput,
  asOf?: string
): CompanyScoreResult {
  const quietScoreAxis = quietAxis(quiet);
  const axes = [...(base?.axes ?? []).filter((axis) => axis.key !== "quiet"), ...(quietScoreAxis ? [quietScoreAxis] : [])];
  const score = axes.length > 0 ? Math.round(axes.reduce((sum, axis) => sum + axis.score, 0) / axes.length) : null;
  const label = scoreLabel(axes, {});
  const resultAsOf = asOf ?? base?.asOf;
  return {
    score,
    label,
    interpretation: interpretation(axes, label),
    axes,
    availableAxisCount: axes.length,
    omittedAxes: ALL_AXES.filter((key) => !axes.some((axis) => axis.key === key)),
    ...(resultAsOf ? { asOf: resultAsOf } : {}),
  };
}

/**
 * 일일 큐레이션(seed)의 수급·조용함 축과 상세 조회(fresh)의 재무·차트 축을 합친다.
 * 같은 축은 일일 큐레이션 값을 우선하고, 상세 조회는 없던 축만 보강한다.
 * 카드와 상세가 서로 다른 캐시 시점을 읽어 같은 축의 점수가 흔들리는 일을 막는다.
 */
export function mergeCompanyScoreResults(
  seed: CompanyScoreResult | undefined,
  fresh: CompanyScoreResult | undefined
): CompanyScoreResult | undefined {
  if (!seed) return fresh;
  if (!fresh) return seed;
  const byKey = new Map<CompanyScoreAxisKey, CompanyScoreAxis>();
  for (const axis of fresh.axes) byKey.set(axis.key, axis);
  for (const axis of seed.axes) byKey.set(axis.key, axis);
  const axes = ALL_AXES.flatMap((key) => {
    const axis = byKey.get(key);
    return axis ? [axis] : [];
  });
  const score = axes.length > 0 ? Math.round(axes.reduce((sum, axis) => sum + axis.score, 0) / axes.length) : null;
  const label = scoreLabel(axes, {});
  const asOf = fresh.asOf ?? seed.asOf;
  return {
    score,
    label,
    interpretation: interpretation(axes, label),
    axes,
    availableAxisCount: axes.length,
    omittedAxes: ALL_AXES.filter((key) => !byKey.has(key)),
    ...(asOf ? { asOf } : {}),
  };
}

function metricNumber(basics: StockBasics, term: string): number | undefined {
  const metric = basics.metrics.find((item) => item.term === term);
  const value = metric?.value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/)?.[0];
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function companyFinancialsFromBasics(basics: StockBasics | null | undefined): CompanyFinancialScoreInput | undefined {
  if (!basics) return undefined;
  const financials = basics.financials;
  const actualIndexes = financials?.periods.flatMap((period, index) => (period.estimate ? [] : [index])) ?? [];
  const actualValues = (raw: Array<number | null> | undefined) =>
    actualIndexes.map((index) => raw?.[index]).filter((value): value is number => finite(value));
  const revenue = actualValues(financials?.rows.find((row) => row.label.includes("매출"))?.rawValues);
  const operatingIncome = actualValues(financials?.rows.find((row) => row.label.includes("영업이익"))?.rawValues);
  const periods = actualIndexes.map((index) => financials!.periods[index]!.title);
  const currentPer = metricNumber(basics, "PER");
  const currentPbr = metricNumber(basics, "PBR");
  const input: CompanyFinancialScoreInput = {
    ...(finite(currentPer) ? { currentPer } : {}),
    ...(finite(currentPbr) ? { currentPbr } : {}),
    ...(basics.valuationHistory?.per ? { perHistory: basics.valuationHistory.per } : {}),
    ...(basics.valuationHistory?.pbr ? { pbrHistory: basics.valuationHistory.pbr } : {}),
    ...(basics.valuationHistory?.psr ? { psrHistory: basics.valuationHistory.psr } : {}),
    ...(basics.valuationHistory?.label ? { valuationHistoryLabel: basics.valuationHistory.label } : {}),
    ...(revenue.length ? { revenue } : {}),
    ...(operatingIncome.length ? { operatingIncome } : {}),
    ...(periods?.length ? { periods } : {}),
  };
  return Object.keys(input).length > 0 ? input : undefined;
}
