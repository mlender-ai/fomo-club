import { describe, expect, it } from "vitest";
import {
  computeCardVerdict,
  formatVerdictLevel,
  type DailyOhlcv,
  type VerdictInput,
} from "../src";

/** 구간별 선형 보간 캔들 생성 — 결정론(난수 없음). */
function mkCandles(segments: Array<{ days: number; from: number; to: number; vol: number }>): DailyOhlcv[] {
  const out: DailyOhlcv[] = [];
  let prevClose: number | undefined;
  for (const seg of segments) {
    for (let i = 0; i < seg.days; i += 1) {
      const t = seg.days === 1 ? 1 : i / (seg.days - 1);
      const close = seg.from + (seg.to - seg.from) * t;
      out.push({
        open: prevClose ?? close,
        high: close * 1.01,
        low: close * 0.99,
        close,
        volume: seg.vol,
      });
      prevClose = close;
    }
  }
  return out;
}

/** 축적형: 하락 → 저점권 횡보 + 거래 수축(최근 20일 거래량 < 직전 20일). */
function accumulationCandles(): DailyOhlcv[] {
  return [
    ...mkCandles([{ days: 80, from: 20000, to: 10000, vol: 1_000_000 }]),
    ...mkCandles([{ days: 40, from: 10200, to: 10250, vol: 800_000 }]),
    ...mkCandles([{ days: 20, from: 10250, to: 10200, vol: 480_000 }]),
  ];
}

/** 상승형: 지그재그 상승(RSI 과열 방지) + 최근 거래 확대. */
function markupCandles(): DailyOhlcv[] {
  const out: DailyOhlcv[] = [];
  let close = 10000;
  for (let i = 0; i < 140; i += 1) {
    close *= i % 2 === 0 ? 1.015 : 0.991;
    const vol = i >= 120 ? 1_400_000 : 1_000_000;
    out.push({ open: close / 1.01, high: close * 1.01, low: close * 0.99, close, volume: vol });
  }
  return out;
}

/** 분산형: 급등 후 고점권 정체 + 거래 확대. */
function distributionCandles(): DailyOhlcv[] {
  return [
    ...mkCandles([{ days: 100, from: 10000, to: 20000, vol: 900_000 }]),
    ...mkCandles([{ days: 20, from: 19900, to: 19800, vol: 1_000_000 }]),
    ...mkCandles([{ days: 20, from: 19850, to: 19900, vol: 1_600_000 }]),
  ];
}

/** 하락형: 역배열 + 저점 갱신 지속. */
function markdownCandles(): DailyOhlcv[] {
  return mkCandles([{ days: 140, from: 20000, to: 10000, vol: 1_000_000 }]);
}

