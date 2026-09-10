/**
 * 종목 카드 — "왜 올랐나"를 친구 말투로. docs(CARD_FEED_DEV_SPEC v2).
 *
 * 절대 규칙(§0): 전문용어 금지(가이던스·EPS·어닝·펀더멘탈), 거래 부추김 금지(매수/매도/롱/숏),
 * 예측·단정 금지(과거 설명만), 포모 균형추 필수(들뜬 종목엔 "따라가는 거 조심", 조용하면 "안 급해도 돼").
 * 지금은 손으로 쓴 mock — 실제 "왜" 생성 엔진은 다음 단계(§5).
 */

export interface StockDepth {
  /** "오늘은 왜 이랬어?" 류 제목. */
  whyTitle: string;
  /** 수급/분위기를 말로 풀어서(용어 없이). */
  why: string;
  /** "이건 알아두면 좋아" 류 제목. */
  learnTitle: string;
  /** 다음 이벤트/개념을 용어 없이 친구처럼. */
  learn: string;
}

export interface StockCard {
  id: string;
  /** 티커(예: NVDA, 005930). */
  ticker: string;
  /** 종목명(예: 엔비디아). */
  name: string;
  /** 현재가 표기(통화 포함, 예: "$182.40" / "182,400원"). */
  priceText: string;
  /** 어제 대비 등락률(%). 상승 양수/하락 음수. */
  changePct: number;
  /** 로고 대체 모노그램(1~2자). 실제 로고 이미지는 후속. */
  mono: string;
  /** 로고 배경 포인트색(hex). */
  accent: string;
  /** 포모 한마디(3~4줄, §1 톤 + 균형추). */
  comment: string;
  depth: StockDepth;
}
