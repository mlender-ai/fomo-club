import type { DrawnCard, MarketSnapshot } from "../types.js";
import { buildInterpretationPromptV2_2, type FinancialContext } from "./interpret-v2.2.0.js";

// 프롬프트 버전: v2.3.0
// 핵심 변경: THREE_CARD 스프레드 전용 슬롯-시장데이터 매핑 + 스토리텔링 강화
// - 과거 슬롯: 52주 위치·SMA200·매출 성장 → "이 종목과의 인연"
// - 현재 슬롯: RSI·MACD·볼린저 → "지금 이 순간"
// - 미래 슬롯: 지지/저항·부채·현금흐름·ROE → 리스크·회복력 심리
// v2.2.0 대비: 단일 카드는 v2.2.0과 동일. 3장 스프레드에서만 강화 적용.
export const PROMPT_VERSION_2_3 = "2.3.0";

// 과거 슬롯: 52주 역사 + SMA200 장기 추세 + 성장 궤적
function buildPastContext(market: MarketSnapshot, ctx?: FinancialContext): string {
  const signals: string[] = [];

  if (market.fiftyTwoWeekPosition !== undefined) {
    const p = market.fiftyTwoWeekPosition;
    if (p >= 0.7) signals.push("지난 1년 이 종목은 기대를 받아온 자리에 있었습니다");
    else if (p >= 0.35) signals.push("지난 1년 이 종목은 중간에서 방향을 찾아온 이력이 있습니다");
    else signals.push("지난 1년 이 종목은 외면 속에서 버텨온 시간이 있습니다");
  }

  if (market.sma200 !== undefined) {
    if (market.price > market.sma200 * 1.05) {
      signals.push("오랜 시간 믿어온 투자자들이 여전히 이기고 있는 흐름");
    } else if (market.price < market.sma200 * 0.95) {
      signals.push("오래 기다려온 사람들까지 손실 구간에 들어선 상황");
    }
  }

  if (ctx?.revenueGrowth != null) {
    if (ctx.revenueGrowth > 0.2) signals.push("성장이 가파르게 쌓여온 기업의 역사");
    else if (ctx.revenueGrowth < -0.1) signals.push("성장이 꺾이기 시작한 전환의 역사를 가진 기업");
  }

  return signals.join(". ");
}

// 현재 슬롯: RSI + MACD + 볼린저 → 지금 이 순간의 군중 심리
function buildPresentContext(market: MarketSnapshot): string {
  const signals: string[] = [];

  if (market.rsi !== undefined) {
    if (market.rsi >= 70) signals.push("지금 군중의 탐욕이 극에 달한 순간");
    else if (market.rsi >= 55) signals.push("지금 낙관이 조심스럽게 번지는 순간");
    else if (market.rsi >= 40) signals.push("지금 군중이 방향을 잃고 눈치를 보는 순간");
    else signals.push("지금 군중의 비관이 깊어지는 순간");
  }

  if (market.macd !== undefined && market.macdSignal !== undefined) {
    if (market.macd > market.macdSignal) {
      signals.push("에너지가 상승 쪽으로 기울기 시작한 변곡점");
    } else {
      signals.push("에너지가 하락 쪽으로 기울고 있는 국면");
    }
  }

  if (market.bbUpper && market.bbLower && market.bbMiddle) {
    const posRatio = (market.price - market.bbLower) / (market.bbUpper - market.bbLower);
    if (posRatio > 0.8) signals.push("군중의 기대를 넘어선 과열 구간");
    else if (posRatio < 0.2) signals.push("군중의 기대 아래로 내려온 위축 구간");
  }

  return signals.join(". ");
}

