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
  /** 무효화 조건 1개 — 실제 캔들에서 계산한 레벨 기반. */
  invalidation: string;
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
  return undefined;
}

const PHASE_TEXT: Record<WyckoffPhase, string> = {
  accumulation: "저점권 횡보에 거래가 수축된 축적형 구조",
  markup: "이동평균 정배열에 거래량이 붙은 상승 국면",
  distribution: "고점권에서 거래는 늘고 가격은 정체된 분산형 구조",
  markdown: "이동평균 역배열에 저점을 갱신 중인 하락 국면",
};

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

function stanceText(stance: VerdictStance, driver: Driver, primaryEvidenceKind: string | undefined): string {
  if (stance === "enter") {
    if (driver === "accumulation_inflow") {
      return primaryEvidenceKind === "insider"
        ? "저점 다지기 구간에 내부자 매수가 겹쳐, 분할 진입을 검토할 만한 자리로 보여요."
        : "저점 다지기 구간에 기관·외국인 유입이 붙어, 분할 진입을 검토할 만한 자리로 보여요.";
    }
    if (driver === "markup_confirmed") {
      return "추세 초입에 거래량 확인이 붙어, 흐름을 따라가 볼 만한 자리로 보여요.";
    }
    return "가격 구조보다 신호 조합이 먼저 좋아진 상태 — 가볍게 진입을 검토할 만해요.";
  }
  if (stance === "avoid") {
    if (driver === "phase_exit") return "고점권 분산에 수급 이탈이 겹쳐, 지금 들어갈 자리는 아니에요.";
    if (driver === "markdown") return "하락 추세가 진행 중이라, 바닥 확인 전엔 피하는 게 맞아요.";
    return "확인되는 신호가 약세 쪽에 몰려 있어, 지금은 피할 구간이에요.";
  }
  if (driver === "overheat") return "추세는 살아 있지만 단기 과열 상태 — 눌림을 기다려 볼 구간이에요.";
  if (driver === "mixed") return "강세·약세 신호가 상충해, 지금은 지켜볼 구간이에요.";
  return "판단을 기울일 확인 신호가 아직 부족해요. 관찰 목록에 두는 정도가 맞아요.";
}

interface Factor {
  kind: string;
  text: string;
}

function bullFactors(input: VerdictInput, s: PriceStructure): Factor[] {
  const out: Factor[] = [];
  const insiderCount = input.insider?.insiderCount;
  if (num(insiderCount) && insiderCount >= 2) {
    const valueUsd = input.insider?.valueUsd;
    const valueText = num(valueUsd) && valueUsd > 0 ? ` 총 $${Math.round(valueUsd / 1000).toLocaleString("en-US")}k` : "";
    out.push({ kind: "insider", text: `내부자 ${insiderCount}인이${valueText} 동반 매수(공시 확인)` });
  } else if (input.insider?.confirmed === true) {
    out.push({ kind: "insider", text: "내부자 공개시장 매수 공시 확인" });
  }
  if (num(input.foreignNetStreak) && input.foreignNetStreak >= 3) {
    out.push({ kind: "flow", text: `외국인 ${input.foreignNetStreak}일 연속 순매수` });
  }
  if (num(input.institutionNetStreak) && input.institutionNetStreak >= 3) {
    out.push({ kind: "flow", text: `기관 ${input.institutionNetStreak}일 연속 순매수` });
  }
  if (num(input.materialStrength) && input.materialStrength >= 0.6) {
    out.push({ kind: "material", text: "이 종목을 직접 언급한 재료(뉴스·공시)가 확인됨" });
  }
  if (num(input.volumeRatio) && input.volumeRatio >= 1.5) {
    out.push({ kind: "volume", text: `거래량이 20일 평균의 ${input.volumeRatio.toFixed(1)}배` });
  }
  if (num(s.ma20) && num(s.ma60) && s.ma20 > s.ma60 && s.close > s.ma20) {
    out.push({ kind: "trend", text: "20·60일선 정배열 위에서 가격 유지 중" });
  }
  return out;
}

