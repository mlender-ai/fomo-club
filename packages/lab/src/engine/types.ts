/**
 * LAB-04 PART B — 실행기 타입.
 *
 * > **여기서 만든 실행기를 페이퍼(`LAB-07`)가 그대로 쓴다.** 데이터 소스만 갈아 끼운다.
 *
 * 그래서 이 파일에는 "백테스트" 라는 말이 타입 이름에 없다. 실행기는 자기가
 * 과거를 도는지 실시간을 도는지 모른다 — `DataSource` 만 안다.
 */

/** 봉 하나. `at` 은 **여는 시각, UTC**. */
export interface Bar {
  at: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

import type { FlowPoint } from "../signals";

/** 어느 종목의 봉인가. 다종목 소스는 시각 순서로 섞어서 내놓는다. */
export interface SourceBar {
  symbol: string;
  bar: Bar;
}

/**
 * PART B-1 — **이 인터페이스 하나로 백테스트와 페이퍼가 갈린다.**
 *
 * `next()` 가 null 을 주면 끝이다. 백테스트는 과거 배열이 떨어지면 끝나고,
 * 페이퍼는 끝나지 않는다(다음 봉을 기다린다).
 *
 * **봉이 자기 종목을 달고 온다.** 처음엔 `symbols()` 가 하나일 때만 돌게 해뒀는데
 * 그러면 유니버스가 여럿인 전략(LAB-06 은 셋 다 BTC·ETH·SOL 이다)이 통째로
 * 막힌다 — 실행기가 어느 종목의 봉인지 알 길이 없었다.
 */
export interface DataSource {
  /** 다음 봉. 없으면 null. */
  next(): SourceBar | null;
  /** 지금 값. 실행기가 평가액을 매길 때 쓴다. */
  price(symbol: string): number;
  now(): Date;
  /** 이 소스가 다루는 종목. */
  symbols(): readonly string[];
  /**
   * 이 시각이 데이터 구멍 안인가. **구멍 구간에서는 진입하지 않는다**(PART D).
   * 구멍을 모르는 소스는 항상 false 를 준다.
   */
  inGap(symbol: string, at: Date): boolean;
  /** 보유 중 차감할 펀딩비 요율. 해당 시각에 펀딩이 없으면 0. */
  fundingRate(symbol: string, at: Date): number;
  /** 고래 순포지션(USD). `whale_flow` 지표가 읽는다. 모르면 null. */
  whaleNet?(symbol: string, at: Date): number | null;
  /**
   * **참조 계열**(LAB-09) — 매매하지 않지만 판단에 쓰는 봉. 지금은 지수다.
   *
   * `at` **이하**의 봉만 돌려준다. 여기서 한 봉이라도 앞을 주면 `market_divergence`
   * 가 내일 지수를 보고 오늘 진입하게 된다 — look-ahead 는 성적이 좋아지는 쪽으로만
   * 생기므로 눈으로는 절대 안 보인다. **자르는 책임은 소스에 있고**,
   * `engine-lookahead.test.ts` 의 절단 불변성이 그것까지 검사한다.
   *
   * 어느 계열인지는 종목이 정한다 — 코스피 종목은 코스피, 나스닥 종목은 S&P.
   */
  reference?(symbol: string, at: Date): readonly Bar[] | null;
  /**
   * 수급(외국인·기관 일별). `at` **이하**만 돌려준다 — `reference` 와 같은 규칙이다.
   *
   * 수급은 **장 마감 뒤 확정된다.** 그래서 같은 날 봉에서 그날 수급을 보는 것은
   * 그날 종가로 진입하는 한 look-ahead 가 아니다(둘 다 마감 후에 안다). 다만 이 엔진은
   * **다음 봉 시가**에 체결하므로 실제로는 하루 뒤에 산다 — 그게 현실이다.
   */
  flows?(symbol: string, at: Date): readonly FlowPoint[] | null;
}

export type Side = "LONG" | "SHORT";
export type ExitReason = "STOP" | "TARGET" | "TIME" | "SIGNAL" | "MANUAL";

/** 보유 중인 포지션. */
export interface OpenPosition {
  symbol: string;
  side: Side;
  entryAt: Date;
  entryPrice: number;
  entryReason: string;
  qty: number;
  /** 손절가. **정의에 `stop_pct` 가 필수라 항상 있다.** */
  stopPrice: number;
  /** 목표가. 없으면 null. */
  targetPrice: number | null;
  /** 진입 시 낸 수수료 + 슬리피지(금액). */
  entryCost: number;
  /** 보유 중 누적 펀딩비(금액). 양수면 낸 것. */
  funding: number;
  /** 시간 청산 기준 봉 수. null 이면 시간 청산 없음. */
  maxHoldBars: number | null;
  barsHeld: number;
  /**
   * 청산 **신호**가 떴다. 다음 봉 시가에 닫는다(PART D — 신호 봉 종가 체결 금지).
   * 시간 청산으로 닫는 것과 구분해야 `exitReason` 이 거짓말을 안 한다.
   */
  exitSignalPending: boolean;
}

/** 닫힌 거래 한 건 = 포지션 하나의 생애. `Trade` 테이블과 1:1. */
export interface ClosedTrade {
  symbol: string;
  side: Side;
  entryAt: Date;
  entryPrice: number;
  entryReason: string;
  exitAt: Date;
  exitPrice: number;
  exitReason: ExitReason;
  qty: number;
  fee: number;
  slippage: number;
  funding: number;
  pnl: number;
  pnlPct: number;
  barsHeld: number;
}

/** 자산 스냅샷 한 점. */
export interface EquityPoint {
  at: Date;
  equity: number;
  cash: number;
  unrealized: number;
  /** 고점 대비 낙폭(음수 또는 0). */
  drawdown: number;
}

/**
 * 체결 가정. **가장 조작되기 쉬운 곳이다**(PART D).
 *
 * 기본값은 **보수적인 쪽**으로 잡는다 — 실제보다 유리하게 나오면 그 백테스트는
 * 판단 근거가 못 된다.
 */
export interface FillConfig {
  /** 왕복이 아니라 **한 쪽** 수수료율. 0.0005 = 0.05%. */
  takerFeeRate: number;
  /**
   * 슬리피지 하한(bps). 주문이 아무리 작아도 이만큼은 먹는다.
   * **0 으로 두지 않는다** — 0 슬리피지 백테스트는 거짓이다.
   */
  minSlippageBps: number;
  /**
   * 주문 명목 / 봉 거래대금 비율에 곱하는 계수(bps).
   * 봉 거래량의 1% 를 먹으면 `impactBps × 0.01` 만큼 추가로 밀린다.
   */
  impactBps: number;
  /** 레버리지. LAB-00 §7 — 기본 1배. */
  leverage: number;
}

export const DEFAULT_FILL: FillConfig = {
  // Binance 현물 taker 기본. LAB-03 이 Binance 봉을 쓰므로 그 요율을 쓴다.
  takerFeeRate: 0.001,
  minSlippageBps: 2,
  impactBps: 1000,
  leverage: 1,
};

/** 사이징. FCE `plan_position_size` 이식(결함 수정본). */
export interface SizingConfig {
  /** `risk_pct` 면 계좌의 이 비율만큼을 1R 로 건다. */
  mode: "risk_pct" | "fixed_pct" | "fixed_notional";
  value: number;
  /**
   * 명목 상한(계좌 대비 배수). **상한이 없으면 한 건이 계좌를 지운다** —
   * 손절 거리가 극히 작으면 수량이 발산한다(FCE `439c4e9`).
   */
  maxNotionalMultiple: number;
}

/** 재진입 잠금. FCE `e363f64` 이식. */
export type ReentryLockMode = "off" | "same_bar" | "bars";

export interface ExecutorConfig {
  initialCapital: number;
  fill: FillConfig;
  sizing: SizingConfig;
  maxPositions: number;
  /**
   * 재진입 잠금.
   *
   * FCE 실측: 같은 확정봉 안에서 청산하고 곧바로 같은 방향으로 다시 들어간 9건은
   * gross 우위가 **−0.914R** 이면서 비용만 1.127R 을 냈다. 막으면 우위/비용이
   * 3.93배 → 1.51배가 된다. **더 긴 잠금은 좋아지지 않는다** — 1봉 간격 재진입 3건은
   * gross +1.608R 로 양수였다(FCE `e363f64`).
   */
  reentryLock: ReentryLockMode;
  reentryLockBars: number;
}

export const DEFAULT_EXECUTOR: Omit<ExecutorConfig, "initialCapital"> = {
  fill: DEFAULT_FILL,
  sizing: { mode: "risk_pct", value: 2, maxNotionalMultiple: 1 },
  maxPositions: 3,
  reentryLock: "same_bar",
  reentryLockBars: 0,
};

/** 실행 결과. `Run`·`Trade`·`Equity`·`Metric` 으로 그대로 간다. */
export interface RunResult {
  trades: ClosedTrade[];
  equity: EquityPoint[];
  /** 진입을 막은 사유별 횟수. **왜 안 샀는지 모르면 못 고친다.** */
  blocked: Record<string, number>;
  bars: number;
  /**
   * 이어서 돌 상태(LAB-07 PART B-1). 백테스트는 안 쓰고 페이퍼가 DB 에 저장한다.
   * 타입은 `executor.ts` 의 `ExecutorState` 다 — 순환 import 를 피하려고 여기서는
   * 구조만 받는다.
   */
  state: unknown;
}
