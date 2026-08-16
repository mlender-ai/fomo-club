import { describe, expect, it } from "vitest";
import { assertSameProvenance, MIN_SAMPLE, PROVENANCE_LABEL, summarize } from "../src/stats";

const series = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => f(i));

describe("§3-2 — N<30 이면 비율을 내지 않는다", () => {
  it("29건은 표본 부족이고 비율·중앙값이 존재하지 않는다", () => {
    const s = summarize(series(29, (i) => i), "ledger");
    expect(s.sufficient).toBe(false);
    if (!s.sufficient) {
      expect(s.n).toBe(29);
      expect(s.label).toBe("표본 부족 (29건)");
    }
    // 타입이 좁혀지지 않으면 median 에 접근할 수 없다 — 숫자 자체가 없다.
    expect((s as Record<string, unknown>).median).toBeUndefined();
    expect((s as Record<string, unknown>).positiveRate).toBeUndefined();
  });

  it("30건부터 통계를 낸다", () => {
    const s = summarize(series(MIN_SAMPLE, (i) => i), "ledger");
    expect(s.sufficient).toBe(true);
  });

  it("**표본 수를 숨기지 않는다** — 얼마나 부족한지가 정보다", () => {
    const s = summarize(series(8, () => 1), "ledger");
    if (!s.sufficient) expect(s.label).toContain("8건");
  });
});

describe("§3-6 — 중앙값 + 분포. 평균만 쓰지 않는다", () => {
  it("소수 대박이 중앙값을 흔들지 않는다", () => {
    // 29개는 0 근처, 1개만 +1000%. 평균은 왜곡되지만 중앙값은 견딘다.
    const values = [...series(29, () => 1), 1000];
    const s = summarize(values, "ledger");
    expect(s.sufficient).toBe(true);
    if (s.sufficient) {
      expect(s.median).toBe(1);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      expect(mean).toBeGreaterThan(30); // 평균이었다면 이렇게 왜곡됐다
      expect(s.distribution.length).toBeGreaterThan(0);
      expect(s.p25).toBeLessThanOrEqual(s.median);
      expect(s.p75).toBeGreaterThanOrEqual(s.median);
    }
  });

  it("분포 칸 합이 표본 수와 같다 — 조용히 버려지는 값이 없다", () => {
    const s = summarize(series(50, (i) => i - 25), "backtest");
    if (s.sufficient) {
      expect(s.distribution.reduce((a, b) => a + b.count, 0)).toBe(50);
    }
  });

  it("상승 비율은 양수 비율이다", () => {
    const s = summarize([...series(30, (i) => (i < 18 ? 1 : -1))], "ledger");
    if (s.sufficient) expect(Math.round(s.positiveRate)).toBe(60);
  });
});

describe("§3-1 — 백테스트와 실적을 절대 합산하지 않는다", () => {
  it("출처가 섞이면 예외로 막는다", () => {
    const ledger = summarize(series(30, () => 1), "ledger");
    const backtest = summarize(series(30, () => 1), "backtest");
    expect(() => assertSameProvenance([ledger, backtest])).toThrow(/합산할 수 없습니다/);
  });

  it("같은 출처끼리는 통과한다", () => {
    const a = summarize(series(30, () => 1), "ledger");
    const b = summarize(series(40, () => 2), "ledger");
    expect(assertSameProvenance([a, b])).toBe("ledger");
  });

  it("표본 부족 항목도 출처를 잃지 않는다 — 라벨만 바뀌고 섞임 방지는 유지된다", () => {
    const short = summarize(series(3, () => 1), "backtest");
    const full = summarize(series(30, () => 1), "ledger");
    expect(short.provenance).toBe("backtest");
    expect(() => assertSameProvenance([short, full])).toThrow();
  });

  it("화면 라벨이 출처를 항상 밝힌다", () => {
    expect(PROVENANCE_LABEL.ledger).toContain("판단 원장");
    expect(PROVENANCE_LABEL.backtest).toContain("소급");
  });
});

describe("§3-3 생존 편향 — 손실·폐지 종목을 넣어도 분모가 줄지 않는다", () => {
  it("-100% 관측이 포함돼도 표본에서 빠지지 않는다", () => {
    const values = [...series(29, () => 5), -100];
    const s = summarize(values, "ledger");
    expect(s.n).toBe(30);
    if (s.sufficient) {
      expect(s.distribution.reduce((a, b) => a + b.count, 0)).toBe(30);
      expect(Math.round(s.positiveRate)).toBe(97);
    }
  });
});
