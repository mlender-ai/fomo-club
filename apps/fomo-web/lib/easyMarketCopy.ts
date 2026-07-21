import type {
  CardFrontSignals,
  CardVerdict,
  SignalTypeCode,
  WyckoffAnalysis,
  WyckoffEvent,
} from "@fomo/core";

export type MarketTermKey =
  | "impulse"
  | "downImpulse"
  | "pullback"
  | "accumulation"
  | "spring"
  | "upthrust"
  | "alignment"
  | "rsiHot";

export const MARKET_TERM_GLOSSARY: Record<MarketTermKey, { card: string; detail: string; explanation: string }> = {
  impulse: {
    card: "급등 파동",
    detail: "급등 파동(임펄스)",
    explanation: "짧은 기간에 가격과 거래량이 함께 강하게 위로 움직인 구간이에요.",
  },
  downImpulse: {
    card: "급락 파동",
    detail: "급락 파동(하방 임펄스)",
    explanation: "짧은 기간에 가격이 큰 폭으로 아래로 움직인 구간이에요.",
  },
  pullback: {
    card: "상승 후 잠깐 쉬는 구간",
    detail: "상승 후 잠깐 쉬는 구간(눌림목)",
    explanation: "상승 뒤 가격이 일부 되돌리며 지지 여부를 확인하는 구간이에요.",
  },
  accumulation: {
    card: "조용히 사 모으는 구간",
    detail: "조용히 사 모으는 구간(매집)",
    explanation: "가격 변동폭과 거래량이 줄면서 저점이 높아지는 구간을 뜻해요.",
  },
  spring: {
    card: "바닥 다지는 반등 시도",
    detail: "바닥 다지는 반등 시도(스프링)",
    explanation: "구간 하단을 잠깐 이탈한 뒤 1~3일 안에 회복한 움직임이에요.",
  },
  upthrust: {
    card: "고점 이탈 실패",
    detail: "고점 이탈 실패(업스러스트)",
    explanation: "구간 상단을 돌파했다가 다시 안으로 밀린 움직임이에요.",
  },
  alignment: {
    card: "이평선이 위로 정렬",
    detail: "이평선이 위로 정렬(정배열)",
    explanation: "단기 이동평균선이 중·장기선 위에 놓인 상승 추세 배열이에요.",
  },
  rsiHot: {
    card: "단기 과열",
    detail: "단기 과열(RSI)",
    explanation: "RSI가 70을 넘은 상태로, 최근 상승 속도가 빨랐다는 뜻이에요.",
  },
};

type CopyMode = "card" | "detail";

/** 카드에서는 쉬운말만, 뎁스에서는 첫 전문용어를 쉬운말과 함께 보여준다. */
export function easyMarketCopy(text: string | undefined, mode: CopyMode): string | undefined {
  if (!text?.trim()) return undefined;
  let output = text;
  const tokens: Array<{ token: string; replacement: string }> = [];
  const mark = (replacement: string): string => {
    const token = `__FOMO_EASY_TERM_${tokens.length}__`;
    tokens.push({ token, replacement });
    return token;
  };
  const replace = (pattern: RegExp, key: MarketTermKey) => {
    output = output.replace(pattern, () => mark(MARKET_TERM_GLOSSARY[key][mode]));
  };
  replace(/하방\s*임펄스/, "downImpulse");
  replace(/임펄스/, "impulse");
  replace(/눌림목/, "pullback");
  replace(/매집(?:\s*추정)?\s*구간|매집\s*구간|매집/, "accumulation");
  replace(/스프링(?:\s*후보)?/, "spring");
  replace(/업스러스트(?:\s*후보)?/, "upthrust");
  replace(/정배열/, "alignment");
  output = output.replace(/RSI\s*(\d+(?:\.\d+)?)\s*(?:과열|과열권|과열 영역)/, (_match, value: string) =>
    mark(mode === "card" ? `단기 과열 ${value}` : `단기 과열(RSI ${value})`)
  );
  for (const item of tokens) output = output.replace(item.token, item.replacement);
  return output;
}

function latestEvents(analysis: WyckoffAnalysis | undefined): WyckoffEvent[] {
  if (!analysis) return [];
  const cutoff = Math.max(0, analysis.sourceLength - 20);
  return analysis.events.filter((event) => event.index >= cutoff).sort((a, b) => b.index - a.index);
}

