import type { DailyOhlcv } from "./technical-analysis";
import { SIGNAL_RESUME_MIN_SAMPLE, type SignalTypeCode } from "./signal-resume";

/**
 * 신호 성적 백테스트 — "이 신호, 과거엔 어땠나"의 산출 코어. WO-P2 §1.
 *
 * 순수 함수(네트워크·DB 0). 과거에 동일 신호가 발생한 시점의 종가를 진입가로 잡고,
 * N거래일 뒤 종가로 채점한다. 수집(openinsider 아카이브·수급 히스토리)과 저장은 apps/web 담당.
 *
 * 정직 규칙(WO-P2 §1):
 *  ① 실데이터 역산만 — 표본이 없으면 통계 자체를 만들지 않는다(null). 가짜 승률 금지.
 *  ② 방법론 문구를 산출물에 동봉한다(무엇을 어떻게 셌는지 카드가 그대로 말할 수 있게).
 *  ③ 원장(실전 기록) 표본이 SIGNAL_RESUME_MIN_SAMPLE 이상이면 백테스트를 실전 성적으로 교체한다.
 *
 * 절대 규칙: 상승만 말하지 않는다 — 승률과 함께 **하락 비율**을 항상 같이 산출한다(카드 표기의 짝).
 */

/** 채점 지평(거래일). 7일=단기 반응, 30일=WO 기준 지평. */
export const BACKTEST_HORIZONS = [7, 30] as const;
export type BacktestHorizon = (typeof BACKTEST_HORIZONS)[number];

/** 표본이 이보다 적으면 통계를 노출하지 않는다(정직 — 3건으로 "승률 67%" 금지). */
export const BACKTEST_MIN_SAMPLE = 12;

/** 백테스트 방법론 버전 — 산식이 바뀌면 올린다(저장된 통계와 함께 노출). */
export const BACKTEST_METHOD_VERSION = "bt.v1" as const;

/** 과거 신호 1건 — 발생일 + 그 종목의 일봉(발생일 포함, 날짜 오름차순). */
export interface BacktestSample {
  /** 종목 식별자(중복 제거·디버그용). */
  symbol: string;
  /** 신호 발생일 YYYY-MM-DD. 이 날(또는 직전) 종가가 진입가. */
  signalDate: string;
  /** 날짜 오름차순 일봉. 신호일 이후 최소 horizon 개 이상 있어야 채점된다. */
  candles: readonly DailyOhlcv[];
}

/** 신호 1건의 채점 결과 — horizon 별 수익률(%). 채점 불가한 지평은 생략. */
export interface ScoredSample {
  symbol: string;
  signalDate: string;
  /** 진입 종가. */
  entry: number;
  /** horizon(거래일) → 수익률(%). */
  returns: Partial<Record<BacktestHorizon, number>>;
}

function normalizeDate(d?: string): string {
  return (d ?? "").slice(0, 10).replace(/[^0-9-]/g, "");
}

/** YYYYMMDD(KR 캔들) → YYYY-MM-DD 정규화. 이미 하이픈이면 그대로. */
function canonicalDate(d?: string): string {
  const raw = (d ?? "").trim();
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return normalizeDate(raw);
}

function usableCandles(candles: readonly DailyOhlcv[]): DailyOhlcv[] {
  return candles.filter((c) => Number.isFinite(c.close) && c.close > 0 && canonicalDate(c.date));
}

/**
 * 신호 1건 채점 — 신호일(또는 직전 거래일) 종가 대비 N거래일 뒤 종가 수익률(%).
 * 신호일 이후 봉이 모자라면 그 지평은 생략(미래를 지어내지 않는다). 채점 0개면 null.
 */