function bearFactors(input: VerdictInput, s: PriceStructure, rsi: number | undefined): Factor[] {
  const out: Factor[] = [];
  if (num(input.foreignNetStreak) && input.foreignNetStreak <= -3) {
    out.push({ kind: "flow", text: `외국인 ${Math.abs(input.foreignNetStreak)}일 연속 순매도` });
  }
  if (num(input.institutionNetStreak) && input.institutionNetStreak <= -3) {
    out.push({ kind: "flow", text: `기관 ${Math.abs(input.institutionNetStreak)}일 연속 순매도` });
  }
  if (num(rsi) && rsi >= 70) {
    out.push({ kind: "overheat", text: `RSI ${Math.round(rsi)} — 단기 과열 영역` });
  }
  if (num(s.ma20) && num(s.ma60) && s.ma20 < s.ma60 && s.close < s.ma20) {
    out.push({ kind: "trend", text: "20·60일선 역배열 아래에서 가격 하락 중" });
  }
  if (s.recentNewLow) {
    out.push({ kind: "newlow", text: `${s.windowText} 저점을 최근 갱신` });
  }
  return out;
}

function phaseEvidence(phase: WyckoffPhase, s: PriceStructure, currency: "KRW" | "USD"): Factor {
  if (phase === "accumulation") {
    const pct = ((s.close / s.windowLow - 1) * 100).toFixed(1);
    return { kind: "phase", text: `${s.windowText} 저점 ${formatVerdictLevel(s.windowLow, currency)} 대비 +${pct}% — ${PHASE_TEXT[phase]}` };
  }
  if (phase === "distribution") {
    const pct = ((1 - s.close / s.windowHigh) * 100).toFixed(1);
    return { kind: "phase", text: `${s.windowText} 고점 ${formatVerdictLevel(s.windowHigh, currency)} 대비 -${pct}% — ${PHASE_TEXT[phase]}` };
  }
  return { kind: "phase", text: PHASE_TEXT[phase] };
}

function invalidationText(
  stance: VerdictStance,
  driver: Driver,
  s: PriceStructure,
  currency: "KRW" | "USD"
): string {
  if (stance === "enter") {
    if (driver === "accumulation_inflow") {
      return `${s.windowText} 저점 ${formatVerdictLevel(s.windowLow, currency)} 이탈 시 이 관점은 무효예요.`;
    }
    if (num(s.ma20)) {
      return `20일선 ${formatVerdictLevel(s.ma20, currency)} 아래 마감 시 이 관점은 무효예요.`;
    }
    return `${s.windowText} 저점 ${formatVerdictLevel(s.windowLow, currency)} 이탈 시 이 관점은 무효예요.`;
  }
  if (stance === "avoid") {
    if (num(s.ma20)) {
      return `20일선 ${formatVerdictLevel(s.ma20, currency)} 위 마감 시 약세 관점은 무효예요.`;
    }
    return `${s.windowText} 고점 ${formatVerdictLevel(s.windowHigh, currency)} 회복 시 약세 관점은 무효예요.`;
  }
  return `${s.windowText} 저점 ${formatVerdictLevel(s.windowLow, currency)} 이탈 여부가 다음 판단 기준이에요.`;
}

/**
 * 카드 판단 계산 — 결정론(같은 입력 → 같은 출력).
 * 캔들 30거래일 미만이면 undefined(판단 보류 — 가짜 판단 금지).
 */
export function computeCardVerdict(input: VerdictInput): CardVerdict | undefined {
  const s = priceStructure(input.candles);
  if (!s) return undefined;
  const currency = input.currency ?? "KRW";
  const ta = computeTechnicalAnalysis(input.candles);
  const rsi = ta.latest?.rsi14;
  const squeeze = ta.inputs.bollingerSqueeze === true;
  const phase = wyckoffPhase(s, squeeze, input.volumeRatio);

  const bulls = bullFactors(input, s);
  const bears = bearFactors(input, s, rsi);
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
    if (!evidence.includes(f.text)) evidence.push(f.text);
  }

  const sidedCount = stance === "enter" ? bulls.length : stance === "avoid" ? bears.length : Math.max(bulls.length, bears.length);
  const confidence: CardVerdict["confidence"] =
    phase && sidedCount >= 2 ? "high" : phase || sidedCount >= 2 ? "medium" : "low";

  return {
    stance,
    stanceText: stanceText(stance, driver, sided[0]?.kind),
    ...(phase ? { phase } : {}),
    evidence,
    invalidation: invalidationText(stance, driver, s, currency),
    confidence,
  };
}