function compactMove(value: number | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function shortDate(date: string | undefined): string {
  if (!date) return "최근";
  const compact = date.match(/^\d{4}(\d{2})(\d{2})$/);
  if (compact) return `${Number(compact[1])}/${Number(compact[2])}`;
  const dashed = date.match(/(?:\d{4}-)?(\d{2})-(\d{2})/);
  return dashed ? `${Number(dashed[1])}/${Number(dashed[2])}` : date;
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

export interface CardHookInput {
  signals: Partial<CardFrontSignals>;
  signalTypes?: readonly SignalTypeCode[];
  wyckoff?: WyckoffAnalysis;
  verdict?: CardVerdict;
  fallback?: string;
}

export interface CardHookCopy {
  chips: string[];
  hook: string;
}

/** 숫자와 판정은 입력값만 사용한다. 카드용 신호 칩과 '왜 봐야 하나'를 결정론으로 조립한다. */
export function buildCardHookCopy(input: CardHookInput): CardHookCopy {
  const signals = input.signals;
  const types = new Set(input.signalTypes ?? []);
  const events = latestEvents(input.wyckoff);
  const currentZone = input.wyckoff?.currentZone;
  const foreign = signals.foreignNetStreak ?? 0;
  const institution = signals.institutionNetStreak ?? 0;
  const impulse = events.find((event) => event.kind === "impulse");
  const spring = events.find((event) => event.kind === "spring");
  const pullback = events.find((event) => event.kind === "pullback");
  const upthrust = events.find((event) => event.kind === "upthrust");

  const chips = unique([
    types.has("cluster_multi") ? "여러 주체 동시 유입" : undefined,
    types.has("insider_cluster") ? "내부자 동반 매수" : undefined,
    foreign >= 3 ? `외국인 ${foreign}일` : undefined,
    institution >= 3 ? `기관 ${institution}일` : undefined,
    currentZone?.kind === "accumulation" ? `사 모으는 구간 ${currentZone.weeks}주차` : undefined,
    spring ? MARKET_TERM_GLOSSARY.spring.card : undefined,
    pullback ? MARKET_TERM_GLOSSARY.pullback.card : undefined,
    impulse ? (impulse.direction === "down" ? MARKET_TERM_GLOSSARY.downImpulse.card : MARKET_TERM_GLOSSARY.impulse.card) : undefined,
    upthrust ? MARKET_TERM_GLOSSARY.upthrust.card : undefined,
    typeof signals.volumeRatio === "number" && signals.volumeRatio >= 1.5 ? `거래량 ${signals.volumeRatio.toFixed(1)}배` : undefined,
    types.has("whale_inflow") ? "고래 유입" : undefined,
    types.has("material_contract") ? "계약·수주" : undefined,
    types.has("material_earnings") ? "실적 변화" : undefined,
    types.has("material_regulatory") ? "승인·규제" : undefined,
  ]).slice(0, 2);

  let hook: string | undefined;
  if (types.has("cluster_multi")) {
    hook = "서로 다른 자금 주체가 같은 기간에 함께 들어왔어요.";
  } else if (currentZone?.kind === "accumulation" && foreign >= 3) {
    hook = `조용히 사 모으는 ${currentZone.weeks}주차에 외국인 순매수가 ${foreign}일째 이어져요.`;
  } else if (currentZone?.kind === "accumulation" && institution >= 3) {
    hook = `조용히 사 모으는 ${currentZone.weeks}주차에 기관 순매수가 ${institution}일째 이어져요.`;
  } else if (foreign >= 3) {
    hook = `조용한 흐름 속 외국인이 ${foreign}일째 순매수 중이에요.`;
  } else if (institution >= 3) {
    hook = `조용한 흐름 속 기관이 ${institution}일째 순매수 중이에요.`;
  } else if (spring) {
    hook = `${shortDate(spring.date)} 바닥 다지는 반등 시도가 포착됐어요.`;
  } else if (pullback) {
    const retracement = typeof pullback.retracementPct === "number" ? ` · ${pullback.retracementPct.toFixed(1)}% 되돌림` : "";
    hook = `상승 후 잠깐 쉬는 구간이에요${retracement}.`;
  } else if (impulse) {
    const direction = impulse.direction === "down" ? "급락" : "급등";
    const move = compactMove(impulse.movePct);
    hook = `${shortDate(impulse.date)} ${direction} 파동${move ? `(${move})` : ""}이 발생했어요.`;
  } else if (signals.newsEventLabel) {
    hook = `지금 확인할 변화 · ${signals.newsEventLabel}`;
  } else {
    hook = input.verdict?.stanceText ?? input.fallback ?? "가격·거래량에서 오늘 달라진 점을 확인해 보세요.";
  }

  return { chips, hook: easyMarketCopy(hook, "card") ?? hook };
}

export function scoreSignalType(score: number): SignalTypeCode {
  return score >= 80 ? "score_80_plus" : score >= 60 ? "score_60_79" : "score_below_60";
}

export function termKeysForAnalysis(analysis: WyckoffAnalysis | undefined, rsi14?: number, hasAlignment = false): MarketTermKey[] {
  const keys: MarketTermKey[] = [];
  if (analysis?.currentZone?.kind === "accumulation") keys.push("accumulation");
  for (const event of analysis?.events ?? []) {
    if (event.kind === "spring") keys.push("spring");
    if (event.kind === "upthrust") keys.push("upthrust");
    if (event.kind === "pullback") keys.push("pullback");
    if (event.kind === "impulse") keys.push(event.direction === "down" ? "downImpulse" : "impulse");
  }
  if (hasAlignment) keys.push("alignment");
  if (typeof rsi14 === "number" && rsi14 >= 70) keys.push("rsiHot");
  return [...new Set(keys)];
}
