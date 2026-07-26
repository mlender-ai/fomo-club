import { describe, expect, it } from "vitest";
import {
  scoreBacktestSample,
  backtestSignal,
  aggregateSignalStats,
  preferLedgerStats,
  buildSignalStatsCopy,
  BACKTEST_MIN_SAMPLE,
  type BacktestSample,
  type DailyOhlcv,
  type SignalStats,
} from "../src";

/** 종가 배열 → 일봉(날짜 오름차순, 2026-01-01 부터 하루씩). */
function candles(closes: readonly number[], startDay = 1): DailyOhlcv[] {
  return closes.map((close, i) => {
    const day = String(startDay + i).padStart(2, "0");
    return { date: `2026-01-${day}`, open: close, high: close, low: close, close, volume: 1000 };
  });
}

/** 신호일 이후 +30 거래일까지 채워진 표본(진입 100 → 지정 수익률). */
function sample(symbol: string, pct30: number, pct7 = pct30 / 2): BacktestSample {
  const series: number[] = [100];
  for (let i = 1; i <= 30; i += 1) {
    const target = i <= 7 ? 100 * (1 + (pct7 / 100) * (i / 7)) : 100 * (1 + (pct30 / 100) * (i / 30));
    series.push(target);
  }
  return { symbol, signalDate: "2026-01-01", candles: candles(series) };
}

describe("scoreBacktestSample — 실데이터 역산만(가짜 미래 금지)", () => {
  it("신호일 종가 대비 +7·+30 거래일 수익률을 계산한다", () => {
    const scored = scoreBacktestSample(sample("AAA", 10, 4))!;
    expect(scored.entry).toBe(100);
    expect(scored.returns[7]).toBeCloseTo(4, 5);
    expect(scored.returns[30]).toBeCloseTo(10, 5);
  });

  it("신호일 봉이 없으면 직전 거래일 종가를 진입가로(휴장·공시 시차)", () => {
    const all = candles(Array.from({ length: 40 }, (_, i) => 100 + i)); // 01-01..
    const s: BacktestSample = {
      symbol: "BBB",
      signalDate: "2026-01-04", // 아래 캔들에서 01-04 를 뺀다(휴장 가정)
      candles: all.filter((c) => c.date !== "2026-01-04"),
    };
    const scored = scoreBacktestSample(s)!;
    expect(scored.entry).toBe(102); // 01-03 종가
  });

  it("미래 봉이 모자라면 그 지평은 채점하지 않는다(미래를 지어내지 않음)", () => {
    const s: BacktestSample = { symbol: "CCC", signalDate: "2026-01-01", candles: candles([100, 101, 102]) };
    const scored = scoreBacktestSample(s);
    expect(scored).toBeNull(); // 7일치도 없음 → 채점 0
  });

  it("KR 캔들 YYYYMMDD 형식도 인식한다", () => {
    const raw = candles(Array.from({ length: 40 }, () => 100)).map((c) => ({
      ...c,
      date: c.date!.replace(/-/g, ""),
    }));
    const scored = scoreBacktestSample({ symbol: "005930", signalDate: "2026-01-01", candles: raw });
    expect(scored?.returns[30]).toBeCloseTo(0, 5);
  });

  it("캔들 없음/이상치 → null(에러 없음)", () => {
    expect(scoreBacktestSample({ symbol: "X", signalDate: "2026-01-01", candles: [] })).toBeNull();
  });
});

