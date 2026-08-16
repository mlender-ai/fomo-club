import { describe, expect, it } from "vitest";
import {
  belowRangeRecovery,
  daysSinceHigh,
  drawdownFromHigh,
  higherLows,
  maAlignment,
  positionInRange,
  rangeCompression,
  supportTests,
  volumeRatio,
  volumeSpikeDays,
} from "../src/indicators";
import type { DailyCandle } from "../src/types";

/** 결정론 검증용 합성 캔들. 날짜는 오름차순. */
function candle(i: number, over: Partial<DailyCandle> = {}): DailyCandle {
  const date = `2026-01-${String((i % 28) + 1).padStart(2, "0")}-${Math.floor(i / 28)}`.slice(0, 10);
  return { date, open: 100, high: 110, low: 90, close: 100, volume: 1_000, ...over };
}

const series = (n: number, f: (i: number) => Partial<DailyCandle> = () => ({})): DailyCandle[] =>
  Array.from({ length: n }, (_, i) => candle(i, f(i)));

const W = { recent: 20, prior: 60 };

describe("§4 지표 — 산출 불가는 null, 추정하지 않는다", () => {
  it("데이터가 창보다 짧으면 전부 null 을 낸다", () => {
    const short = series(10);
    expect(rangeCompression(short, W).ratio).toBeNull();
    expect(volumeRatio(short, W).ratio).toBeNull();
    expect(positionInRange(short, 60)).toBeNull();
    expect(drawdownFromHigh(short, 252)).toBeNull();
    expect(daysSinceHigh(short, 252)).toBeNull();
    expect(maAlignment(short)).toBeNull();
    expect(volumeSpikeDays(short, W, 2).count).toBe(0);
    expect(belowRangeRecovery(short, W).events).toEqual([]);
    expect(higherLows(short, 60, 3).isHigherLows).toBe(false);
    expect(supportTests(short, 60, 1).level).toBeNull();
  });
});

describe("① range_compression", () => {
  it("최근 폭이 과거의 절반이면 0.5", () => {
    // prior 60일 폭 20, recent 20일 폭 10.
    const c = [...series(60, () => ({ high: 110, low: 90 })), ...series(20, () => ({ high: 105, low: 95 }))];
    expect(rangeCompression(c, W).ratio).toBeCloseTo(0.5, 10);
  });
});

describe("② volume_ratio", () => {
  it("최근 거래량이 과거의 30%면 0.3", () => {
    const c = [...series(60, () => ({ volume: 1_000 })), ...series(20, () => ({ volume: 300 }))];
    expect(volumeRatio(c, W).ratio).toBeCloseTo(0.3, 10);
  });
});

describe("③ volume_spike_days", () => {
  it("과거 평균의 배수를 넘은 날만 센다 — 배수는 호출자가 준다", () => {
    const recent = series(20, (i) => ({ volume: i === 19 ? 5_000 : 500 }));
    const c = [...series(60, () => ({ volume: 1_000 })), ...recent];
    expect(volumeSpikeDays(c, W, 2).count).toBe(1);
    // 배수를 올리면 같은 날이 급증에서 빠진다 — 상수가 아니라 인자임을 보인다.
    expect(volumeSpikeDays(c, W, 10).count).toBe(0);
  });
});

describe("④ higher_lows", () => {
  it("구간별 최저점이 계속 올라가면 참", () => {
    const c = series(60, (i) => ({ low: 90 + i, high: 200, close: 150 }));
    const result = higherLows(c, 60, 3);
    expect(result.isHigherLows).toBe(true);
    expect(result.lows).toHaveLength(3);
  });

  it("저점이 내려가면 거짓", () => {
    const c = series(60, (i) => ({ low: 200 - i, high: 300, close: 250 }));
    expect(higherLows(c, 60, 3).isHigherLows).toBe(false);
  });
});

