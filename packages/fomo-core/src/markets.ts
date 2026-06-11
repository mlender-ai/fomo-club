import { clampScore, scoreToState } from "./state";
import type { FomoState } from "./types";
import type { MacroQuote, WhaleInput } from "./banner";

/**
 * 시장별 FOMO 점수 — 나스닥·비트코인·코스피를 각각 0~100 체감 점수로. docs/PIVOT_FEED_FIRST.md.
 *
 * 홈 상단 캐러셀용. FOMO Index(시장 종합)와 같은 0~100 스케일·색·구간을 쓰되,
 * 자산 1개의 오늘 등락을 "얼마나 뜨거운가"로 환산한다. 등락률(실측)은 근거로 함께 노출.
 * 정직한 숫자 원칙: change 결측 자산은 점수를 만들지 않고 생략한다.
 */

/** 등락률 → 점수 환산 계수. 0%=중립 50, +k%마다 SLOPE 가산. */
const NEUTRAL = 50;
const SLOPE = 8;

/**
 * 등락률(%) → FOMO 체감 점수 0~100.
 * 0% → 50(관심), 상승=과열(높음), 하락=침체(낮음). 지수·코인 공통 단일 매핑.
 */
export function assetHeatScore(changePct: number): number {
  if (!Number.isFinite(changePct)) return NEUTRAL;
  return clampScore(NEUTRAL + changePct * SLOPE);
}

export interface MarketScore {
  /** 안정 키. */
  key: "ndq" | "btc" | "kospi";
  /** 표시 이름. */
  label: string;
  /** 0~100 FOMO 체감 점수. */
  score: number;
  /** 점수 구간 라벨(무관심~광기). */
  state: FomoState;
  /** 실측 등락률(%) — 근거로 표시. */
  changePct: number;
}

function macroChange(quotes: MacroQuote[], key: MacroQuote["key"]): number | null {
  const q = quotes.find((x) => x.key === key);
  return typeof q?.change === "number" ? q.change : null;
}

function coinChange(input: WhaleInput, symbol: string): number | null {
  const c = (input.coins ?? []).find((x) => x.symbol?.toLowerCase() === symbol.toLowerCase());
  return typeof c?.change24h === "number" ? c.change24h : null;
}

function scoreOf(key: MarketScore["key"], label: string, change: number | null): MarketScore | null {
  if (change === null) return null;
  const score = assetHeatScore(change);
  return { key, label, score, state: scoreToState(score), changePct: change };
}

/**
 * 거시·코인 데이터 → 캐러셀용 시장 점수 [나스닥, 비트코인, 코스피].
 * 데이터 결측 자산은 생략(가짜 점수 금지). 셋 다 없으면 빈 배열.
 */
export function buildMarketScores(macro: MacroQuote[], whale: WhaleInput): MarketScore[] {
  return [
    scoreOf("ndq", "나스닥", macroChange(macro, "ndq")),
    scoreOf("btc", "비트코인", coinChange(whale, "btc")),
    scoreOf("kospi", "코스피", macroChange(macro, "kospi")),
  ].filter((x): x is MarketScore => x !== null);
}
