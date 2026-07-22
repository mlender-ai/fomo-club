import type { StockBasics } from "../stock-basics";
import type { CardFrontSignals } from "./card-front-hook";
import type { CardVerdict } from "./verdict";
import type { WyckoffAnalysis } from "./wyckoff-analysis";
import type { QuietMoneyTimeline } from "./quiet-money";

export type CompanyScoreAxisKey = "valuation" | "growth" | "profitability" | "flow" | "chart" | "quiet";

export interface CompanyScoreAxis {
  key: CompanyScoreAxisKey;
  label: string;
  score: number;
  evidence: string[];
}

export interface CompanyScoreAxisState {
  key: CompanyScoreAxisKey;
  label: string;
  status: "available" | "missing";
  score: number | null;
  evidence: string[];
  missingReason?: "데이터 없음";
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
  signals?: Pick<CardFrontSignals, "foreignNetStreak" | "institutionNetStreak" | "volumeRatio" | "changePct">;
  insiderPurchaseConfirmed?: boolean;
  whaleStrength?: number;
  quietMoney?: QuietMoneyTimeline;
  verdict?: CardVerdict;
  wyckoff?: WyckoffAnalysis;
  currentPrice?: number;
  quiet?: CompanyQuietScoreInput;
  asOf?: string;
}

export interface CompanyScoreResult {
  score: number | null;
  status: "ready" | "accumulating";
  label: string;
  interpretation: string;
  axes: CompanyScoreAxis[];
  axisStates: CompanyScoreAxisState[];
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
  const psrCandidate = { term: "PSR", value: financials.currentPsr, history: financials.psrHistory };
  const pbrCandidate = { term: "PBR", value: financials.currentPbr, history: financials.pbrHistory };
  const candidates = useSales
    ? [psrCandidate, pbrCandidate]
    : [
        { term: "PER", value: financials.currentPer, history: financials.perHistory },
        pbrCandidate,
      ];
  const resolve = (list: readonly typeof psrCandidate[]) =>
    list.flatMap((candidate) => {
      const position = historicalPosition(candidate.value, candidate.history);
      return finite(candidate.value) && finite(position) ? [{ ...candidate, position }] : [];
    });
  // 적자기업은 PSR을 우선하되 PSR 밴드가 없는 경우 실측 PBR 밴드를 사용한다.
  // 흑자기업의 PER/PBR 미도달(미장 등) 시에는 PSR로 폴백한다.
  let available = resolve(candidates);
  if (useSales && available.some((item) => item.term === "PSR")) {
    available = available.filter((item) => item.term === "PSR");
  }
  if (available.length === 0 && !useSales) available = resolve([psrCandidate]);
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
  const volumeRatio = input.signals?.volumeRatio;
  const changePct = input.signals?.changePct;
  const whale = input.whaleStrength;
  const quietMoney = input.quietMoney;
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
  if (finite(volumeRatio) && volumeRatio >= 1.5) {
    const direction = finite(changePct) && Math.abs(changePct) >= 0.3 ? Math.sign(changePct) : 0;
    const adjustment = Math.min(18, Math.round((volumeRatio - 1) * 10));
    score += adjustment * direction;
    evidence.push(
      `거래량 평소 ${volumeRatio.toFixed(1)}배${
        direction > 0 ? " · 가격 동반 상승" : direction < 0 ? " · 가격 동반 하락" : " · 방향 확인 중"
      }`
    );
  }
  if (finite(whale)) {
    score += clamp(whale, -1, 1) * 25;
    evidence.push(`고래 신호 강도 ${whale.toFixed(2)}`);
  }
  if (quietMoney?.cluster) {
    score += quietMoney.cluster.strength * 4;
    evidence.push(`${quietMoney.cluster.headline} · 강도 ${quietMoney.cluster.strength}/5`);
  }
  if (evidence.length === 0) return undefined;
  return { key: "flow", label: AXIS_LABEL.flow, score: Math.round(clamp(score)), evidence };
}

function chartAxis(input: CompanyScoreInput): CompanyScoreAxis {
  const phase = input.wyckoff?.currentZone?.kind ?? input.verdict?.phase;
  const events = input.wyckoff?.events ?? [];
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
  if (evidence.length === 0) evidence.push("판정 가능한 차트 구간·이벤트 없음");
  return { key: "chart", label: AXIS_LABEL.chart, score: Math.round(clamp(score)), evidence };
}