describe("aggregateSignalStats — 승률과 하락률을 항상 함께 낸다", () => {
  // 노출 게이트가 n>=30 이라(WO-P6) 표본을 그 위로 잡는다. 승 24 / 패 12 → 승률 66.7%.
  const mixed: BacktestSample[] = [
    ...Array.from({ length: 24 }, (_, i) => sample(`UP${i}`, 6)),
    ...Array.from({ length: 12 }, (_, i) => sample(`DOWN${i}`, -5)),
  ];

  it("승률·하락률·중앙값·표본수가 모두 산출된다", () => {
    const stats = backtestSignal(mixed, { type: "insider_cluster", computedAt: "2026-07-08" })!;
    const h = stats.horizons[30]!;
    expect(h.n).toBe(36);
    expect(h.up).toBe(24);
    expect(h.down).toBe(12);
    expect(h.winRate).toBeCloseTo(66.7, 1);
    expect(h.downRate).toBeCloseTo(33.3, 1);
    expect(h.medianReturn).toBeGreaterThan(0);
  });

  it("표본 미달이면 통계를 만들지 않는다(3건으로 승률 금지)", () => {
    const few = Array.from({ length: BACKTEST_MIN_SAMPLE - 1 }, (_, i) => sample(`A${i}`, 5)); // n<30
    expect(backtestSignal(few, { type: "insider_cluster", computedAt: "2026-07-08" })).toBeNull();
  });

  it("빈 표본 → null(가짜 통계 금지)", () => {
    expect(aggregateSignalStats([], { type: "foreign_streak", computedAt: "2026-07-08" })).toBeNull();
  });

  it("방법론 문구와 산식 버전이 동봉된다(정직 규칙 ②)", () => {
    const stats = backtestSignal(mixed, { type: "insider_cluster", computedAt: "2026-07-08" })!;
    expect(stats.method).toContain("종가");
    expect(stats.method).toMatch(/\d+건/);
    expect(stats.methodVersion).toBeTruthy();
    expect(stats.computedAt).toBe("2026-07-08");
    expect(stats.source).toBe("backtest");
  });

  it("결정적 — 같은 입력은 같은 출력", () => {
    const a = backtestSignal(mixed, { type: "insider_cluster", computedAt: "2026-07-08" });
    const b = backtestSignal(mixed, { type: "insider_cluster", computedAt: "2026-07-08" });
    expect(a).toEqual(b);
  });
});

describe("preferLedgerStats — 실전 n≥30 이면 백테스트를 대체(정직 규칙 ③)", () => {
  const bt = backtestSignal(
    Array.from({ length: 30 }, (_, i) => sample(`B${i}`, 5)),
    { type: "insider_cluster", computedAt: "2026-07-08" }
  );
  const makeLedger = (n: number): SignalStats => ({
    type: "insider_cluster",
    source: "ledger",
    horizons: { 30: { n, up: Math.round(n * 0.6), winRate: 60, down: Math.round(n * 0.4), downRate: 40, medianReturn: 3.2 } },
    computedAt: "2026-07-08",
    method: "실전",
    methodVersion: "bt.v1",
  });

  it("원장 표본 30 미만이면 백테스트 유지", () => {
    expect(preferLedgerStats(bt, makeLedger(29))?.source).toBe("backtest");
  });
  it("원장 표본 30 이상이면 실전 성적으로 승격", () => {
    expect(preferLedgerStats(bt, makeLedger(30))?.source).toBe("ledger");
  });
  it("둘 다 없으면 null(블록 숨김)", () => {
    expect(preferLedgerStats(null, null)).toBeNull();
  });
});

describe("buildSignalStatsCopy — 상승만 말하는 카드 금지", () => {
  const stats = backtestSignal(
    [
      ...Array.from({ length: 24 }, (_, i) => sample(`U${i}`, 6)),
      ...Array.from({ length: 12 }, (_, i) => sample(`D${i}`, -5)),
    ],
    { type: "insider_cluster", computedAt: "2026-07-08" }
  );

  it("승률 + 하락 표현이 한 세트로 나온다", () => {
    const copy = buildSignalStatsCopy(stats)!;
    expect(copy.headline).toMatch(/\d+번 중 \d+번 올랐어요/);
    expect(copy.headline).toMatch(/\d+%/);
    expect(copy.detail).toMatch(/중앙값/);
    expect(copy.detail).toMatch(/내렸어요|내린 적/); // 하락 언급 필수
  });

  it("하락이 있는 통계는 반드시 하락 건수를 말한다(은폐 금지)", () => {
    const copy = buildSignalStatsCopy(stats)!;
    expect(copy.detail).toMatch(/10번 중 [1-9]번은 내렸어요/);
  });

  it("승률 100% 표본이어도 '다음에도 그렇다는 뜻은 아니다'로 캐비앳을 남긴다", () => {
    const allUp = backtestSignal(
      Array.from({ length: 30 }, (_, i) => sample(`A${i}`, 7)),
      { type: "insider_cluster", computedAt: "2026-07-08" }
    );
    const copy = buildSignalStatsCopy(allUp)!;
    expect(copy.detail).toContain("다음에도 그렇다는 뜻은 아니에요");
  });

  it("통계 없으면 null — 카드가 블록을 숨긴다(빈 껍데기 금지)", () => {
    expect(buildSignalStatsCopy(null)).toBeNull();
  });

  it("출처 배지가 백테스트/실전을 구분한다", () => {
    expect(buildSignalStatsCopy(stats)!.sourceLabel).toBe("과거 데이터 역산");
  });
});