export function scoreBacktestSample(sample: BacktestSample): ScoredSample | null {
  const candles = usableCandles(sample.candles).sort((a, b) =>
    canonicalDate(a.date).localeCompare(canonicalDate(b.date))
  );
  if (candles.length === 0) return null;

  const target = canonicalDate(sample.signalDate);
  if (!target) return null;

  // 진입 = 신호일 종가. 그날 봉이 없으면(휴장·공시 시차) 직전 거래일 종가.
  let entryIdx = -1;
  for (let i = 0; i < candles.length; i += 1) {
    if (canonicalDate(candles[i]!.date) <= target) entryIdx = i;
    else break;
  }
  if (entryIdx < 0) return null;
  const entry = candles[entryIdx]!.close;
  if (!(entry > 0)) return null;

  const returns: Partial<Record<BacktestHorizon, number>> = {};
  for (const horizon of BACKTEST_HORIZONS) {
    const exit = candles[entryIdx + horizon];
    if (!exit || !(exit.close > 0)) continue; // 미래 봉 없음 → 그 지평 미채점
    returns[horizon] = ((exit.close - entry) / entry) * 100;
  }
  if (Object.keys(returns).length === 0) return null;
  return { symbol: sample.symbol, signalDate: sample.signalDate, entry, returns };
}

