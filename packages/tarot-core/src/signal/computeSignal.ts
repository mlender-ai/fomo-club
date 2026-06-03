import type { MarketSnapshot, MarketCondition } from "../types.js";
import type { FinancialContext } from "../prompts/interpret-v2.2.0.js";

/**
 * Signal Engine (B4) — 타로 해석의 결정론적 "척추".
 *
 * docs/AGENT_HARNESS_ROADMAP.md B4 구현. 시장/재무 신호를 결정론적으로 0~100 점수 +
 * 등급 + 정량 드라이버 + 시간축 trajectory 로 분해한다. 점수 자체는 사용자에게 노출하지
 * 않는 *내부 척추*이며(투자권유 아님), 타로 프롬프트(interpret-v2.5.0)가 이 드라이버를
 * 구체 사실로 접지해 해석을 날카롭게 만든다.
 *
 * 드라이버 detail 은 "사실 묘사"(예: "RSI 68 — 상승 우위", "매출성장 +30%")이지 매매
 * 신호가 아니다. 순수 함수 — packages/tarot-core/src/__tests__/compute-signal.test.ts 검증.
 *
 * 재사용: apps/web/lib/tarot/market.ts inferCondition 의 bull/bear 가중 로직을 0~100 으로
 * 일반화하고 드라이버별 기여도로 분해한 형태.
 */

export type SignalGrade = "S" | "AA" | "A" | "B" | "C";

export interface SignalDriver {
  key: string;
  /** 짧은 라벨 (예: "RSI", "매출성장") */
  label: string;
  /** 정량 사실 묘사 (예: "RSI 68 — 상승 우위") */
  detail: string;
  /** 점수 기여 방향 */
  direction: "up" | "down" | "flat";
  /** 정규화 기여도 [-1, 1] */
  contribution: number;
  /** 가중치 (중요도) */
  weight: number;
  kind: "technical" | "fundamental";
}