describe("⑤ support_tests", () => {
  it("최저가 근처로 재접근한 날을 센다 — 허용오차는 호출자가 준다", () => {
    const c = series(60, (i) => ({ low: i % 20 === 0 ? 100 : 150, high: 200, close: 160 }));
    const tight = supportTests(c, 60, 1);
    expect(tight.level).toBe(100);
    expect(tight.count).toBe(3);
    // 허용오차를 키우면 더 많이 잡힌다.
    expect(supportTests(c, 60, 60).count).toBe(60);
  });
});

describe("⑥ below_range_recovery", () => {
  it("하단 이탈 후 종가가 되돌아오면 깊이·회복일수를 남긴다", () => {
    const prior = series(60, () => ({ low: 100, high: 120, close: 110 }));
    const recent = series(20, (i) => {
      if (i === 2) return { low: 90, high: 100, close: 95 }; // 10% 이탈
      return { low: 100, high: 120, close: 110 };
    });
    const events = belowRangeRecovery([...prior, ...recent], W).events;
    expect(events).toHaveLength(1);
    expect(events[0]?.depthPct).toBeCloseTo(10, 6);
    expect(events[0]?.recoveryDays).toBe(1);
  });

  it("이탈 후 회복하지 못하면 사례로 세지 않는다", () => {
    const prior = series(60, () => ({ low: 100, high: 120, close: 110 }));
    const recent = series(20, () => ({ low: 80, high: 90, close: 85 }));
    expect(belowRangeRecovery([...prior, ...recent], W).events).toEqual([]);
  });
});

describe("⑦ position_in_range", () => {
  it("레인지 정중앙이면 50", () => {
    const c = series(60, (i) => ({ low: 100, high: 200, close: i === 59 ? 150 : 150 }));
    expect(positionInRange(c, 60)).toBeCloseTo(50, 6);
  });

  it("고저가 같으면 백분위를 낼 수 없어 null", () => {
    expect(positionInRange(series(60, () => ({ low: 100, high: 100, close: 100 })), 60)).toBeNull();
  });
});

describe("⑧ drawdown_from_high / ⑨ days_since_high", () => {
  it("고점 대비 낙폭은 음수이고, 고점 이후 경과일을 함께 낸다", () => {
    // 0번째가 고점(high 200), 이후 하락.
    const c = series(252, (i) => (i === 0 ? { high: 200, low: 150, close: 190 } : { high: 120, low: 90, close: 100 }));
    expect(drawdownFromHigh(c, 252)).toBeCloseTo(-50, 6);
    expect(daysSinceHigh(c, 252)).toBe(251);
  });

  it("오늘이 고점이면 경과일 0", () => {
    const c = series(252, (i) => (i === 251 ? { high: 300, low: 200, close: 300 } : { high: 120, low: 90, close: 100 }));
    expect(daysSinceHigh(c, 252)).toBe(0);
  });
});

describe("⑩ ma_alignment", () => {
  it("우상향이면 상승정렬", () => {
    expect(maAlignment(series(150, (i) => ({ close: 100 + i })))).toBe("상승정렬");
  });

  it("우하향이면 하락정렬", () => {
    expect(maAlignment(series(150, (i) => ({ close: 300 - i })))).toBe("하락정렬");
  });

  it("평평하면 혼조", () => {
    expect(maAlignment(series(150, () => ({ close: 100 })))).toBe("혼조");
  });
});

describe("결정론 (완료조건 8)", () => {
  it("같은 입력에 같은 출력", () => {
    const c = series(252, (i) => ({ close: 100 + (i % 7), volume: 1_000 + (i % 13) }));
    expect(rangeCompression(c, W)).toEqual(rangeCompression(c, W));
    expect(volumeSpikeDays(c, W, 2)).toEqual(volumeSpikeDays(c, W, 2));
    expect(daysSinceHigh(c, 252)).toEqual(daysSinceHigh(c, 252));
  });
});
