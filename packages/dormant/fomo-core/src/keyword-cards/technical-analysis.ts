import type { FomoScoreResult } from "./fomo-score";

export interface DailyOhlcv {
  date?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type TaFactKind =
  | "accumulation_divergence"
  | "bollinger_squeeze"
  | "rsi_overbought"
  | "rsi_oversold"
  | "ma_bullish"
  | "ma_bearish"
  | "macd_bullish"
  | "macd_bearish"
  | "near_52w_high"
  | "near_52w_low"
  | "atr_expanded";

export type TaFactRole = "confirmation" | "balance" | "event";
export type TaConfidence = "high" | "low";

export interface TaFact {
  kind: TaFactKind;
  role: TaFactRole;
  confidence: TaConfidence;
  text: string;
}

export interface TechnicalAnalysisSnapshot {
  facts: TaFact[];
  latest?: {
    rsi14?: number;
    macd?: number;
    macdSignal?: number;
    bollingerWidthPct?: number;
    atrPct?: number;
    closeTo52WeekHighPct?: number;
    closeTo52WeekLowPct?: number;
  };
  inputs: {
    accumulationDivergence?: boolean;
    bollingerSqueeze?: boolean;
    trendStrength?: number;
  };
}

const ACTION_HINT =
  /사라|팔아라|사세요|파세요|추천|매수|매도|들어가|진입|손절|익절|목표가|오른다|오를\s*(?:거|것|듯|전망|예정)|내린다|내릴\s*(?:거|것|듯)|반등할|조정받|급등할|폭등|폭락|떡상|떡락|가즈아/;

export function isTaFactTextSafe(text: string): boolean {
  const neutral = text.replace(/과매수|과매도/g, "상태").replace(/매집/g, "구조");
  return !ACTION_HINT.test(neutral);
}

const num = (x: number | undefined): x is number => typeof x === "number" && Number.isFinite(x);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

function sma(values: readonly number[], n: number): number | undefined {
  if (values.length < n) return undefined;
  const slice = values.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / n;
}

function std(values: readonly number[]): number {
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - avg) ** 2, 0) / values.length;
  return Math.sqrt(v);
}

function emaSeries(values: readonly number[], n: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (n + 1);
  const out: number[] = [values[0]!];
  for (let i = 1; i < values.length; i += 1) out.push(values[i]! * k + out[i - 1]! * (1 - k));
  return out;
}

function rsi14(closes: readonly number[]): number | undefined {
  if (closes.length < 15) return undefined;
  let gain = 0;
  let loss = 0;
  for (let i = closes.length - 14; i < closes.length; i += 1) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  if (gain === 0 && loss === 0) return 50;
  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

function macd(closes: readonly number[]): { macd: number; signal: number; prevMacd?: number; prevSignal?: number } | undefined {
  if (closes.length < 35) return undefined;
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const line = closes.map((_, i) => ema12[i]! - ema26[i]!);
  const signal = emaSeries(line, 9);
  const out: { macd: number; signal: number; prevMacd?: number; prevSignal?: number } = {
    macd: line[line.length - 1]!,
    signal: signal[signal.length - 1]!,
  };
  const prevMacd = line[line.length - 2];
  const prevSignal = signal[signal.length - 2];
  if (num(prevMacd)) out.prevMacd = prevMacd;
  if (num(prevSignal)) out.prevSignal = prevSignal;
  return out;
}

function bollingerWidths(closes: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 19; i < closes.length; i += 1) {
    const win = closes.slice(i - 19, i + 1);
    const mid = win.reduce((a, b) => a + b, 0) / win.length;
    if (mid <= 0) continue;
    out.push((4 * std(win) / mid) * 100);
  }
  return out;
}

function atrPct(candles: readonly DailyOhlcv[], n = 14): number | undefined {
  if (candles.length < n + 1) return undefined;
  const trs: number[] = [];
  for (let i = candles.length - n; i < candles.length; i += 1) {
    const c = candles[i]!;
    const prev = candles[i - 1]!;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)));
  }
  const close = candles[candles.length - 1]!.close;
  if (close <= 0) return undefined;
  return (trs.reduce((a, b) => a + b, 0) / n / close) * 100;
}