function quietAxis(quiet: CompanyQuietScoreInput | undefined): CompanyScoreAxis | undefined {
  if (!quiet || !finite(quiet.quietScore)) return undefined;
  const score = Math.round(clamp((quiet.quietScore / 80) * 100));
  // 사람 언어만 — 계산식(신호 X - 화제성 Y = Z)·quietScore 는 화면에 노출 금지(WO 번역 레이어).
  // 화제성(hypePenalty)이 낮을수록 "아직 조용한데 신호는 살아 있다"는 뜻.
  const quietHype = finite(quiet.hypePenalty) && quiet.hypePenalty <= 1;
  const evidence =
    score >= 60
      ? quietHype
        ? "아직 크게 주목받지 않은 채 가격·거래 신호만 조용히 쌓이고 있어요."
        : "화제보다 실제 신호가 앞선 조용한 구간이에요."
      : "관심이 붙기 시작해 조용함은 옅어지는 중이에요.";
  return { key: "quiet", label: AXIS_LABEL.quiet, score, evidence: [evidence] };
}

function axisOf(axes: readonly CompanyScoreAxis[], key: CompanyScoreAxisKey): CompanyScoreAxis | undefined {
  return axes.find((axis) => axis.key === key);
}

// WO-2 — 점수를 "숫자 나열"이 아니라 "평가"로. 결론(강약점 조합) → 근거(수치는 괄호 보조) → 관전 포인트.
// 카드 훅 = 결론 문장, 뎁스 = 결론+근거+관전 3단 전체(같은 결론에서 파생). 분석가 어휘(격차·비대칭·뒤를 이어)·
// 순위 나열·문장 첫 절의 수치는 금지 — 아래 사전은 전부 유저어 서술이고 수치는 근거절 괄호로만 들어간다.
const STRONG_AXIS = 65;
const WEAK_AXIS = 40;
const VERY_STRONG_AXIS = 82; // 아주 강한 축 — 표현을 한 단계 세게
const SEVERE_WEAK_AXIS = 25; // 심각한 약점 — 표현을 한 단계 세게

// 결론절 [보통, 강함] — 강점 2개면 첫째는 연결형(~고), 마지막은 대조형(~는데)으로 약점 결론절 앞에 놓는다.
const STRENGTH_MID: Record<CompanyScoreAxisKey, [string, string]> = {
  valuation: ["값이 싸고", "아주 싸고"],
  growth: ["빠르게 크고", "폭발적으로 크고"],
  profitability: ["돈도 잘 벌고", "이익이 탄탄하고"],
  flow: ["큰손이 담고 있고", "큰손이 강하게 담고 있고"],
  chart: ["차트 자리도 좋고", "차트가 강하게 오르고"],
  quiet: ["아직 아무도 안 보고", "완전히 소외돼 있고"],
};
const STRENGTH_LEAD: Record<CompanyScoreAxisKey, [string, string]> = {
  valuation: ["값이 싼데", "아주 싼데"],
  growth: ["빠르게 크는데", "폭발적으로 크는데"],
  profitability: ["돈은 잘 버는데", "이익은 탄탄한데"],
  flow: ["큰손이 담고 있는데", "큰손이 강하게 담는데"],
  chart: ["차트 자리는 좋은데", "차트는 강하게 오르는데"],
  quiet: ["아직 아무도 안 보는데", "완전히 소외돼 있는데"],
};
const WEAKNESS_TAIL: Record<CompanyScoreAxisKey, [string, string]> = {
  valuation: ["값이 비싼 게 걸려요", "값이 너무 비싼 게 걸려요"],
  growth: ["성장이 둔해진 게 걸려요", "성장이 멈춘 게 걸려요"],
  profitability: ["이익이 얇은 게 걸려요", "적자라 체력이 약해요"],
  flow: ["큰손은 아직 안 붙었어요", "큰손이 오히려 빠지는 중이에요"],
  chart: ["차트 흐름이 약한 게 아쉬워요", "차트가 꺾인 게 걸려요"],
  quiet: ["관심이 붙기 시작한 게 부담이에요", "이미 관심이 몰린 게 부담이에요"],
};
const strengthMid = (axis: CompanyScoreAxis): string => STRENGTH_MID[axis.key][axis.score >= VERY_STRONG_AXIS ? 1 : 0];
const strengthLead = (axis: CompanyScoreAxis): string => STRENGTH_LEAD[axis.key][axis.score >= VERY_STRONG_AXIS ? 1 : 0];
const weaknessTail = (axis: CompanyScoreAxis): string => WEAKNESS_TAIL[axis.key][axis.score <= SEVERE_WEAK_AXIS ? 1 : 0];

