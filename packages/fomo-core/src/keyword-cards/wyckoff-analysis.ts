import type { DailyOhlcv } from "./technical-analysis";

export type WyckoffZoneKind = "accumulation" | "distribution" | "markup" | "markdown";
export type WyckoffEventKind = "spring" | "upthrust" | "impulse" | "pullback";

export interface WyckoffZone {
  kind: WyckoffZoneKind;
  startIndex: number;
  endIndex: number;
  startDate?: string;
  endDate?: string;
  weeks: number;
  low: number;
  high: number;
  rangePct: number;
  volumeRatio?: number;
  priceChangePct: number;
  label: string;
  evidence: string[];
}

export interface WyckoffEvent {
  kind: WyckoffEventKind;
  index: number;
  startIndex?: number;
  date?: string;
  price: number;
  direction?: "up" | "down";
  movePct?: number;
  volumeRatio?: number;
  retracementPct?: number;
  reference?: "MA20" | "MA60" | "range";
  label: string;
  explanation: string;
}

export interface WyckoffAnalysisInput {
  candles: readonly DailyOhlcv[];
  foreignNetStreak?: number;
  institutionNetStreak?: number;
  invalidationLevel?: number;
  currency?: "KRW" | "USD";
}

export interface WyckoffAnalysis {
  sourceLength: number;
  currentZone?: WyckoffZone;
  zones: WyckoffZone[];
  events: WyckoffEvent[];
  summary?: string;
}

const MIN_ZONE_DAYS = 30;
const MAX_ZONE_DAYS = 100;
const num = (value: number | undefined): value is number => typeof value === "number" && Number.isFinite(value);

function avg(values: readonly number[]): number | undefined {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length === 0) return undefined;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function quantile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

function pct(change: number): string {
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
}

function shortDate(date: string | undefined): string {
  if (!date) return "최근";
  const compact = date.match(/^\d{4}(\d{2})(\d{2})$/);
  if (compact) return `${Number(compact[1])}/${Number(compact[2])}`;
  const match = date.match(/(?:\d{4}-)?(\d{2})-(\d{2})/);
  return match ? `${Number(match[1])}/${Number(match[2])}` : date;
}

