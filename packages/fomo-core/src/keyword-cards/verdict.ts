import { computeTechnicalAnalysis, type DailyOhlcv } from "./technical-analysis";

/**
 * 판단 엔진(verdict) — 카드의 "그래서 살 만한가" 층. WO-PHASE1-CONVICTION-CARD.
 *
 * 결정론 규칙만 사용한다(같은 입력 → 같은 출력, LLM 없음).
 * 와이코프 국면(축적/상승/분산/하락)을 실제 캔들로 판정하고, 수급 streak·내부자·재료·거래량을
 * 조합해 stance(enter/watch/avoid)를 낸다. 무효화 레벨은 반드시 실제 캔들 계산값 — 없는 수치 금지.
 * 데이터가 부족하면 국면을 억지 판정하지 않고 생략하며, 캔들 자체가 부족하면 판단 전체를 보류한다.
 */

export type VerdictStance = "enter" | "watch" | "avoid";
export type WyckoffPhase = "accumulation" | "markup" | "distribution" | "markdown";

export interface VerdictInput {
  /** 실제 일봉(오래된→최신). 레벨(저점·이동평균) 계산의 유일한 출처. */
  candles: readonly DailyOhlcv[];
  /** 외국인 연속 순매수(+N)/순매도(-N) 일수. */
  foreignNetStreak?: number;
  /** 기관 연속 순매수(+N)/순매도(-N) 일수. */
  institutionNetStreak?: number;
  /** 내부자 매수(공시 확인분만). count 미상이어도 공시 확인이면 confirmed=true. */
  insider?: { confirmed?: boolean; insiderCount?: number; valueUsd?: number };
  /** 종목 직접 언급 재료(뉴스·공시) 강도 0~1. */
  materialStrength?: number;
  /** 최신일 거래량 / 최근 20일 평균. */
  volumeRatio?: number;
  currency?: "KRW" | "USD";
}

export interface CardVerdict {
  stance: VerdictStance;
  /** 판단 1줄 — 근거 조합(driver)에 따라 문구가 달라진다. */
  stanceText: string;
  phase?: WyckoffPhase;
  /** 근거 최대 3개 — 전부 실데이터 문장. */
  evidence: string[];
  /** 무효화 조건 — 실제 캔들에서 계산한 레벨 기반. 캔들 자체가 부족한 최소 verdict 엔 없다(가짜 레벨 금지). */
  invalidation?: string;
  /** 무효화 레벨 실계산 값 — 차트 무효선(WO 1.6 D) 렌더용. invalidation 과 항상 짝. */
  invalidationLevel?: number;
  confidence: "high" | "medium" | "low";
}

const MIN_CANDLES_FOR_VERDICT = 30;
const MIN_CANDLES_FOR_PHASE = 60;

const num = (x: number | undefined): x is number => typeof x === "number" && Number.isFinite(x);

function sma(values: readonly number[], n: number): number | undefined {
  if (values.length < n) return undefined;
  const slice = values.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / n;
}