// 근거절 — 유저어 서술 + 괄호 안 친근 라벨·수치(문장 주어가 되지 않게).
const PAREN_LABEL: Record<CompanyScoreAxisKey, string> = {
  valuation: "가격 매력",
  growth: "성장",
  profitability: "수익 체력",
  flow: "큰손 수급",
  chart: "차트 타이밍",
  quiet: "주목도",
};
const STRENGTH_DETAIL: Record<CompanyScoreAxisKey, string> = {
  valuation: "과거보다 싼 가격대에 있어요",
  growth: "매출이 빠르게 크고 있어요",
  profitability: "이익을 꾸준히 내고 있어요",
  flow: "큰손이 담기 시작했어요",
  chart: "차트 자리가 유리해요",
  quiet: "아직 주목을 덜 받고 있어요",
};
const WEAKNESS_DETAIL: Record<CompanyScoreAxisKey, string> = {
  valuation: "값이 부담스러운 수준이에요",
  growth: "매출 성장이 둔해요",
  profitability: "아직 이익이 얇아요",
  flow: "큰손 매수는 아직이에요",
  chart: "차트 흐름이 약해요",
  quiet: "이미 관심이 많이 몰렸어요",
};
// 관전 포인트 — 무엇이 바뀌면 판단이 달라지나. 약점 축이 있으면 그 축을, 없으면 강점 유지 여부를 본다.
const WEAKNESS_WATCH: Record<CompanyScoreAxisKey, string> = {
  valuation: "비싼 값을 실적이 정당화하는지가 관건이에요.",
  growth: "성장이 다시 살아나는 실적이 확인되면 그때가 신호예요.",
  profitability: "적자가 줄어드는 흐름이 나오는지 봐야 해요.",
  flow: "큰손이 들어오기 시작하면 그때가 신호예요.",
  chart: "차트가 바닥을 다지고 돌아서는 자리가 관심 구간이에요.",
  quiet: "과열이 식고 눌릴 때를 노려볼 만해요.",
};

function bandTone(score: number): string {
  if (score >= 80) return "지금 조건이 꽤 잘 맞아떨어져요";
  if (score >= 65) return "괜찮은 구석과 걸리는 구석이 같이 있어요";
  if (score >= 50) return "아직은 지켜볼 자리예요";
  return "지금은 좋게 보기 어려운 자리예요";
}

function paren(axis: CompanyScoreAxis): string {
  return `${PAREN_LABEL[axis.key]} ${axis.score}`;
}

interface Evaluation {
  conclusion: string;
  full: string;
}

/**
 * 3단 평가 조립: [결론 한 줄] + [강점1·약점1 유저어, 수치는 괄호] + [관전 포인트].
 * 결론은 강·약점 조합에서 도출하므로 종목마다 달라진다(순위·격차 나열 없음). axes+score 만으로 동작해
 * withCompanyQuietScore 재도출(입력 {}) 에도 안전하다.
 */