export interface Signal {
  /** 내부 척추 점수 0~100 (사용자 미노출) */
  score: number;
  grade: SignalGrade;
  /** 점수에서 파생한 흐름 상태 */
  state: MarketCondition;
  /** 기여도순 정렬된 드라이버 */
  drivers: SignalDriver[];
  /** 단일 스냅샷에서 파생한 시간축 문장 (지속성 DB 없이 1y 캔들 기반) */
  trajectory: string[];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function dirOf(c: number): "up" | "down" | "flat" {
  if (c > 0.05) return "up";
  if (c < -0.05) return "down";
  return "flat";
}

interface DriverSpec {
  key: string;
  label: string;
  kind: "technical" | "fundamental";
  weight: number;
  /** 입력이 없으면 null(드라이버 제외), 있으면 [기여도, detail] */
  evaluate(m: MarketSnapshot, ctx?: FinancialContext): [number, string] | null;
}

const SPECS: DriverSpec[] = [
  {
    key: "rsi",
    label: "RSI",
    kind: "technical",
    weight: 1.2,
    evaluate: (m) => {
      if (m.rsi == null) return null;
      const c = clamp((m.rsi - 50) / 30, -1, 1);
      // 판정어는 중립 기술용어로 — "우위" 같은 방향성 우열 암시 회피(규제)
      const tone =
        m.rsi >= 70 ? "과열권" : m.rsi <= 30 ? "침체권" : m.rsi >= 55 ? "상승 구간" : m.rsi <= 45 ? "하락 구간" : "중립";
      return [c, `RSI ${m.rsi.toFixed(0)} — ${tone}`];
    },
  },
  {
    key: "macd",
    label: "MACD",
    kind: "technical",
    weight: 1.0,
    evaluate: (m) => {
      if (m.macdHistogram == null) return null;
      const c = m.macdHistogram > 0 ? 0.6 : m.macdHistogram < 0 ? -0.6 : 0;
      return [c, `MACD 히스토그램 ${m.macdHistogram > 0 ? "양(+)" : m.macdHistogram < 0 ? "음(-)" : "0"}`];
    },
  },
  {
    key: "sma200",
    label: "200일선",
    kind: "technical",
    weight: 1.1,
    evaluate: (m) => {
      if (m.sma200 == null || !m.price) return null;
      const above = m.price >= m.sma200;
      const days = m.daysAboveSma200 != null && above ? ` ${m.daysAboveSma200}봉째` : "";
      return [above ? 0.7 : -0.7, `200일선 ${above ? "위" : "아래"}${days}`];
    },
  },
  {
    key: "sma20",
    label: "20일선",
    kind: "technical",
    weight: 0.6,
    evaluate: (m) => {
      if (m.sma20 == null || !m.price) return null;
      const above = m.price >= m.sma20;
      return [above ? 0.4 : -0.4, `20일선 ${above ? "위" : "아래"}`];
    },
  },
  {
    key: "pos52w",
    label: "52주 위치",
    kind: "technical",
    weight: 0.9,
    evaluate: (m) => {
      if (m.fiftyTwoWeekPosition == null) return null;
      const c = clamp((m.fiftyTwoWeekPosition - 0.5) * 2, -1, 1);
      return [c, `52주 범위 ${Math.round(m.fiftyTwoWeekPosition * 100)}% 지점`];
    },
  },
  {
    key: "momentum20",
    label: "모멘텀",
    kind: "technical",
    weight: 1.0,
    evaluate: (m) => {
      if (m.momentum20 == null) return null;
      const c = clamp(m.momentum20 / 15, -1, 1);
      return [c, `최근 20봉 ${m.momentum20 > 0 ? "+" : ""}${m.momentum20.toFixed(0)}%`];
    },
  },
  {
    key: "change",
    label: "당일",
    kind: "technical",
    weight: 0.4,
    evaluate: (m) => {
      if (!Number.isFinite(m.changePercent)) return null;
      const c = clamp(m.changePercent / 5, -1, 1);
      return [c, `당일 ${m.changePercent > 0 ? "+" : ""}${m.changePercent.toFixed(1)}%`];
    },
  },
  {
    key: "revenueGrowth",
    label: "매출성장",
    kind: "fundamental",
    weight: 1.0,
    evaluate: (_m, ctx) => {
      if (ctx?.revenueGrowth == null) return null;
      const c = clamp(ctx.revenueGrowth / 0.3, -1, 1);
      return [c, `매출성장 ${ctx.revenueGrowth > 0 ? "+" : ""}${Math.round(ctx.revenueGrowth * 100)}%`];
    },
  },
  {
    key: "profitMargins",
    label: "순이익률",
    kind: "fundamental",
    weight: 0.7,
    evaluate: (_m, ctx) => {
      if (ctx?.profitMargins == null) return null;
      const c = clamp((ctx.profitMargins - 0.1) / 0.2, -1, 1);
      return [c, `순이익률 ${Math.round(ctx.profitMargins * 100)}%`];
    },
  },
  {
    key: "roe",
    label: "ROE",
    kind: "fundamental",
    weight: 0.6,
    evaluate: (_m, ctx) => {
      if (ctx?.returnOnEquity == null) return null;
      const c = clamp((ctx.returnOnEquity - 0.1) / 0.2, -1, 1);
      return [c, `ROE ${Math.round(ctx.returnOnEquity * 100)}%`];
    },
  },
  {
    key: "debt",
    label: "부채비율",
    kind: "fundamental",
    weight: 0.6,
    evaluate: (_m, ctx) => {
      if (ctx?.debtToEquity == null) return null;
      const c = clamp(-(ctx.debtToEquity - 100) / 150, -1, 1);
      return [c, `부채비율 ${Math.round(ctx.debtToEquity)}`];
    },
  },
];

function gradeOf(score: number): SignalGrade {
  if (score >= 90) return "S";
  if (score >= 80) return "AA";
  if (score >= 65) return "A";
  if (score >= 45) return "B";
  return "C";
}

function stateOf(score: number, m: MarketSnapshot): MarketCondition {
  if (m.condition === "volatile") return "volatile";
  if (score >= 65) return "bullish";
  if (score <= 35) return "bearish";
  if (m.condition === "consolidating") return "consolidating";
  return "neutral";
}

function buildTrajectory(m: MarketSnapshot): string[] {
  const out: string[] = [];
  if (m.daysAboveSma200 != null && m.daysAboveSma200 > 0) {
    out.push(`200일선 위 흐름을 ${m.daysAboveSma200}봉째 이어가는 중`);
  }
  if (m.momentum20 != null) {
    out.push(
      m.momentum20 >= 0
        ? `최근 20봉 모멘텀 +${m.momentum20.toFixed(0)}% — 위로 기운 흐름`
        : `최근 20봉 모멘텀 ${m.momentum20.toFixed(0)}% — 아래로 눌린 흐름`,
    );
  }
  return out;
}

/**
 * 시장·재무 스냅샷을 결정론적 신호로 분해.
 * 점수 = 50 + 50 * (가중기여 평균). 드라이버는 weight*|기여| 내림차순.
 */
export function computeSignal(market: MarketSnapshot, ctx?: FinancialContext): Signal {
  const drivers: SignalDriver[] = [];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const spec of SPECS) {
    const r = spec.evaluate(market, ctx);
    if (!r) continue;
    const [contribution, detail] = r;
    drivers.push({
      key: spec.key,
      label: spec.label,
      detail,
      direction: dirOf(contribution),
      contribution,
      weight: spec.weight,
      kind: spec.kind,
    });
    weightedSum += contribution * spec.weight;
    totalWeight += spec.weight;
  }

  const norm = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const score = Math.round(clamp(50 + 50 * norm, 1, 99));

  drivers.sort((a, b) => Math.abs(b.contribution) * b.weight - Math.abs(a.contribution) * a.weight);

  return {
    score,
    grade: gradeOf(score),
    state: stateOf(score, market),
    drivers,
    trajectory: buildTrajectory(market),
  };
}
