import { describe, expect, it } from "vitest";

import {
  DEFAULT_OUTLIER_PCT,
  INTERVAL_MS,
  expectedCandleCount,
  findDuplicates,
  findGaps,
  findMisaligned,
  findOutliers,
  inspectCandles,
  isInGap,
  type QualityCandle,
} from "../src/candle-quality";

const H = INTERVAL_MS.H1;
/** 2026-01-01T00:00:00Z — 시간 경계에 정확히 맞는 기준점. */
const T0 = Date.UTC(2026, 0, 1, 0, 0, 0);

function candle(offsetHours: number, close = 100, extra: Partial<QualityCandle> = {}): QualityCandle {
  return {
    at: new Date(T0 + offsetHours * H),
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
    ...extra,
  };
}

/** 끊김 없는 n개. */
function series(n: number, close = 100): QualityCandle[] {
  return Array.from({ length: n }, (_, i) => candle(i, close));
}

describe("검사 1 — 봉 개수", () => {
  it("기간으로 계산한 개수는 양끝을 포함한다", () => {
    expect(expectedCandleCount(new Date(T0), new Date(T0 + 23 * H), "H1")).toBe(24);
    expect(expectedCandleCount(new Date(T0), new Date(T0), "H1")).toBe(1);
  });

  it("하루치 1시간봉은 24개다", () => {
    const report = inspectCandles("BTC", "H1", series(24));
    expect(report.count).toBe(24);
    expect(report.expected).toBe(24);
  });

  it("끝이 시작보다 앞서면 0이다", () => {
    expect(expectedCandleCount(new Date(T0 + H), new Date(T0), "H1")).toBe(0);
  });
});

describe("검사 2 — 구멍", () => {
  it("빠진 구간의 시각과 개수를 낸다", () => {
    const gaps = findGaps([candle(0), candle(1), candle(5), candle(6)], "H1");
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.missing).toBe(3);
    expect(gaps[0]?.fromAt.toISOString()).toBe(new Date(T0 + 2 * H).toISOString());
    expect(gaps[0]?.toAt.toISOString()).toBe(new Date(T0 + 4 * H).toISOString());
  });

  it("구멍이 여럿이면 각각 센다", () => {
    const report = inspectCandles("BTC", "H1", [candle(0), candle(3), candle(10)]);
    expect(report.gaps).toHaveLength(2);
    expect(report.missing).toBe(2 + 6);
  });

  it("끊김이 없으면 빈 배열이다", () => {
    expect(findGaps(series(50), "H1")).toEqual([]);
  });

  it("구멍은 ok 를 깨지 않는다 — 정상 출력이다", () => {
    const report = inspectCandles("BTC", "H1", [candle(0), candle(9)]);
    expect(report.missing).toBe(8);
    expect(report.ok).toBe(true);
  });

  it("보간 함수가 없다 — 메울 길을 만들지 않는다", async () => {
    const mod = await import("../src/candle-quality");
    const names = Object.keys(mod).join(" ").toLowerCase();
    expect(names).not.toMatch(/fill|interpolat|impute/);
  });
});

describe("검사 3 — 이상치", () => {
  it("임계 이상 변동을 잡는다", () => {
    const outliers = findOutliers([candle(0, 100), candle(1, 150)]);
    expect(outliers).toHaveLength(1);
    expect(outliers[0]?.changePct).toBeCloseTo(50);
  });

  it("하락도 잡는다", () => {
    expect(findOutliers([candle(0, 100), candle(1, 50)])[0]?.changePct).toBeCloseTo(-50);
  });

  it("크립토의 흔한 변동은 안 잡는다", () => {
    expect(findOutliers([candle(0, 100), candle(1, 115)])).toEqual([]);
  });

  it("임계는 넘길 수 있다", () => {
    expect(findOutliers([candle(0, 100), candle(1, 110)], 5)).toHaveLength(1);
  });

  it("기본 임계가 크립토 기준으로 넉넉하다", () => {
    expect(DEFAULT_OUTLIER_PCT).toBeGreaterThanOrEqual(20);
  });
});

describe("검사 4 — 시각(UTC 정렬)", () => {
  it("경계에 맞으면 통과한다", () => {
    expect(findMisaligned(series(10), "H1")).toEqual([]);
  });

  it("30분 어긋난 봉을 잡는다", () => {
    const bad: QualityCandle[] = [{ ...candle(0), at: new Date(T0 + 30 * 60 * 1000) }];
    const found = findMisaligned(bad, "H1");
    expect(found).toHaveLength(1);
    expect(found[0]?.offsetMs).toBe(30 * 60 * 1000);
  });

  it("일봉은 하루 경계를 본다 — 1시간봉으로는 통과하던 것이 걸린다", () => {
    const hourly = [candle(1)];
    expect(findMisaligned(hourly, "H1")).toEqual([]);
    expect(findMisaligned(hourly, "D1")).toHaveLength(1);
  });

  it("정렬이 깨지면 ok 가 false 다", () => {
    const bad: QualityCandle[] = [{ ...candle(0), at: new Date(T0 + 61 * 1000) }];
    expect(inspectCandles("BTC", "H1", bad).ok).toBe(false);
  });
});

describe("검사 5 — 중복", () => {
  it("같은 시각이 둘이면 잡는다", () => {
    expect(findDuplicates([candle(0), candle(0), candle(1)])).toHaveLength(1);
  });

  it("셋이어도 한 번만 낸다", () => {
    expect(findDuplicates([candle(0), candle(0), candle(0)])).toHaveLength(1);
  });

  it("중복이면 ok 가 false 다", () => {
    expect(inspectCandles("BTC", "H1", [candle(0), candle(0)]).ok).toBe(false);
  });
});

describe("inspectCandles", () => {
  it("순서가 뒤섞여 들어와도 정렬해서 본다", () => {
    const report = inspectCandles("BTC", "H1", [candle(2), candle(0), candle(1)]);
    expect(report.gaps).toEqual([]);
    expect(report.first?.toISOString()).toBe(new Date(T0).toISOString());
    expect(report.last?.toISOString()).toBe(new Date(T0 + 2 * H).toISOString());
  });

  it("빈 입력을 견딘다", () => {
    const report = inspectCandles("BTC", "H1", []);
    expect(report.count).toBe(0);
    expect(report.expected).toBeNull();
    expect(report.first).toBeNull();
  });

  it("깨끗한 시계열은 ok 다", () => {
    expect(inspectCandles("BTC", "H1", series(100)).ok).toBe(true);
  });
});

describe("isInGap — LAB-04 가 진입을 막는 근거", () => {
  const gaps = findGaps([candle(0), candle(5)], "H1");

  it("구멍 안이면 true", () => {
    expect(isInGap(new Date(T0 + 3 * H), gaps)).toBe(true);
  });

  it("구멍 경계도 포함이다", () => {
    expect(isInGap(new Date(T0 + 1 * H), gaps)).toBe(true);
    expect(isInGap(new Date(T0 + 4 * H), gaps)).toBe(true);
  });

  it("구멍 밖이면 false", () => {
    expect(isInGap(new Date(T0), gaps)).toBe(false);
    expect(isInGap(new Date(T0 + 5 * H), gaps)).toBe(false);
  });
});