function avg(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** 레벨 표기 — 실계산값을 통화별로 사람이 읽는 형태로. */
export function formatVerdictLevel(value: number, currency: "KRW" | "USD"): string {
  if (currency === "USD") {
    return `$${value.toLocaleString("en-US", { minimumFractionDigits: value < 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
  }
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

/** 가용 캔들 창 라벨 — 240거래일(≈52주) 이상이면 52주, 아니면 개월 수로 정직하게. */
function windowLabel(tradingDays: number): string {
  if (tradingDays >= 240) return "52주";
  const months = Math.max(1, Math.round(tradingDays / 21));
  return `최근 ${months}개월`;
}

interface PriceStructure {
  close: number;
  ma20?: number;
  ma60?: number;
  ma120?: number;
  windowLow: number;
  windowHigh: number;
  windowText: string;
  /** 최근 20일 평균 거래량 / 직전 20일 평균 거래량. */
  volumeTrend?: number;
  /** 최근 10일 내 창 저점 갱신 여부. */
  recentNewLow: boolean;
  /** 최근 10일 종가 순변화율. */
  stall10: number;
  /** MA20의 10일 기울기(비율) — 상승 지속(양수 큼) vs 고점 정체(≈0) 판별자. */
  ma20Slope10?: number;
  /** 20/60일선 배열 연속 일수 — 양수=정배열 N일째, 음수=역배열 N일째. 근거 수치화(WO 2차 B)용. */
  alignStreak?: number;
  days: number;
}

function priceStructure(candles: readonly DailyOhlcv[]): PriceStructure | undefined {
  const clean = candles.filter(
    (c) => num(c.open) && num(c.high) && num(c.low) && num(c.close) && num(c.volume) && c.high >= c.low && c.close > 0
  );
  if (clean.length < MIN_CANDLES_FOR_VERDICT) return undefined;
  const closes = clean.map((c) => c.close);
  const volumes = clean.map((c) => c.volume);
  const close = closes[closes.length - 1]!;
  const windowLow = Math.min(...clean.map((c) => c.low));
  const windowHigh = Math.max(...clean.map((c) => c.high));
  const recent20Vol = avg(volumes.slice(-20).filter((v) => v > 0));
  const prior20Vol = clean.length >= 40 ? avg(volumes.slice(-40, -20).filter((v) => v > 0)) : undefined;
  const last10 = clean.slice(-10);
  const first10Close = last10[0]?.close;
  const min10Low = Math.min(...last10.map((c) => c.low));
  const ma20 = sma(closes, 20);
  const ma60 = sma(closes, 60);
  const ma120 = sma(closes, 120);
  const ma20Prev10 = closes.length >= 30 ? sma(closes.slice(0, -10), 20) : undefined;
  const ma20Slope10 = num(ma20) && num(ma20Prev10) && ma20Prev10 > 0 ? ma20 / ma20Prev10 - 1 : undefined;
  // 20/60일선 배열 연속 일수 — 프리픽스합으로 일별 SMA를 계산해 현재 배열이 며칠째인지 센다(결정론).
  let alignStreak: number | undefined;
  if (closes.length >= 60) {
    const prefix: number[] = [0];
    for (const c of closes) prefix.push(prefix[prefix.length - 1]! + c);
    const smaAt = (i: number, n: number): number | undefined => (i + 1 >= n ? (prefix[i + 1]! - prefix[i + 1 - n]!) / n : undefined);
    const alignSign = (i: number): number => {
      const a = smaAt(i, 20);
      const b = smaAt(i, 60);
      if (!num(a) || !num(b) || a === b) return 0;
      return a > b ? 1 : -1;
    };
    const last = alignSign(closes.length - 1);
    if (last !== 0) {
      let count = 0;
      for (let i = closes.length - 1; i >= 0 && alignSign(i) === last; i -= 1) count += 1;
      alignStreak = last * count;
    }
  }
  return {
    close,
    ...(num(ma20) ? { ma20 } : {}),
    ...(num(ma60) ? { ma60 } : {}),
    ...(num(ma120) ? { ma120 } : {}),
    windowLow,
    windowHigh,
    windowText: windowLabel(clean.length),
    ...(num(recent20Vol) && num(prior20Vol) && prior20Vol > 0 ? { volumeTrend: recent20Vol / prior20Vol } : {}),
    recentNewLow: min10Low <= windowLow * 1.005,
    stall10: num(first10Close) && first10Close > 0 ? close / first10Close - 1 : 0,
    ...(num(ma20Slope10) ? { ma20Slope10 } : {}),
    ...(num(alignStreak) ? { alignStreak } : {}),
    days: clean.length,
  };
}

/**
 * 와이코프 국면 판정 — 데이터 60거래일 미만이면 판정하지 않는다(억지 금지).
 * 판정 순서: 하락(저점 갱신) → 축적(하락 멈춤+저점권+거래 수축) → 분산(고점권+정체+거래 확대) → 상승(정배열+거래 확인).
 */
function wyckoffPhase(s: PriceStructure, squeeze: boolean, volumeRatio: number | undefined): WyckoffPhase | undefined {
  if (s.days < MIN_CANDLES_FOR_PHASE || !num(s.ma20) || !num(s.ma60)) return undefined;
  const bearAligned = s.ma20 < s.ma60 && (!num(s.ma120) || s.ma60 < s.ma120);
  const bullAligned = s.ma20 > s.ma60 && (!num(s.ma120) || s.ma60 > s.ma120);
  const nearLow = s.close <= s.windowLow * 1.12;
  const nearHigh = s.close >= s.windowHigh * 0.95;
  const volumeContracting = squeeze || (num(s.volumeTrend) && s.volumeTrend <= 0.9);
  const volumeExpanding = (num(s.volumeTrend) && s.volumeTrend >= 1.15) || (num(volumeRatio) && volumeRatio >= 1.5);
  const flat = Math.abs(s.close / s.ma20 - 1) <= 0.05;

  // 분산 vs 상승 판별자: 분산은 MA20이 평탄해진 고점 정체, 상승은 MA20이 계속 오른다.
  const ma20Flat = !num(s.ma20Slope10) || s.ma20Slope10 <= 0.015;

  if (bearAligned && s.recentNewLow) return "markdown";
  if (nearLow && volumeContracting && flat && !s.recentNewLow) return "accumulation";
  if (nearHigh && volumeExpanding && s.stall10 <= 0.02 && ma20Flat) return "distribution";
  if (bullAligned && s.close > s.ma20 && volumeExpanding) return "markup";
  // 완화 폴백(WO 2차 D — 판정률 80% 목표): 거래량 확인·저점 갱신이 없어도 배열이 뚜렷하면(≥1% 이격)
  // 추세 국면으로 분류한다. 배열이 붙어 있는 애매한 중간 지대만 정직하게 "없음"으로 남긴다.
  if (bullAligned && s.ma20 > s.ma60 * 1.01 && s.close > s.ma20) return "markup";
  if (bearAligned && s.ma20 < s.ma60 * 0.99 && s.close < s.ma20) return "markdown";
  return undefined;
}

type Driver =
  | "accumulation_inflow"
  | "markup_confirmed"
  | "signal_stack"
  | "mixed"
  | "quiet"
  | "overheat"
  | "phase_exit"
  | "markdown"
  | "signal_drain";

/** 받침 유무 기반 조사 선택 — 조립 문장의 "이/가"·"은/는" 깨짐 방지. 비한글 끝은 받침 없음으로 처리. */
function josa(word: string, withBatchim: string, withoutBatchim: string): string {
  const last = word.trim().at(-1);
  if (!last) return withoutBatchim;
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return withoutBatchim;
  return (code - 0xac00) % 28 === 0 ? withoutBatchim : withBatchim;
}

interface Factor {
  kind: string;
  /** 근거 문장 — 반드시 실측치(숫자) 포함(WO 2차 B 게이트). */
  text: string;
  /** stanceText 조립용 짧은 구절 — [주도 신호 실측치]+[반대 신호 실측치] 형태(WO 2차 A). */
  short: string;
}

/** 근거 수치화 게이트(WO 2차 B) — 숫자 없는 일반문 근거는 카드에 싣지 않는다. */
export function hasMeasuredValue(text: string): boolean {
  return /\d/.test(text);
}

/**
 * 판단 1줄 조립(WO 2차 A) — stance별 고정 문장 대신 실제 신호 조합에서 조립한다.
 * 형태: [주도 신호 실측치] + [반대/부족 신호 실측치] + stance 결론. 결정론(같은 입력→같은 출력).
 */
function assembleStanceText(
  stance: VerdictStance,
  driver: Driver,
  bulls: readonly Factor[],
  bears: readonly Factor[],
  s: PriceStructure,
  rsi: number | undefined,
  currency: "KRW" | "USD"
): string {
  const bullLead = bulls[0];
  const bearLead = bears[0];
  if (stance === "enter") {
    if (driver === "accumulation_inflow" && bullLead) {
      return `${s.windowText} 저점 ${formatVerdictLevel(s.windowLow, currency)} 위 다지기에 ${bullLead.short}${josa(bullLead.short, "이", "가")} 붙어 — 분할 진입을 검토할 자리예요.`;
    }
    if (driver === "markup_confirmed" && bullLead) {
      const trendClause = num(s.alignStreak) && s.alignStreak > 0 ? `정배열 ${s.alignStreak}일째 추세` : "상승 추세";
      const confirm = bulls.find((f) => f.kind === "volume" || f.kind === "insider" || f.kind === "flow") ?? bullLead;
      return `${trendClause}에 ${confirm.short} 확인 — 흐름을 따라가 볼 자리예요.`;
    }
    if (bulls.length >= 2) {
      return `${bulls[0]!.short}에 ${bulls[1]!.short}까지 겹쳐 — 가볍게 진입을 검토할 만해요.`;
    }
    return `${bullLead?.short ?? "확인 신호"}${josa(bullLead?.short ?? "확인 신호", "이", "가")} 먼저 좋아졌어요 — 가볍게 진입을 검토할 만해요.`;
  }
  if (stance === "avoid") {
    if (driver === "phase_exit") {
      const highGap = ((1 - s.close / s.windowHigh) * 100).toFixed(1);
      const tail = bearLead ? `에 ${bearLead.short}${josa(bearLead.short, "이", "가")} 겹쳐` : "라";
      return `${s.windowText} 고점 대비 -${highGap}% 분산 구간${tail} — 지금 들어갈 자리는 아니에요.`;
    }
    if (driver === "markdown") {
      const streakClause = num(s.alignStreak) && s.alignStreak < 0 ? `역배열 ${Math.abs(s.alignStreak)}일째` : "하락 추세";
      const extra = bears.find((f) => f.kind !== "trend" && f.kind !== "newlow");
      return extra
        ? `${streakClause} 하락에 ${extra.short}까지 — 바닥 확인 전엔 피할 구간이에요.`
        : `${streakClause}, ${s.windowText} 저점 ${formatVerdictLevel(s.windowLow, currency)} 부근 — 바닥 확인 전엔 피할 구간이에요.`;
    }
    if (bears.length >= 2) {
      return `${bears[0]!.short}·${bears[1]!.short} — 약세 신호가 쌓여 지금은 피할 구간이에요.`;
    }
    return `${bearLead?.short ?? "약세 신호"} 쪽에 무게가 실려 — 지금은 피할 구간이에요.`;
  }
  // watch
  if (driver === "overheat" && num(rsi)) {
    const trendClause = bullLead ? bullLead.short : num(s.alignStreak) && s.alignStreak > 0 ? `정배열 ${s.alignStreak}일째` : "추세";
    return `${trendClause}로 추세는 살아 있는데 RSI ${Math.round(rsi)} 과열이 맞서요 — 식는지 볼 구간이에요.`;
  }
  if (driver === "mixed" && bullLead && bearLead) {
    return `${bullLead.short}${josa(bullLead.short, "은", "는")} 강세인데 ${bearLead.short}${josa(bearLead.short, "이", "가")} 맞서요 — 우세가 갈릴 때까지 볼 구간이에요.`;
  }
  // quiet — 카드마다 다른 실측치(20일선 이격)로 문장을 만들어 돌려막기를 없앤다.
  if (num(s.ma20) && s.ma20 > 0) {
    const gap = ((s.close / s.ma20 - 1) * 100).toFixed(1);
    return `20일선 대비 ${Number(gap) >= 0 ? "+" : ""}${gap}% 자리, 판단을 기울일 확인 신호는 아직 — 관찰 구간이에요.`;
  }
  return `가격 이력 ${s.days}거래일 — 확인 신호가 쌓일 때까지 관찰 구간이에요.`;
}

/** 가격 구조 없이도 확인 가능한 강세 신호(내부자·수급·재료·거래량) — 최소 verdict 의 근거이기도 하다. 전 문장 실측치 포함. */
function signalBullFactors(input: VerdictInput): Factor[] {
  const out: Factor[] = [];
  const insiderCount = input.insider?.insiderCount;
  if (num(insiderCount) && insiderCount >= 2) {
    const valueUsd = input.insider?.valueUsd;
    const valueText = num(valueUsd) && valueUsd > 0 ? ` 총 $${Math.round(valueUsd / 1000).toLocaleString("en-US")}k` : "";
    out.push({ kind: "insider", text: `내부자 ${insiderCount}인이${valueText} 동반 매수(공시 확인)`, short: `내부자 ${insiderCount}인 동반 매수` });
  } else if (input.insider?.confirmed === true) {
    out.push({ kind: "insider", text: "내부자 공개시장 매수 공시 1건 이상 확인", short: "내부자 매수 공시 확인" });
  }
  if (num(input.foreignNetStreak) && input.foreignNetStreak >= 3) {
    out.push({ kind: "flow", text: `외국인 ${input.foreignNetStreak}일 연속 순매수`, short: `외국인 ${input.foreignNetStreak}일 연속 순매수` });
  }
  if (num(input.institutionNetStreak) && input.institutionNetStreak >= 3) {
    out.push({ kind: "flow", text: `기관 ${input.institutionNetStreak}일 연속 순매수`, short: `기관 ${input.institutionNetStreak}일 연속 순매수` });
  }
  if (num(input.materialStrength) && input.materialStrength >= 0.6) {
    const pct = Math.round(input.materialStrength * 100);
    out.push({ kind: "material", text: `이 종목을 직접 언급한 재료(뉴스·공시) 확인 — 신호 강도 ${pct}%`, short: `직접 재료(강도 ${pct}%)` });
  }
  if (num(input.volumeRatio) && input.volumeRatio >= 1.5) {
    out.push({ kind: "volume", text: `거래량이 20일 평균의 ${input.volumeRatio.toFixed(1)}배`, short: `거래량 ${input.volumeRatio.toFixed(1)}배` });
  }
  return out;
}

function signalBearFactors(input: VerdictInput): Factor[] {
  const out: Factor[] = [];
  if (num(input.foreignNetStreak) && input.foreignNetStreak <= -3) {
    const days = Math.abs(input.foreignNetStreak);
    out.push({ kind: "flow", text: `외국인 ${days}일 연속 순매도`, short: `외국인 ${days}일 연속 순매도` });
  }
  if (num(input.institutionNetStreak) && input.institutionNetStreak <= -3) {
    const days = Math.abs(input.institutionNetStreak);
    out.push({ kind: "flow", text: `기관 ${days}일 연속 순매도`, short: `기관 ${days}일 연속 순매도` });
  }
  return out;
}

function bullFactors(input: VerdictInput, s: PriceStructure, currency: "KRW" | "USD"): Factor[] {
  const out = signalBullFactors(input);
  if (num(s.ma20) && num(s.ma60) && s.ma20 > s.ma60 && s.close > s.ma20) {
    const gap = ((s.close / s.ma20 - 1) * 100).toFixed(1);
    const streakText = num(s.alignStreak) && s.alignStreak > 0 ? ` — 정배열 ${s.alignStreak}일째` : "";
    out.push({
      kind: "trend",
      text: `20일선 ${formatVerdictLevel(s.ma20, currency)} 위 +${gap}%${streakText}`,
      short: num(s.alignStreak) && s.alignStreak > 0 ? `정배열 ${s.alignStreak}일째` : `20일선 위 +${gap}%`,
    });
  }
  return out;
}

function bearFactors(input: VerdictInput, s: PriceStructure, rsi: number | undefined, currency: "KRW" | "USD"): Factor[] {
  const out = signalBearFactors(input);
  if (num(rsi) && rsi >= 70) {
    out.push({ kind: "overheat", text: `RSI ${Math.round(rsi)} — 단기 과열 영역`, short: `RSI ${Math.round(rsi)} 단기 과열` });
  }
  if (num(s.ma20) && num(s.ma60) && s.ma20 < s.ma60 && s.close < s.ma20) {
    const gap = ((1 - s.close / s.ma20) * 100).toFixed(1);
    const streakText = num(s.alignStreak) && s.alignStreak < 0 ? ` — 역배열 ${Math.abs(s.alignStreak)}일째` : "";
    out.push({
      kind: "trend",
      text: `20일선 ${formatVerdictLevel(s.ma20, currency)} 아래 -${gap}% 이격${streakText}`,
      short: num(s.alignStreak) && s.alignStreak < 0 ? `역배열 ${Math.abs(s.alignStreak)}일째` : `20일선 아래 -${gap}%`,
    });
  }
  if (s.recentNewLow) {
    out.push({
      kind: "newlow",
      text: `${s.windowText} 저점 ${formatVerdictLevel(s.windowLow, currency)}을 최근 10일 내 갱신`,
      short: `${s.windowText} 저점 갱신`,
    });
  }
  return out;
}

function phaseEvidence(phase: WyckoffPhase, s: PriceStructure, currency: "KRW" | "USD"): Factor {
  if (phase === "accumulation") {
    const pct = ((s.close / s.windowLow - 1) * 100).toFixed(1);
    return {
      kind: "phase",
      text: `${s.windowText} 저점 ${formatVerdictLevel(s.windowLow, currency)} 대비 +${pct}% — 저점권 횡보에 거래가 수축된 축적형 구조`,
      short: "저점권 축적 구조",
    };
  }
  if (phase === "distribution") {
    const pct = ((1 - s.close / s.windowHigh) * 100).toFixed(1);
    return {
      kind: "phase",
      text: `${s.windowText} 고점 ${formatVerdictLevel(s.windowHigh, currency)} 대비 -${pct}% — 고점권에서 거래는 늘고 가격은 정체된 분산형 구조`,
      short: "고점권 분산 구조",
    };
  }
  if (phase === "markup") {
    const gap = num(s.ma20) && s.ma20 > 0 ? ((s.close / s.ma20 - 1) * 100).toFixed(1) : undefined;
    const streakText = num(s.alignStreak) && s.alignStreak > 0 ? `정배열 ${s.alignStreak}일째` : "이동평균 정배열";
    return {
      kind: "phase",
      text: `${streakText}${gap ? `·20일선 위 +${gap}%` : ""} — 상승 국면`,
      short: streakText,
    };
  }
  const lowGap = ((s.close / s.windowLow - 1) * 100).toFixed(1);
  const streakText = num(s.alignStreak) && s.alignStreak < 0 ? `역배열 ${Math.abs(s.alignStreak)}일째` : "이동평균 역배열";
  return {
    kind: "phase",
    text: `${streakText}·${s.windowText} 저점 대비 +${lowGap}% — 하락 국면`,
    short: streakText,
  };
}

function invalidationOf(
  stance: VerdictStance,
  driver: Driver,
  s: PriceStructure,
  currency: "KRW" | "USD"
): { text: string; level: number } {
  if (stance === "enter") {
    if (driver === "accumulation_inflow" || !num(s.ma20)) {
      return {
        text: `${s.windowText} 저점 ${formatVerdictLevel(s.windowLow, currency)} 이탈 시 이 관점은 무효예요.`,
        level: s.windowLow,
      };
    }
    return { text: `20일선 ${formatVerdictLevel(s.ma20, currency)} 아래 마감 시 이 관점은 무효예요.`, level: s.ma20 };
  }
  if (stance === "avoid") {
    if (num(s.ma20)) {
      return { text: `20일선 ${formatVerdictLevel(s.ma20, currency)} 위 마감 시 약세 관점은 무효예요.`, level: s.ma20 };
    }
    return {
      text: `${s.windowText} 고점 ${formatVerdictLevel(s.windowHigh, currency)} 회복 시 약세 관점은 무효예요.`,
      level: s.windowHigh,
    };
  }
  return {
    text: `${s.windowText} 저점 ${formatVerdictLevel(s.windowLow, currency)} 이탈 여부가 다음 판단 기준이에요.`,
    level: s.windowLow,
  };
}

/**
 * 최소 verdict(WO 1.6 B) — 가격 구조가 부족해도 verdict 박스는 항상 있다.
 * 억지 enter/avoid 금지: 항상 관망 + 확인된 신호 근거만. 레벨을 계산할 수 없으니 무효화는 생략(가짜 레벨 금지).
 */
function minimalVerdict(input: VerdictInput): CardVerdict {
  const evidence = [...signalBullFactors(input), ...signalBearFactors(input)]
    .slice(0, 3)
    .map((f) => f.text)
    .filter(hasMeasuredValue);
  const days = input.candles.length;
  return {
    stance: "watch",
    stanceText: `가격 이력 ${days}거래일뿐이라 신호가 쌓이는 중 — 지금은 관찰 구간이에요.`,
    evidence,
    confidence: "low",
  };
}

/**
 * 카드 판단 계산 — 결정론(같은 입력 → 같은 출력).
 * 캔들 30거래일 미만이면 최소 verdict(관망·신호 축적) — 판단 박스 없는 카드 금지(WO 1.6).
 */
export function computeCardVerdict(input: VerdictInput): CardVerdict {
  const s = priceStructure(input.candles);
  if (!s) return minimalVerdict(input);
  const currency = input.currency ?? "KRW";
  const ta = computeTechnicalAnalysis(input.candles);
  const rsi = ta.latest?.rsi14;
  const squeeze = ta.inputs.bollingerSqueeze === true;
  const phase = wyckoffPhase(s, squeeze, input.volumeRatio);

  const bulls = bullFactors(input, s, currency);
  const bears = bearFactors(input, s, rsi, currency);
  const hasInflow = bulls.some((f) => f.kind === "insider" || f.kind === "flow");
  const hasOutflow = bears.some((f) => f.kind === "flow");
  const overheated = num(rsi) && rsi >= 70;

  let stance: VerdictStance;
  let driver: Driver;
  if (phase === "accumulation" && hasInflow) {
    stance = "enter";
    driver = "accumulation_inflow";
  } else if (phase === "markup" && !overheated && (hasInflow || bulls.some((f) => f.kind === "volume"))) {
    stance = "enter";
    driver = "markup_confirmed";
  } else if ((phase === "distribution" || phase === "markdown") && (hasOutflow || bears.length >= 2)) {
    stance = "avoid";
    driver = phase === "distribution" ? "phase_exit" : "markdown";
  } else if (phase === "markdown") {
    stance = "avoid";
    driver = "markdown";
  } else if (bulls.length >= 2 && bears.length === 0) {
    stance = "enter";
    driver = "signal_stack";
  } else if (bears.length >= 2 && bulls.length === 0) {
    stance = "avoid";
    driver = "signal_drain";
  } else {
    stance = "watch";
    driver = overheated && phase === "markup" ? "overheat" : bulls.length > 0 && bears.length > 0 ? "mixed" : "quiet";
  }

  const sided = stance === "enter" ? bulls : stance === "avoid" ? bears : [...bulls, ...bears];
  const evidence: string[] = [];
  if (phase) evidence.push(phaseEvidence(phase, s, currency).text);
  for (const f of sided) {
    if (evidence.length >= 3) break;
    if (!evidence.includes(f.text) && hasMeasuredValue(f.text)) evidence.push(f.text);
  }

  const sidedCount = stance === "enter" ? bulls.length : stance === "avoid" ? bears.length : Math.max(bulls.length, bears.length);
  const confidence: CardVerdict["confidence"] =
    phase && sidedCount >= 2 ? "high" : phase || sidedCount >= 2 ? "medium" : "low";

  const invalidation = invalidationOf(stance, driver, s, currency);
  return {
    stance,
    stanceText: assembleStanceText(stance, driver, bulls, bears, s, rsi, currency),
    ...(phase ? { phase } : {}),
    evidence,
    invalidation: invalidation.text,
    invalidationLevel: invalidation.level,
    confidence,
  };
}
