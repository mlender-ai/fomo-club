import type { CardFrontSignals } from "./card-front-hook";
import type { WyckoffAnalysis } from "./wyckoff-analysis";
import type { QuietMoneyTimeline } from "./quiet-money";

export const SIGNAL_TAXONOMY_VERSION = "m2.v2" as const;
export const SIGNAL_RESUME_MIN_SAMPLE = 30;

export const SIGNAL_TYPE_CODES = [
  "insider_cluster",
  "cluster_multi",
  "institution_streak",
  "foreign_streak",
  "volume_vacuum",
  "spring_candidate",
  "impulse",
  "pullback",
  "material_contract",
  "material_earnings",
  "material_regulatory",
  "material_other",
  "whale_inflow",
  "score_80_plus",
  "score_60_79",
  "score_below_60",
] as const;

export type SignalTypeCode = (typeof SIGNAL_TYPE_CODES)[number];

export const SIGNAL_TYPE_LABELS: Record<SignalTypeCode, string> = {
  insider_cluster: "내부자 클러스터 매수",
  cluster_multi: "다중 주체 클러스터",
  institution_streak: "기관 연속 순매수",
  foreign_streak: "외국인 연속 순매수",
  volume_vacuum: "거래량 진공",
  spring_candidate: "스프링 후보",
  impulse: "임펄스",
  pullback: "눌림목",
  material_contract: "계약·수주 재료",
  material_earnings: "실적 재료",
  material_regulatory: "규제·승인 재료",
  material_other: "기타 확인 재료",
  whale_inflow: "고래 유입",
  score_80_plus: "종합 점수 80점 이상",
  score_60_79: "종합 점수 60–79점",
  score_below_60: "종합 점수 60점 미만",
};

const SIGNAL_TYPE_SET = new Set<string>(SIGNAL_TYPE_CODES);

export interface SignalResumeMetric {
  n: number;
  winRate: number | null;
  medianReturn: number | null;
}

export interface StandardSignalInput {
  headline?: string;
  reason?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  signals?: Partial<CardFrontSignals>;
  wyckoff?: WyckoffAnalysis;
  companyScore?: number;
  quietMoney?: QuietMoneyTimeline;
}

const CONTRACT = /계약|수주|공급|납품|파트너십|contract|order|supply|partnership/i;
const EARNINGS = /실적|매출|영업이익|순이익|가이던스|earnings|revenue|profit|guidance|results/i;
const REGULATORY = /규제|승인|허가|임상|FDA|SEC\s*(?:승인|소송)|법안|regulat|approval|clearance|trial/i;
const MATERIAL = /공시|DART|filing|8-K|10-Q|10-K|발표|보도|disclosure/i;

function recentWyckoffKinds(analysis: WyckoffAnalysis | undefined): Set<string> {
  if (!analysis || analysis.sourceLength <= 0) return new Set();
  const cutoff = Math.max(0, analysis.sourceLength - 20);
  return new Set(analysis.events.filter((event) => event.index >= cutoff).map((event) => event.kind));
}

export function isSignalTypeCode(value: unknown): value is SignalTypeCode {
  return typeof value === "string" && SIGNAL_TYPE_SET.has(value);
}

/** Registry order is product priority, so UI and ledger remain deterministic. */
export function normalizeSignalTypeCodes(values: readonly unknown[]): SignalTypeCode[] {
  const selected = new Set(values.filter(isSignalTypeCode));
  return SIGNAL_TYPE_CODES.filter((code) => selected.has(code));
}

export function signalTypeLabel(code: SignalTypeCode): string {
  return SIGNAL_TYPE_LABELS[code];
}

export function inferStandardSignalTypes(input: StandardSignalInput): SignalTypeCode[] {
  const text = [input.headline, input.reason, input.sourceLabel].filter(Boolean).join(" ");
  const types: SignalTypeCode[] = [];

  if (/내부자.{0,16}(?:클러스터|동반\s*매수)|(?:내부자|임원)\s*\d+\s*(?:명|인).{0,16}매수|insider.{0,16}cluster/i.test(text)) {
    types.push("insider_cluster");
  }
  if (input.quietMoney?.cluster?.type === "cluster_multi" || /(?:다중\s*주체|동시\s*유입).{0,20}(?:클러스터|주체)/i.test(text)) {
    types.push("cluster_multi");
  }
  if ((input.signals?.institutionNetStreak ?? 0) >= 3 || /기관.{0,12}\d+일.{0,12}(?:연속\s*)?순매수/i.test(text)) {
    types.push("institution_streak");
  }
  if ((input.signals?.foreignNetStreak ?? 0) >= 3 || /외국인.{0,12}\d+일.{0,12}(?:연속\s*)?순매수/i.test(text)) {
    types.push("foreign_streak");
  }
  if (/거래(?:량)?\s*진공|진공.{0,12}(?:유입|거래)|volume\s*vacuum/i.test(text)) types.push("volume_vacuum");

  const wyckoff = recentWyckoffKinds(input.wyckoff);
  if (wyckoff.has("spring")) types.push("spring_candidate");
  if (wyckoff.has("impulse")) types.push("impulse");
  if (wyckoff.has("pullback")) types.push("pullback");

  if (CONTRACT.test(text)) types.push("material_contract");
  if (EARNINGS.test(text)) types.push("material_earnings");
  if (REGULATORY.test(text)) types.push("material_regulatory");
  if (!types.some((type) => type.startsWith("material_")) && (Boolean(input.sourceUrl) || MATERIAL.test(text))) {
    types.push("material_other");
  }
  if (/고래.{0,16}(?:유입|순매수|매집|축적)|whale.{0,16}(?:inflow|accumulat|buying)/i.test(text)) {
    types.push("whale_inflow");
  }

  if (typeof input.companyScore === "number" && Number.isFinite(input.companyScore)) {
    types.push(input.companyScore >= 80 ? "score_80_plus" : input.companyScore >= 60 ? "score_60_79" : "score_below_60");
  }
  return normalizeSignalTypeCodes(types);
}

function compactPercent(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

export function formatSignalResumeBadge(code: SignalTypeCode, metric: SignalResumeMetric): string {
  const label = signalTypeLabel(code);
  if (metric.n < SIGNAL_RESUME_MIN_SAMPLE || metric.winRate === null) {
    return "";
  }
  return `${label} · 역대 30일 승률 ${compactPercent(metric.winRate)}%`;
}

/** Good long-run evidence can move ranking slightly, never dominate today's signal. */
export function signalPerformanceBonus(
  codes: readonly SignalTypeCode[],
  metrics: Readonly<Partial<Record<SignalTypeCode, SignalResumeMetric>>>
): number {
  const qualified = codes.flatMap((code) => {
    const metric = metrics[code];
    return metric && metric.n >= SIGNAL_RESUME_MIN_SAMPLE && metric.winRate !== null ? [metric.winRate] : [];
  });
  if (qualified.length === 0) return 0;
  const best = Math.max(...qualified);
  return Math.round(Math.max(0, Math.min(3, (best - 50) / 10)) * 100) / 100;
}