// 미래 슬롯: 지지/저항 + 재무 리스크(부채·현금) + 회복력(ROE)
function buildFutureContext(market: MarketSnapshot, ctx?: FinancialContext): string {
  const signals: string[] = [];

  if (market.support20 !== undefined && market.resistance20 !== undefined) {
    const range = market.resistance20 - market.support20;
    if (range > 0) {
      const pos = (market.price - market.support20) / range;
      if (pos > 0.75) signals.push("저항이 가까운 앞날 — 돌파냐 후퇴냐의 갈림길이 다가옵니다");
      else if (pos < 0.25) signals.push("지지선 근처 — 여기서 버텨내는지가 앞날을 가릅니다");
    }
  }

  if (ctx?.debtToEquity != null) {
    if (ctx.debtToEquity > 200) signals.push("높은 부채가 앞날의 변동성을 키우는 요소");
    else if (ctx.debtToEquity < 30) signals.push("탄탄한 재무 구조가 앞날의 여유를 만들어줍니다");
  }

  if (ctx?.freeCashflow != null) {
    if (ctx.freeCashflow > 0) signals.push("현금이 들어오는 구조 — 위기에도 버틸 체력이 있습니다");
    else signals.push("현금을 쓰는 시기 — 성장에 베팅 중이지만 여유가 줄어드는 국면");
  }

  if (ctx?.returnOnEquity != null) {
    if (ctx.returnOnEquity > 0.15) signals.push("자본을 잘 굴리는 기업 — 역경 뒤 회복력이 있는 구조");
    else if (ctx.returnOnEquity < 0) signals.push("아직 자본을 수익으로 전환하지 못하는 단계 — 인내가 필요한 미래");
  }

  return signals.join(". ");
}

function buildSlotContextSection(
  market: MarketSnapshot,
  ctx: FinancialContext | undefined
): string {
  const pastCtx = buildPastContext(market, ctx);
  const presentCtx = buildPresentContext(market);
  const futureCtx = buildFutureContext(market, ctx);

  const parts: string[] = [];
  if (pastCtx) parts.push(`- 과거 슬롯 (이 종목과의 인연): ${pastCtx}`);
  if (presentCtx) parts.push(`- 현재 슬롯 (지금 이 순간): ${presentCtx}`);
  if (futureCtx) parts.push(`- 미래 슬롯 (앞으로 마주할 것): ${futureCtx}`);

  if (parts.length === 0) return "";
  return `## 3장 스프레드 — 슬롯별 심리 지형\n${parts.join("\n")}\n\n`;
}

const THREE_CARD_RULE_ORIGINAL =
  "6. **3장 스프레드**: 과거의 집착 → 현재의 혼란 → 미래의 선택으로 감정 여정을 서술한다.";

const THREE_CARD_RULE_V2_3 = `6. **3장 스프레드 스토리텔링 (v2.3)**:
   - 세 카드를 독립 해석이 아닌 하나의 감정 여정 아크로 엮는다.
   - 과거 카드: "슬롯별 심리 지형"의 과거 맥락과 연결 — 이 종목과 투자자의 인연이 어떻게 시작되었는지
   - 현재 카드: 현재 맥락과 연결 — 지금 이 순간 투자자가 느끼는 심리적 혼돈 또는 명료함
   - 미래 카드: 미래 맥락의 리스크·회복력 신호와 연결 — 앞으로 마주할 선택과 그 자세
   - detail 마지막 문단에 세 카드를 하나로 잇는 "감정 아크" 한 줄을 담는다.`;

const DETAIL_LENGTH_ORIGINAL = '"detail": "카드별 감정 서사 + 마지막은 자세 제안 (300-500자)"';
const DETAIL_LENGTH_V2_3 = '"detail": "카드별 감정 서사 + 마지막은 감정 아크 + 자세 제안 (500-700자)"';

/**
 * v2.3.0 프롬프트 빌더. 시그니처는 v2.2.0 호환.
 * - 단일 카드: v2.2.0과 동일한 출력.
 * - 3장 스프레드: 슬롯별 심리 지형 섹션 + 스토리텔링 강화 규칙 추가.
 */
export function buildInterpretationPromptV2_3(
  market: MarketSnapshot,
  cards: DrawnCard[],
  ctx?: FinancialContext
): string {
  const base = buildInterpretationPromptV2_2(market, cards, ctx);

  if (cards.length !== 3) return base;

  const slotSection = buildSlotContextSection(market, ctx);

  let enhanced = slotSection
    ? base.replace("## 뽑힌 카드", `${slotSection}## 뽑힌 카드`)
    : base;

  enhanced = enhanced.replace(THREE_CARD_RULE_ORIGINAL, THREE_CARD_RULE_V2_3);
  enhanced = enhanced.replace(DETAIL_LENGTH_ORIGINAL, DETAIL_LENGTH_V2_3);

  return enhanced;
}