function obv(candles: readonly DailyOhlcv[]): number[] {
  const out = [0];
  for (let i = 1; i < candles.length; i += 1) {
    const prev = candles[i - 1]!;
    const cur = candles[i]!;
    const dir = cur.close > prev.close ? 1 : cur.close < prev.close ? -1 : 0;
    out.push(out[i - 1]! + dir * cur.volume);
  }
  return out;
}

function pushSafe(facts: TaFact[], fact: TaFact): void {
  if (isTaFactTextSafe(fact.text)) facts.push(fact);
}

export function computeTechnicalAnalysis(candles: readonly DailyOhlcv[]): TechnicalAnalysisSnapshot {
  const clean = candles.filter(
    (c) => num(c.open) && num(c.high) && num(c.low) && num(c.close) && num(c.volume) && c.high >= c.low && c.close > 0
  );
  const facts: TaFact[] = [];
  if (clean.length < 20) return { facts, inputs: {} };

  const closes = clean.map((c) => c.close);
  const volumes = clean.map((c) => c.volume);
  const last = clean[clean.length - 1]!;
  const ma20 = sma(closes, 20);
  const ma60 = sma(closes, 60);
  const ma120 = sma(closes, 120);
  const rsi = rsi14(closes);
  const macdNow = macd(closes);
  const widths = bollingerWidths(closes);
  const width = widths[widths.length - 1];
  const widthAvg = widths.length >= 20 ? widths.slice(-20).reduce((a, b) => a + b, 0) / 20 : undefined;
  const atr = atrPct(clean);
  const atrPrev = clean.length >= 30 ? atrPct(clean.slice(0, -14)) : undefined;

  const high52 = Math.max(...clean.slice(-260).map((c) => c.high));
  const low52 = Math.min(...clean.slice(-260).map((c) => c.low));
  const closeToHigh = high52 > 0 ? (last.close / high52) * 100 : undefined;
  const closeToLow = low52 > 0 ? (last.close / low52) * 100 : undefined;

  if (num(ma20) && num(ma60) && num(ma120)) {
    if (ma20 > ma60 && ma60 > ma120)
      pushSafe(facts, { kind: "ma_bullish", role: "event", confidence: "high", text: "20·60·120일선이 위쪽으로 정렬된 상태예요." });
    if (ma20 < ma60 && ma60 < ma120)
      pushSafe(facts, { kind: "ma_bearish", role: "event", confidence: "high", text: "20·60·120일선이 아래쪽으로 정렬된 상태예요." });
  }

  if (macdNow) {
    const crossedUp = num(macdNow.prevMacd) && num(macdNow.prevSignal) && macdNow.prevMacd <= macdNow.prevSignal && macdNow.macd > macdNow.signal;
    const crossedDown = num(macdNow.prevMacd) && num(macdNow.prevSignal) && macdNow.prevMacd >= macdNow.prevSignal && macdNow.macd < macdNow.signal;
    if (crossedUp) pushSafe(facts, { kind: "macd_bullish", role: "event", confidence: "high", text: "MACD가 신호선 위에 올라선 상태예요." });
    if (crossedDown) pushSafe(facts, { kind: "macd_bearish", role: "event", confidence: "high", text: "MACD가 신호선 아래에 놓인 상태예요." });
  }

  if (num(rsi) && rsi >= 70)
    pushSafe(facts, { kind: "rsi_overbought", role: "balance", confidence: "high", text: "최근 상승 폭이 커 RSI가 천장 영역(과매수)이에요." });
  if (num(rsi) && rsi <= 30)
    pushSafe(facts, { kind: "rsi_oversold", role: "event", confidence: "high", text: "최근 낙폭이 가팔라 RSI가 바닥 영역(과매도)이에요." });

  const squeeze = num(width) && num(widthAvg) && width < widthAvg * 0.65;
  if (squeeze)
    pushSafe(facts, { kind: "bollinger_squeeze", role: "confirmation", confidence: "high", text: "변동성 폭이 좁아져 차트가 압축된 상태예요." });

  if (num(atr) && num(atrPrev) && atr >= atrPrev * 1.5)
    pushSafe(facts, { kind: "atr_expanded", role: "event", confidence: "high", text: "하루 변동폭이 최근 평균보다 커진 상태예요." });

  if (clean.length >= 120 && num(closeToHigh) && closeToHigh >= 99.5)
    pushSafe(facts, { kind: "near_52w_high", role: "event", confidence: "high", text: "52주 고점권까지 올라온 상태예요." });
  if (clean.length >= 120 && num(closeToLow) && closeToLow <= 105)
    pushSafe(facts, { kind: "near_52w_low", role: "event", confidence: "high", text: "52주 저점권에 가까운 상태예요." });

  const recent = clean.slice(-20);
  const recentVolumes = volumes.slice(-20).filter((v) => v > 0);
  const firstClose = recent[0]?.close;
  const obvSeries = obv(clean);
  const obvDelta = obvSeries[obvSeries.length - 1]! - obvSeries[Math.max(0, obvSeries.length - 21)]!;
  const volumeAvg = recentVolumes.length ? recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length : 0;
  const priceFlat = num(firstClose) && firstClose > 0 && Math.abs(last.close / firstClose - 1) <= 0.03;
  const volumeRising = last.volume > volumeAvg * 1.25;
  const accumulation = !!priceFlat && volumeRising && obvDelta > 0;
  if (accumulation)
    pushSafe(facts, { kind: "accumulation_divergence", role: "confirmation", confidence: "low", text: "거래는 늘었는데 가격이 평탄해, 매집으로 보이는 구조예요." });

  const trendStrength = num(ma20) ? clamp01(Math.abs(last.close / ma20 - 1) / 0.15) : undefined;
  return {
    facts,
    latest: {
      ...(num(rsi) ? { rsi14: Math.round(rsi * 10) / 10 } : {}),
      ...(macdNow ? { macd: macdNow.macd, macdSignal: macdNow.signal } : {}),
      ...(num(width) ? { bollingerWidthPct: Math.round(width * 10) / 10 } : {}),
      ...(num(atr) ? { atrPct: Math.round(atr * 10) / 10 } : {}),
      ...(num(closeToHigh) ? { closeTo52WeekHighPct: Math.round(closeToHigh * 10) / 10 } : {}),
      ...(num(closeToLow) ? { closeTo52WeekLowPct: Math.round(closeToLow * 10) / 10 } : {}),
    },
    inputs: {
      ...(accumulation ? { accumulationDivergence: true } : {}),
      ...(squeeze ? { bollingerSqueeze: true } : {}),
      ...(num(trendStrength) ? { trendStrength } : {}),
    },
  };
}

export function selectTaFact(fomo: FomoScoreResult, ta: TechnicalAnalysisSnapshot): TaFact | undefined {
  const byKind = new Map(ta.facts.map((f) => [f.kind, f] as const));

  if (fomo.label === "incoming") {
    const confirm = byKind.get("accumulation_divergence") ?? byKind.get("bollinger_squeeze");
    if (confirm) return { ...confirm, role: "confirmation" };
  }

  if (fomo.leadSignal >= 60) {
    const balance = byKind.get("rsi_overbought");
    if (balance) return { ...balance, role: "balance" };
  }

  for (const kind of [
    "near_52w_high",
    "bollinger_squeeze",
    "rsi_overbought",
    "rsi_oversold",
    "accumulation_divergence",
    "macd_bullish",
    "macd_bearish",
    "ma_bullish",
    "ma_bearish",
    "atr_expanded",
    "near_52w_low",
  ] as const) {
    const fact = byKind.get(kind);
    if (fact) return fact;
  }

  return undefined;
}