function buildEvaluation(axes: readonly CompanyScoreAxis[], score: number): Evaluation {
  const empty = "검증 가능한 분석 축이 3개 미만이라 종합 점수를 보류했어요.";
  if (axes.length < 3) return { conclusion: "", full: empty };
  const strengths = axes.filter((axis) => axis.score >= STRONG_AXIS).sort((a, b) => b.score - a.score);
  const weaknesses = axes.filter((axis) => axis.score <= WEAK_AXIS).sort((a, b) => a.score - b.score);
  const s1 = strengths[0];
  const s2 = strengths[1];
  const w1 = weaknesses[0];

  // [1] 결론
  let conclusion: string;
  if (s1 && w1) {
    const lead = s2 ? `${strengthMid(s1)} ${strengthLead(s2)}` : strengthLead(s1);
    conclusion = `${lead}, ${weaknessTail(w1)}`;
  } else if (s1) {
    const lead = s2 ? `${strengthMid(s1)} ${strengthMid(s2)}` : strengthMid(s1);
    conclusion = `${lead}, ${bandTone(score)}`;
  } else if (w1) {
    conclusion = `${bandTone(score)}. ${weaknessTail(w1)}`;
  } else {
    const top = [...axes].sort((a, b) => b.score - a.score)[0]!;
    conclusion = `${bandTone(score)} — 그나마 ${PAREN_LABEL[top.key]}이 버텨주는 자리예요`;
  }

  // [2] 근거 (수치는 괄호 보조로만)
  let evidence: string;
  if (s1 && w1) {
    evidence = `${STRENGTH_DETAIL[s1.key]}(${paren(s1)}). 다만 ${WEAKNESS_DETAIL[w1.key]}(${paren(w1)}).`;
  } else if (s1) {
    const extra = s2 ? ` ${STRENGTH_DETAIL[s2.key]}(${paren(s2)}).` : "";
    evidence = `${STRENGTH_DETAIL[s1.key]}(${paren(s1)}).${extra}`;
  } else if (w1) {
    evidence = `${WEAKNESS_DETAIL[w1.key]}(${paren(w1)}).`;
  } else {
    const ranked = [...axes].sort((a, b) => b.score - a.score);
    const top = ranked[0]!;
    const bottom = ranked.at(-1)!;
    evidence = `뚜렷하게 강한 축도, 크게 걸리는 축도 없어요. ${PAREN_LABEL[top.key]}(${top.score})가 그나마 낫고 ${PAREN_LABEL[bottom.key]}(${bottom.score})가 아쉬운 편이에요.`;
  }

  // [3] 관전 포인트
  const watch = w1
    ? WEAKNESS_WATCH[w1.key]
    : s1
      ? "지금 흐름이 이어지는지, 과열 신호가 없는지 보면 돼요."
      : "방향이 잡히는지 조금 더 지켜보는 자리예요.";

  return { conclusion, full: `${conclusion}. ${evidence} ${watch}` };
}

function axisStates(axes: readonly CompanyScoreAxis[]): CompanyScoreAxisState[] {
  return ALL_AXES.map((key) => {
    const axis = axisOf(axes, key);
    return axis
      ? { ...axis, status: "available" as const }
      : {
          key,
          label: AXIS_LABEL[key],
          status: "missing" as const,
          score: null,
          evidence: [],
          missingReason: "데이터 없음" as const,
        };
  });
}

function resultFromAxes(axes: CompanyScoreAxis[], _input: CompanyScoreInput, asOf?: string): CompanyScoreResult {
  const ready = axes.length >= 3;
  const score = ready ? Math.round(axes.reduce((sum, axis) => sum + axis.score, 0) / axes.length) : null;
  // 카드 훅(label)=결론 문장, 뎁스(interpretation)=결론+근거+관전 — 같은 평가에서 파생(WO-2).
  const evaluation = ready ? buildEvaluation(axes, score!) : { conclusion: "", full: "" };
  return {
    score,
    status: ready ? "ready" : "accumulating",
    label: evaluation.conclusion,
    interpretation: evaluation.full,
    axes,
    axisStates: axisStates(axes),
    availableAxisCount: axes.length,
    omittedAxes: ALL_AXES.filter((key) => !axes.some((axis) => axis.key === key)),
    ...(asOf ? { asOf } : {}),
  };
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
  return resultFromAxes(axes, input, input.asOf);
}

export function withCompanyQuietScore(
  base: CompanyScoreResult | undefined,
  quiet: CompanyQuietScoreInput,
  asOf?: string
): CompanyScoreResult {
  const quietScoreAxis = quietAxis(quiet);
  const axes = [...(base?.axes ?? []).filter((axis) => axis.key !== "quiet"), ...(quietScoreAxis ? [quietScoreAxis] : [])];
  const resultAsOf = asOf ?? base?.asOf;
  return resultFromAxes(axes, {}, resultAsOf);
}

/** 카드에서 찍힌 기준 시점 점수를 상세에서도 고정한다. 검색 진입처럼 seed가 없을 때만 최신 점수를 쓴다. */
export function mergeCompanyScoreResults(
  seed: CompanyScoreResult | undefined,
  fresh: CompanyScoreResult | undefined
): CompanyScoreResult | undefined {
  return seed ?? fresh;
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