/** 한 지평의 집계 — 승률·하락률·중앙값·표본수. 상승만 말하지 않기 위해 downRate 를 항상 포함. */
export interface HorizonStats {
  /** 채점된 표본 수. */
  n: number;
  /** 오른 건수. */
  up: number;
  /** 승률 0~100(%). */
  winRate: number;
  /** 내린 건수(보합 제외) — "10번 중 4번은 내렸어요"의 원료. */
  down: number;
  /** 하락 비율 0~100(%). */
  downRate: number;
  /** 수익률 중앙값(%). */
  medianReturn: number;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function aggregateHorizon(returns: readonly number[]): HorizonStats | null {
  if (returns.length === 0) return null;
  const up = returns.filter((r) => r > 0).length;
  const down = returns.filter((r) => r < 0).length;
  return {
    n: returns.length,
    up,
    winRate: round1((up / returns.length) * 100),
    down,
    downRate: round1((down / returns.length) * 100),
    medianReturn: round1(median(returns)),
  };
}

/** 신호 유형 1개의 성적 — 지평별 집계 + 출처(백테스트/실전)와 방법론. */
export interface SignalStats {
  type: SignalTypeCode;
  /** "backtest" = 과거 역산, "ledger" = 우리 원장의 실전 기록(n≥30 시 승격). */
  source: "backtest" | "ledger";
  /** 지평(거래일) → 집계. 표본 미달 지평은 생략. */
  horizons: Partial<Record<BacktestHorizon, HorizonStats>>;
  /** 산출일 YYYY-MM-DD. */
  computedAt: string;
  /** 방법론 한 줄 — 카드가 그대로 인용할 수 있는 문장(WO-P2 정직 규칙 ②). */
  method: string;
  /** 산식 버전. */
  methodVersion: string;
}

export interface AggregateOptions {
  type: SignalTypeCode;
  computedAt: string;
  source?: "backtest" | "ledger";
  /** 노출 최소 표본(기본 BACKTEST_MIN_SAMPLE). */
  minSample?: number;
}

/**
 * 채점된 표본 → 신호 유형 통계. 지평별로 최소 표본 미달이면 그 지평을 버린다(정직).
 * 모든 지평이 미달이면 null — 카드는 그 블록을 통째로 숨긴다(빈 껍데기 금지).
 */
export function aggregateSignalStats(
  scored: readonly ScoredSample[],
  opts: AggregateOptions
): SignalStats | null {
  const minSample = opts.minSample ?? BACKTEST_MIN_SAMPLE;
  const source = opts.source ?? "backtest";
  const horizons: Partial<Record<BacktestHorizon, HorizonStats>> = {};

  for (const horizon of BACKTEST_HORIZONS) {
    const returns = scored
      .map((s) => s.returns[horizon])
      .filter((r): r is number => typeof r === "number" && Number.isFinite(r));
    const stats = aggregateHorizon(returns);
    if (stats && stats.n >= minSample) horizons[horizon] = stats;
  }

  if (Object.keys(horizons).length === 0) return null;

  const n = horizons[30]?.n ?? horizons[7]?.n ?? 0;
  const method =
    source === "ledger"
      ? `우리가 실제로 골랐던 같은 신호 ${n}건을 30일 뒤 종가로 채점한 결과예요.`
      : `과거 ${n}건의 같은 신호를 신호 발생일 종가에 사서 30일(거래일) 뒤 종가로 채점한 결과예요.`;

  return {
    type: opts.type,
    source,
    horizons,
    computedAt: opts.computedAt,
    method,
    methodVersion: BACKTEST_METHOD_VERSION,
  };
}

/** 표본 배열 → 통계(채점 + 집계 한 번에). 채점 불가 표본은 조용히 제외. */
export function backtestSignal(
  samples: readonly BacktestSample[],
  opts: AggregateOptions
): SignalStats | null {
  const scored = samples
    .map(scoreBacktestSample)
    .filter((s): s is ScoredSample => s !== null);
  return aggregateSignalStats(scored, opts);
}

/**
 * 원장(실전) 성적이 충분히 쌓였으면 그걸로 교체(WO-P2 정직 규칙 ③).
 * 기준은 signal-resume 과 동일한 SIGNAL_RESUME_MIN_SAMPLE(30) — 두 곳이 다른 잣대를 쓰지 않게.
 */
export function preferLedgerStats(
  backtest: SignalStats | null,
  ledger: SignalStats | null
): SignalStats | null {
  const ledgerN = ledger?.horizons[30]?.n ?? ledger?.horizons[7]?.n ?? 0;
  if (ledger && ledgerN >= SIGNAL_RESUME_MIN_SAMPLE) return ledger;
  return backtest;
}

/**
 * 카드 문구 — "비슷한 매수 40번 중 26번 올랐어요 (65%) · 30일 중앙값 +4.9% · 10번 중 4번은 내렸어요".
 * 상승만 말하지 않는다: 승률과 하락 표현을 **한 문장 세트**로 만들어 분리 불가능하게 한다(WO-P2 §2).
 * 통계가 없으면 null → 호출부는 블록 자체를 숨긴다.
 */
export interface SignalStatsCopy {
  /** "비슷한 신호 40번 중 26번 올랐어요 (65%)" */
  headline: string;
  /** "30일 뒤 중앙값 +4.9% · 10번 중 4번은 내렸어요" */
  detail: string;
  /** 방법론 한 줄. */
  method: string;
  /** 통계 출처 배지 문구. */
  sourceLabel: string;
}

/** 하락 건수를 "10번 중 N번" 감각으로 — 비율을 10 기준으로 반올림(0/10 은 만들지 않는다). */
function outOfTen(rate: number): number {
  const raw = Math.round(rate / 10);
  if (rate > 0 && raw === 0) return 1; // 실제로 내린 적이 있으면 최소 1로(하락 은폐 금지)
  if (rate < 100 && raw === 10) return 9;
  return raw;
}

export function buildSignalStatsCopy(stats: SignalStats | null): SignalStatsCopy | null {
  if (!stats) return null;
  const h = stats.horizons[30] ?? stats.horizons[7];
  if (!h) return null;
  const horizonDays = stats.horizons[30] ? 30 : 7;

  const sign = h.medianReturn > 0 ? "+" : "";
  const headline = `비슷한 신호 ${h.n}번 중 ${h.up}번 올랐어요 (${Math.round(h.winRate)}%)`;
  const downPart =
    h.down > 0
      ? `10번 중 ${outOfTen(h.downRate)}번은 내렸어요`
      : `표본 안에선 내린 적이 없었지만 다음에도 그렇다는 뜻은 아니에요`;
  const detail = `${horizonDays}일 뒤 중앙값 ${sign}${h.medianReturn}% · ${downPart}`;

  return {
    headline,
    detail,
    method: stats.method,
    sourceLabel: stats.source === "ledger" ? "우리 실전 기록" : "과거 데이터 역산",
  };
}