describe("computeCardVerdict — 결정론 판단 엔진", () => {
  it("같은 입력 → 같은 출력(결정론)", () => {
    const input: VerdictInput = { candles: accumulationCandles(), foreignNetStreak: 5, currency: "KRW" };
    const a = computeCardVerdict(input);
    const b = computeCardVerdict(input);
    expect(a).toBeDefined();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("캔들 30거래일 미만 → 최소 verdict(관망·신호 축적, 무효화 레벨 없음 — 가짜 레벨 금지)", () => {
    const few = mkCandles([{ days: 20, from: 10000, to: 10100, vol: 500_000 }]);
    const v = computeCardVerdict({ candles: few, insider: { insiderCount: 3, valueUsd: 500_000 } });
    expect(v).toBeDefined();
    expect(v.stance).toBe("watch");
    expect(v.confidence).toBe("low");
    expect(v.invalidation).toBeUndefined();
    expect(v.invalidationLevel).toBeUndefined();
    expect(v.evidence.some((line) => line.includes("내부자"))).toBe(true);
  });

  it("구조 verdict 엔 무효화 텍스트와 실계산 레벨이 항상 짝으로 붙는다", () => {
    const v = computeCardVerdict({ candles: accumulationCandles(), foreignNetStreak: 5, currency: "KRW" });
    expect(v.invalidation).toBeTruthy();
    expect(typeof v.invalidationLevel).toBe("number");
    expect(v.invalidation).toContain(formatVerdictLevel(v.invalidationLevel!, "KRW"));
  });

  it("60거래일 미만 → 국면(phase) 억지 판정 없음, 판단은 가능", () => {
    const short = mkCandles([{ days: 45, from: 10000, to: 10200, vol: 500_000 }]);
    const v = computeCardVerdict({ candles: short });
    expect(v).toBeDefined();
    expect(v!.phase).toBeUndefined();
  });

  it("축적 + 수급 유입 → enter, 무효화는 실제 창 저점 레벨", () => {
    const candles = accumulationCandles();
    const v = computeCardVerdict({ candles, foreignNetStreak: 5, currency: "KRW" });
    expect(v).toBeDefined();
    expect(v!.phase).toBe("accumulation");
    expect(v!.stance).toBe("enter");
    const windowLow = Math.min(...candles.map((c) => c.low));
    expect(v!.invalidation).toContain(formatVerdictLevel(windowLow, "KRW"));
    expect(v!.evidence.length).toBeGreaterThan(0);
    expect(v!.evidence.length).toBeLessThanOrEqual(3);
  });

  it("축적 + 내부자 vs 축적 + 수급 — 같은 stance라도 문구가 다르다", () => {
    const candles = accumulationCandles();
    const byInsider = computeCardVerdict({ candles, insider: { insiderCount: 3, valueUsd: 1_200_000 } });
    const byFlow = computeCardVerdict({ candles, foreignNetStreak: 5 });
    expect(byInsider!.stance).toBe("enter");
    expect(byFlow!.stance).toBe("enter");
    expect(byInsider!.stanceText).not.toBe(byFlow!.stanceText);
  });

  it("상승 국면 + 거래량 확인 → enter(markup)", () => {
    const v = computeCardVerdict({ candles: markupCandles(), volumeRatio: 1.6 });
    expect(v).toBeDefined();
    expect(v!.phase).toBe("markup");
    expect(v!.stance).toBe("enter");
    expect(v!.invalidation).toMatch(/20일선/);
  });

  it("분산 + 수급 이탈 → avoid", () => {
    const v = computeCardVerdict({ candles: distributionCandles(), foreignNetStreak: -4 });
    expect(v).toBeDefined();
    expect(v!.phase).toBe("distribution");
    expect(v!.stance).toBe("avoid");
  });

  it("하락 국면 → avoid, 회복 레벨 무효화", () => {
    const v = computeCardVerdict({ candles: markdownCandles() });
    expect(v).toBeDefined();
    expect(v!.phase).toBe("markdown");
    expect(v!.stance).toBe("avoid");
    expect(v!.invalidation).toMatch(/위 마감 시|회복 시/);
  });

  it("신호 없는 횡보 → watch(판별력 — 모든 카드가 enter가 아니다)", () => {
    const flat = mkCandles([{ days: 100, from: 10000, to: 10050, vol: 500_000 }]);
    const v = computeCardVerdict({ candles: flat });
    expect(v).toBeDefined();
    expect(v!.stance).toBe("watch");
  });

  it("4개 시나리오가 서로 다른 stance 분포를 낸다(enter 단일화 금지)", () => {
    const stances = [
      computeCardVerdict({ candles: accumulationCandles(), foreignNetStreak: 5 })!.stance,
      computeCardVerdict({ candles: markupCandles(), volumeRatio: 1.6 })!.stance,
      computeCardVerdict({ candles: distributionCandles(), foreignNetStreak: -4 })!.stance,
      computeCardVerdict({ candles: markdownCandles() })!.stance,
    ];
    expect(new Set(stances).size).toBeGreaterThanOrEqual(2);
    expect(stances.filter((s) => s === "enter").length).toBeLessThan(stances.length);
  });

  it("USD 통화 레벨 표기", () => {
    const candles = accumulationCandles().map((c) => ({
      ...c,
      open: c.open / 100,
      high: c.high / 100,
      low: c.low / 100,
      close: c.close / 100,
    }));
    const v = computeCardVerdict({ candles, foreignNetStreak: 5, currency: "USD" });
    expect(v).toBeDefined();
    expect(v!.invalidation).toContain("$");
  });

  it("무효화 문구에 가짜 수치 없음 — 캔들에서 계산 가능한 레벨만", () => {
    const candles = accumulationCandles();
    const v = computeCardVerdict({ candles, foreignNetStreak: 5, currency: "KRW" });
    const windowLow = Math.min(...candles.map((c) => c.low));
    const closes = candles.map((c) => c.close);
    const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const allowed = [formatVerdictLevel(windowLow, "KRW"), formatVerdictLevel(ma20, "KRW")];
    expect(allowed.some((level) => v!.invalidation.includes(level))).toBe(true);
  });
});
