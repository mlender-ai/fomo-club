/**
 * LAB-03 §0 — **시작 전에 정한 것.** 한 곳에만 둔다.
 *
 * | 항목 | 결정 | 근거 |
 * |---|---|---|
 * | 봉·실시간·펀딩비 | **Binance 공개 API** | 아래 "거래소가 왜 바뀌었나" |
 * | 고래 | **Hyperliquid** | FCE 이식 대상이 여기다 |
 * | 종목 | **BTC · ETH · SOL** | §0 기본값 |
 * | 주기 | **1시간 + 일봉** | §0 기본값 |
 * | 기간 | **3년** | §0 기본값 |
 *
 * ## 거래소가 왜 §0 기본값(Hyperliquid)과 다른가 — 실측 (2026-09-13)
 *
 * Hyperliquid `candleSnapshot` 은 **최근 5,000봉만** 준다. 1시간봉이면 ≈208일이고,
 * 과거 구간을 지정해 요청하면 **0봉**이 온다. 1시간봉 3년(26,280봉)이 물리적으로 불가능하다.
 * (일봉은 5년 넘게 나온다 — 문제는 1시간봉이다.)
 *
 * §0 이 Hyperliquid 를 고른 근거는 "FCE에 이미 있음" 인데, FCE 를 읽어보니
 * `onchain/hyperliquid/` 는 **고래 수집기**(leaderboard·clearinghouseState)이고
 * 봉·체결 어댑터는 `exchange/bitget/` 이다. 즉 그 근거는 PART C 에 해당하지
 * PART A 에 해당하지 않는다.
 *
 * 종목·주기·기간은 §0 그대로 지킨다. **거래소만 바꿨다.**
 * `Candle.source` 가 있으므로 나중에 소스를 갈아 끼울 수 있다.
 */

/** 대상 종목. **처음부터 많이 넣지 않는다**(하지 말 것 2). */
export const SYMBOLS = ["BTC", "ETH", "SOL"] as const;
export type Symbol = (typeof SYMBOLS)[number];

/** 랩 심볼 → Binance 현물 페어. */
export const BINANCE_PAIR: Record<Symbol, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  SOL: "SOLUSDT",
};

/** 랩 심볼 → Binance 무기한 선물 심볼(펀딩비용). */
export const BINANCE_PERP: Record<Symbol, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  SOL: "SOLUSDT",
};

export const INTERVALS = ["H1", "D1"] as const;
export type IntervalKey = (typeof INTERVALS)[number];

export const BINANCE_INTERVAL: Record<IntervalKey, string> = {
  H1: "1h",
  D1: "1d",
};

/** 과거 백필 기간(년). */
export const BACKFILL_YEARS = 3;

/** 소스 태그. `Candle.source` 에 그대로 들어간다. */
export const SOURCE_CANDLE = "binance-spot";
export const SOURCE_FUNDING = "binance-perp";
export const SOURCE_PRICE = "binance-spot";
export const SOURCE_WHALE = "hyperliquid";

/**
 * 실시간 시세가 이만큼 안 들어오면 **stale** 이다(PART B-2).
 *
 * 수집 주기가 1분일 때 3분을 넘겼다는 것은 연속 3회를 놓쳤다는 뜻이다.
 * 한 번 놓친 것으로 매매를 멈추면 잡음에 흔들리고, 너무 길게 잡으면
 * **끊긴 채로 매매하게 된다** — 그러면 성과가 거짓이 된다.
 */
export const STALE_AFTER_MS = 3 * 60 * 1000;

/** 이 횟수만큼 연속 실패하면 알린다(PART E-1). */
export const ALERT_AFTER_CONSECUTIVE_FAILURES = 2;

/**
 * 관측할 고래 지갑 수.
 *
 * FCE `c0e4805` 의 교훈: **한 번 정한 코호트를 유지한다.** 매 실행 재선발하면
 * 빠진 지갑의 관측이 끊겨 표본이 자라지 않는다.
 */
export const WHALE_COHORT_SIZE = 30;

/** 이보다 작은 포지션은 기록하지 않는다(USD 명목). */
export const WHALE_MIN_SIZE_USD = 100_000;
