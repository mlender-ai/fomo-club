// 타로 카드 기본 타입

export type TarotCardId =
  | "the-fool" | "the-magician" | "the-high-priestess" | "the-empress"
  | "the-emperor" | "the-hierophant" | "the-lovers" | "the-chariot"
  | "strength" | "the-hermit" | "wheel-of-fortune" | "justice"
  | "the-hanged-man" | "death" | "temperance" | "the-devil"
  | "the-tower" | "the-star" | "the-moon" | "the-sun"
  | "judgement" | "the-world";

export type TarotCardOrientation = "upright" | "reversed";

export type TarotSpreadType = "single" | "three-card";

export type TarotSlot = "past" | "present" | "future";

export type MarketCondition = "bullish" | "bearish" | "neutral" | "volatile" | "consolidating";

export type InterpretationSource = "llm" | "cache" | "fallback";

export type DrawCost = {
  single: number;
  threeCard: number;
};

export interface TarotCardMeta {
  id: TarotCardId;
  name: string;
  nameKo: string;
  arcana: "major";
  number: number;
  keywords: string[];
  keywordsKo: string[];
  meaningUpright: string;
  meaningReversed: string;
  imageUrl: string;
  toneGuide: string;
  isActive: boolean;
}

export interface MarketSnapshot {
  ticker: string;
  market: "US" | "KR";
  price: number;
  changePercent: number;
  volume: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHistogram?: number;
  sma20?: number;
  sma50?: number;
  sma200?: number;
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  support20?: number;
  resistance20?: number;
  sentimentScore?: number;
  // 종목 정체성 — 카드 해석 풍경에 활용. 숫자 자체는 프롬프트에 노출되지 않고 심리 표현으로 번역됨.
  name?: string;            // 회사 이름 (예: "Apple Inc.")
  sector?: string;          // 섹터 (예: "Technology")
  industry?: string;        // 산업 (예: "Consumer Electronics")
  marketCap?: number;       // 시가총액 (대형/중형/소형 심리 차이)
  fiftyTwoWeekPosition?: number; // 0~1, 52주 범위 내 현재 위치
  condition: MarketCondition;
  summary: string;
}

export interface DrawnCard {
  card: TarotCardMeta;
  orientation: TarotCardOrientation;
  slot?: TarotSlot;
}

export interface TarotInterpretation {
  drawId: string;
  ticker: string;
  spread: TarotSpreadType;
  cards: DrawnCard[];
  headline: string;
  summary: string;
  detail: string;
  disclaimer: string;
  source: InterpretationSource;
  cachedAt?: string;
  createdAt: string;
}

export interface DrawRequest {
  ticker: string;
  market: "US" | "KR";
  spread: TarotSpreadType;
  userId: string;
  idempotencyKey: string;
}

export interface CreditLedgerEntry {
  userId: string;
  amount: number;
  reason: "purchase" | "reward_ad" | "draw_single" | "draw_three" | "signup_bonus";
  referenceId?: string;
}