function price(value: number, currency: "KRW" | "USD"): string {
  if (currency === "USD") {
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: value < 100 ? 2 : 0 })}`;
  }
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function cleanCandles(candles: readonly DailyOhlcv[]): DailyOhlcv[] {
  return candles.filter(
    (candle) =>
      num(candle.open) &&
      num(candle.high) &&
      num(candle.low) &&
      num(candle.close) &&
      num(candle.volume) &&
      candle.open > 0 &&
      candle.close > 0 &&
      candle.high >= Math.max(candle.open, candle.close, candle.low) &&
      candle.low <= Math.min(candle.open, candle.close, candle.high) &&
      candle.volume >= 0
  );
}

function smaAt(candles: readonly DailyOhlcv[], index: number, period: number): number | undefined {
  if (index + 1 < period) return undefined;
  return avg(candles.slice(index + 1 - period, index + 1).map((candle) => candle.close));
}

function rangeZone(candles: readonly DailyOhlcv[]): WyckoffZone | undefined {
  if (candles.length < MIN_ZONE_DAYS + 25) return undefined;
  const endIndex = candles.length - 1;
  const full = candles.slice(-260);
  const yearLow = Math.min(...full.map((candle) => candle.low));
  const yearHigh = Math.max(...full.map((candle) => candle.high));
  const locationSpan = Math.max(yearHigh - yearLow, yearHigh * 0.01);
  const currentLocation = (candles[endIndex]!.close - yearLow) / locationSpan;

  for (let days = Math.min(MAX_ZONE_DAYS, candles.length - 25); days >= MIN_ZONE_DAYS; days -= 1) {
    const startIndex = candles.length - days;
    const zoneCandles = candles.slice(startIndex);
    const prior = candles.slice(Math.max(0, startIndex - 40), startIndex);
    if (prior.length < 25) continue;

    const closes = zoneCandles.map((candle) => candle.close);
    const lowBand = quantile(closes, 0.1);
    const highBand = quantile(closes, 0.9);
    const mid = quantile(closes, 0.5);
    const rangePct = mid > 0 ? ((highBand - lowBand) / mid) * 100 : 100;
    if (rangePct > 16) continue;

    const third = Math.max(8, Math.floor(zoneCandles.length / 3));
    const first = zoneCandles.slice(0, third);
    const middle = zoneCandles.slice(third, zoneCandles.length - third);
    const last = zoneCandles.slice(-third);
    if (middle.length < 5) continue;
    const firstThirdMove = first[first.length - 1]!.close / first[0]!.close - 1;
    // 직전 추세 꼬리를 구간 시작으로 잘못 포함하지 않는다. 첫 1/3도 이미 횡보 상태여야 한다.
    if (Math.abs(firstThirdMove) > 0.06) continue;
    const firstVolume = avg(first.map((candle) => candle.volume).filter((value) => value > 0));
    const lastVolume = avg(last.map((candle) => candle.volume).filter((value) => value > 0));
    const volumeRatio = num(firstVolume) && num(lastVolume) && firstVolume > 0 ? lastVolume / firstVolume : undefined;
    const firstLow = quantile(first.map((candle) => candle.low), 0.2);
    const middleLow = quantile(middle.map((candle) => candle.low), 0.2);
    const lastLow = quantile(last.map((candle) => candle.low), 0.2);
    const firstHigh = quantile(first.map((candle) => candle.high), 0.8);
    const lastHigh = quantile(last.map((candle) => candle.high), 0.8);
    const priorMove = prior[prior.length - 1]!.close / prior[0]!.close - 1;
    const higherLows = middleLow >= firstLow * 0.985 && lastLow >= middleLow * 0.985 && lastLow >= firstLow * 1.003;
    const upperFailures = lastHigh <= firstHigh * 1.02 && zoneCandles[endIndex - startIndex]!.close <= highBand * 0.99;
    const weeks = Math.max(1, Math.ceil(days / 5));
    const low = Math.min(...zoneCandles.map((candle) => candle.low));
    const high = Math.max(...zoneCandles.map((candle) => candle.high));
    const priceChangePct = (zoneCandles[zoneCandles.length - 1]!.close / zoneCandles[0]!.close - 1) * 100;

    if (priorMove <= -0.1 && currentLocation <= 0.48 && higherLows && num(volumeRatio) && volumeRatio <= 0.9) {
      return {
        kind: "accumulation",
        startIndex,
        endIndex,
        ...(zoneCandles[0]!.date ? { startDate: zoneCandles[0]!.date } : {}),
        ...(zoneCandles[zoneCandles.length - 1]!.date ? { endDate: zoneCandles[zoneCandles.length - 1]!.date } : {}),
        weeks,
        low,
        high,
        rangePct,
        volumeRatio,
        priceChangePct,
        label: `매집 추정 ${shortDate(zoneCandles[0]!.date)}~ · ${weeks}주차`,
        evidence: [
          `하락 뒤 가격 밴드 ${rangePct.toFixed(1)}% 수렴`,
          `구간 후반 거래량 ${volumeRatio.toFixed(2)}배`,
          `저점 ${pct((lastLow / firstLow - 1) * 100)} 절상`,
        ],
      };
    }

    if (priorMove >= 0.12 && currentLocation >= 0.55 && upperFailures && num(volumeRatio) && volumeRatio >= 1.12) {
      return {
        kind: "distribution",
        startIndex,
        endIndex,
        ...(zoneCandles[0]!.date ? { startDate: zoneCandles[0]!.date } : {}),
        ...(zoneCandles[zoneCandles.length - 1]!.date ? { endDate: zoneCandles[zoneCandles.length - 1]!.date } : {}),
        weeks,
        low,
        high,
        rangePct,
        volumeRatio,
        priceChangePct,
        label: `분산 추정 ${shortDate(zoneCandles[0]!.date)}~ · ${weeks}주차`,
        evidence: [
          `상승 뒤 가격 밴드 ${rangePct.toFixed(1)}% 정체`,
          `구간 후반 거래량 ${volumeRatio.toFixed(2)}배`,
          `상단 재돌파 실패 · 고점 변화 ${pct((lastHigh / firstHigh - 1) * 100)}`,
        ],
      };
    }
  }
  return undefined;
}

function trendZone(candles: readonly DailyOhlcv[]): WyckoffZone | undefined {
  if (candles.length < 70) return undefined;
  const lastIndex = candles.length - 1;
  const signAt = (index: number): number => {
    const ma20 = smaAt(candles, index, 20);
    const ma60 = smaAt(candles, index, 60);
    if (!num(ma20) || !num(ma60)) return 0;
    if (candles[index]!.close > ma20 && ma20 > ma60 * 1.005) return 1;
    if (candles[index]!.close < ma20 && ma20 < ma60 * 0.995) return -1;
    return 0;
  };
  const sign = signAt(lastIndex);
  if (sign === 0) return undefined;
  let startIndex = lastIndex;
  while (startIndex > 59 && signAt(startIndex - 1) === sign) startIndex -= 1;
  const days = lastIndex - startIndex + 1;
  const move = (candles[lastIndex]!.close / candles[startIndex]!.close - 1) * 100;
  if (days < 10 || (sign > 0 ? move < 8 : move > -8)) return undefined;
  const slice = candles.slice(startIndex);
  const kind: WyckoffZoneKind = sign > 0 ? "markup" : "markdown";
  const weeks = Math.max(1, Math.ceil(days / 5));
  return {
    kind,
    startIndex,
    endIndex: lastIndex,
    ...(slice[0]!.date ? { startDate: slice[0]!.date } : {}),
    ...(slice[slice.length - 1]!.date ? { endDate: slice[slice.length - 1]!.date } : {}),
    weeks,
    low: Math.min(...slice.map((candle) => candle.low)),
    high: Math.max(...slice.map((candle) => candle.high)),
    rangePct: ((Math.max(...slice.map((candle) => candle.high)) - Math.min(...slice.map((candle) => candle.low))) / slice[0]!.close) * 100,
    priceChangePct: move,
    label: `${kind === "markup" ? "상승" : "하락"} ${shortDate(slice[0]!.date)}~ · ${weeks}주차`,
    evidence: [`20·60일선 ${sign > 0 ? "정배열" : "역배열"} ${days}거래일`, `구간 등락 ${pct(move)}`],
  };
}

function boundaryEvents(
  candles: readonly DailyOhlcv[],
  zone: WyckoffZone | undefined,
  currency: "KRW" | "USD"
): WyckoffEvent[] {
  if (!zone || (zone.kind !== "accumulation" && zone.kind !== "distribution")) return [];
  const out: WyckoffEvent[] = [];
  for (let index = zone.startIndex + 12; index <= zone.endIndex - 1; index += 1) {
    const prior = candles.slice(Math.max(zone.startIndex, index - 20), index);
    if (prior.length < 10) continue;
    const current = candles[index]!;
    const priorVolume = avg(prior.map((candle) => candle.volume).filter((value) => value > 0));
    if (!num(priorVolume) || priorVolume <= 0) continue;
    const volumeRatio = current.volume / priorVolume;
    const recovery = candles.slice(index + 1, Math.min(zone.endIndex + 1, index + 4));
    if (recovery.length === 0) continue;

    if (zone.kind === "accumulation") {
      const support = quantile(prior.map((candle) => candle.low), 0.15);
      const recovered = recovery.find((candle) => candle.close >= support);
      if (current.low <= support * 0.985 && recovered && volumeRatio >= 1.25) {
        out.push({
          kind: "spring",
          index,
          ...(current.date ? { date: current.date } : {}),
          price: current.low,
          volumeRatio,
          label: `${shortDate(current.date)} 스프링 후보`,
          explanation: `구간 하단 ${price(support, currency)}을 이탈한 뒤 ${recovery.indexOf(recovered) + 1}봉 안에 회복 · 거래량 ${volumeRatio.toFixed(1)}배`,
        });
      }
    } else {
      const resistance = quantile(prior.map((candle) => candle.high), 0.85);
      const returned = recovery.find((candle) => candle.close <= resistance);
      if (current.high >= resistance * 1.015 && returned && volumeRatio >= 1.25) {
        out.push({
          kind: "upthrust",
          index,
          ...(current.date ? { date: current.date } : {}),
          price: current.high,
          volumeRatio,
          label: `${shortDate(current.date)} 업스러스트 후보`,
          explanation: `구간 상단 ${price(resistance, currency)}을 돌파한 뒤 ${recovery.indexOf(returned) + 1}봉 안에 복귀 · 거래량 ${volumeRatio.toFixed(1)}배`,
        });
      }
    }
  }
  return out.slice(-2);
}

function impulseEvents(candles: readonly DailyOhlcv[]): WyckoffEvent[] {
  if (candles.length < 35) return [];
  const candidates: WyckoffEvent[] = [];
  const firstEnd = Math.max(30, candles.length - 140);
  for (let end = firstEnd; end < candles.length; end += 1) {
    let best: WyckoffEvent | undefined;
    for (let days = 3; days <= 10; days += 1) {
      const start = end - days;
      if (start < 20) continue;
      const startClose = candles[start]!.close;
      const movePct = (candles[end]!.close / startClose - 1) * 100;
      if (Math.abs(movePct) < 8) continue;
      const impulseVolume = avg(candles.slice(start + 1, end + 1).map((candle) => candle.volume).filter((value) => value > 0));
      const normalVolume = avg(candles.slice(Math.max(0, start - 20), start).map((candle) => candle.volume).filter((value) => value > 0));
      if (!num(impulseVolume) || !num(normalVolume) || normalVolume <= 0) continue;
      const volumeRatio = impulseVolume / normalVolume;
      if (volumeRatio < 1.5) continue;
      const direction = movePct > 0 ? "up" : "down";
      const candidate: WyckoffEvent = {
        kind: "impulse",
        index: end,
        startIndex: start,
        ...(candles[end]!.date ? { date: candles[end]!.date } : {}),
        price: candles[end]!.close,
        direction,
        movePct,
        volumeRatio,
        label: `${shortDate(candles[end]!.date)} ${direction === "up" ? "상방" : "하방"} 임펄스 ${pct(movePct)}`,
        explanation: `${days}봉 동안 ${pct(movePct)} · 거래량은 직전 평균의 ${volumeRatio.toFixed(1)}배`,
      };
      if (!best || Math.abs(movePct) > Math.abs(best.movePct ?? 0)) best = candidate;
    }
    if (best) candidates.push(best);
  }

  return candidates
    .sort((a, b) => Math.abs(b.movePct ?? 0) - Math.abs(a.movePct ?? 0))
    .filter((candidate, index, all) => all.slice(0, index).every((kept) => Math.abs(kept.index - candidate.index) >= 8))
    .slice(0, 3)
    .sort((a, b) => a.index - b.index);
}

function pullbackEvents(
  candles: readonly DailyOhlcv[],
  impulses: readonly WyckoffEvent[],
  currency: "KRW" | "USD"
): WyckoffEvent[] {
  const out: WyckoffEvent[] = [];
  for (const impulse of impulses) {
    if (impulse.direction !== "up" || !num(impulse.startIndex)) continue;
    const end = Math.min(candles.length - 1, impulse.index + 20);
    if (end < impulse.index + 3) continue;
    const impulseStart = candles[impulse.startIndex]!.close;
    const impulseVolume = avg(candles.slice(impulse.startIndex + 1, impulse.index + 1).map((candle) => candle.volume).filter((value) => value > 0));
    if (!num(impulseVolume) || impulseVolume <= 0) continue;
    let selected: WyckoffEvent | undefined;
    for (let index = impulse.index + 3; index <= end; index += 1) {
      const candle = candles[index]!;
      const peak = Math.max(...candles.slice(impulse.index, index + 1).map((row) => row.high));
      const wave = peak - impulseStart;
      if (wave <= 0) continue;
      const retracementPct = ((peak - candle.low) / wave) * 100;
      if (retracementPct < 25 || retracementPct > 68) continue;
      const ma20 = smaAt(candles, index, 20);
      const ma60 = smaAt(candles, index, 60);
      const references: Array<{ name: "MA20" | "MA60"; value: number }> = [];
      if (num(ma20)) references.push({ name: "MA20", value: ma20 });
      if (num(ma60)) references.push({ name: "MA60", value: ma60 });
      const nearest = references.sort((a, b) => Math.abs(candle.low / a.value - 1) - Math.abs(candle.low / b.value - 1))[0];
      if (!nearest || Math.abs(candle.low / nearest.value - 1) > 0.025 || candle.close < nearest.value * 0.985) continue;
      const pullbackVolume = avg(candles.slice(impulse.index + 1, index + 1).map((row) => row.volume).filter((value) => value > 0));
      if (!num(pullbackVolume) || pullbackVolume / impulseVolume > 0.85) continue;
      selected = {
        kind: "pullback",
        index,
        startIndex: impulse.index,
        ...(candle.date ? { date: candle.date } : {}),
        price: candle.low,
        retracementPct,
        volumeRatio: pullbackVolume / impulseVolume,
        reference: nearest.name,
        label: `${shortDate(candle.date)} 첫 눌림목 후보`,
        explanation: `임펄스 고점 대비 ${retracementPct.toFixed(1)}% 되돌림 · ${nearest.name} ${price(nearest.value, currency)} 지지 테스트 · 거래량 ${(
          pullbackVolume / impulseVolume
        ).toFixed(2)}배`,
      };
    }
    if (selected) out.push(selected);
  }
  return out.slice(-2);
}

function summaryOf(
  zone: WyckoffZone | undefined,
  events: readonly WyckoffEvent[],
  input: WyckoffAnalysisInput
): string | undefined {
  const currency = input.currency ?? "KRW";
  const clauses: string[] = [];
  if (zone) {
    const name = zone.kind === "accumulation" ? "매집 추정" : zone.kind === "distribution" ? "분산 추정" : zone.kind === "markup" ? "상승" : "하락";
    clauses.push(`${shortDate(zone.startDate)}부터 ${zone.weeks}주째 ${name} 구간(폭 ${zone.rangePct.toFixed(1)}%, 구간 등락 ${pct(zone.priceChangePct)})`);
  }
  // "지금" 요약에는 최근 30거래일 사건만 사용한다. 오래된 이벤트는 차트 기록으로만 남긴다.
  const latestEvent = events
    .filter((event) => event.index >= Math.max(0, input.candles.length - 30))
    .sort((a, b) => b.index - a.index)[0];
  if (latestEvent) {
    if (latestEvent.kind === "spring" || latestEvent.kind === "upthrust") {
      clauses.push(`${latestEvent.label} · 거래량 ${latestEvent.volumeRatio?.toFixed(1)}배`);
    } else if (latestEvent.kind === "impulse") {
      clauses.push(`${latestEvent.label} · 거래량 ${latestEvent.volumeRatio?.toFixed(1)}배`);
    } else {
      clauses.push(`${latestEvent.label} · ${latestEvent.retracementPct?.toFixed(1)}% 되돌림 · ${latestEvent.reference} 지지 테스트`);
    }
  }
  const flows = [
    num(input.foreignNetStreak) && Math.abs(input.foreignNetStreak) >= 3
      ? `외국인 ${Math.abs(input.foreignNetStreak)}일 연속 순${input.foreignNetStreak > 0 ? "매수" : "매도"}`
      : undefined,
    num(input.institutionNetStreak) && Math.abs(input.institutionNetStreak) >= 3
      ? `기관 ${Math.abs(input.institutionNetStreak)}일 연속 순${input.institutionNetStreak > 0 ? "매수" : "매도"}`
      : undefined,
  ].filter((value): value is string => Boolean(value));
  if (flows.length > 0) {
    const meaning = zone?.kind === "accumulation" && [input.foreignNetStreak, input.institutionNetStreak].some((value) => num(value) && value > 0)
      ? "저점권 손바뀜을 확인 중"
      : zone?.kind === "distribution" && [input.foreignNetStreak, input.institutionNetStreak].some((value) => num(value) && value < 0)
        ? "고점권 이탈 수급이 겹친 상태"
        : "가격 구간과 수급 방향을 함께 확인 중";
    clauses.push(`${flows.join("·")} 가세 — ${meaning}`);
  }
  if (clauses.length > 0 && num(input.invalidationLevel)) clauses.push(`관점 경계 ${price(input.invalidationLevel, currency)}`);
  return clauses.length > 0 ? `${clauses.join(". ")}.` : undefined;
}

/**
 * 캔들·거래량만으로 구간과 이벤트를 판정하는 결정론 엔진.
 * 조건이 부족하면 빈 배열을 반환하며, LLM이나 임의 레벨을 사용하지 않는다.
 */
export function computeWyckoffAnalysis(input: WyckoffAnalysisInput): WyckoffAnalysis {
  const candles = cleanCandles(input.candles);
  if (candles.length < MIN_ZONE_DAYS) return { sourceLength: candles.length, zones: [], events: [] };
  const currency = input.currency ?? "KRW";
  const currentZone = rangeZone(candles) ?? trendZone(candles);
  const boundary = boundaryEvents(candles, currentZone, currency);
  const impulses = impulseEvents(candles);
  const pullbacks = pullbackEvents(candles, impulses, currency);
  const events = [...boundary, ...impulses, ...pullbacks].sort((a, b) => a.index - b.index);
  const summary = summaryOf(currentZone, events, input);
  return {
    sourceLength: candles.length,
    ...(currentZone ? { currentZone } : {}),
    zones: currentZone ? [currentZone] : [],
    events,
    ...(summary ? { summary } : {}),
  };
}
