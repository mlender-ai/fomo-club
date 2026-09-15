/**
 * LAB-09 PART A — 이식한 신호 검출기.
 *
 * 원본(`packages/dormant/fomo-core/src/keyword-cards/quiet-signals.ts`)의 규칙을
 * 그대로 옮겼는지, 그리고 **매매에 쓸 때 새로 생기는 위험**(날짜 어긋남·look-ahead)이
 * 막혀 있는지 본다.
 */
import { describe, expect, it } from "vitest";

import {
  MARKET_DIVERGENCE_MIN_DAYS,
  VOLUME_AWAKENING_BASE_DAYS,
  buyStreak,
  detectMarketDivergence,
  detectVolumeAwakening,
  marketDivergence,
  volumeAwakening,
  type Bar,
} from "../src";

function bar(at: string, close: number, volume = 1000): Bar {
  return { at: new Date(at), open: close, high: close, low: close, close, volume };
}

/** 날짜를 하루씩 늘려가며 봉을 만든다. */
function series(closes: readonly number[], volumes?: readonly number[]): Bar[] {
  return closes.map((close, i) => {
    const day = String(i + 1).padStart(2, "0");
    return bar(`2026-01-${day}T00:00:00Z`, close, volumes?.[i] ?? 1000);
  });
}

describe("시장 역행", () => {
  it("지수보다 매일 강하고 지수가 내렸으면 잡는다", () => {
    // 종목은 매일 오르고, 지수는 매일 내린다.
    const stock = [100, 101, 102, 103];
    const index = [100, 99, 98, 97];
    const found = detectMarketDivergence(stock, index);
    expect(found?.days).toBe(3);
    expect(found?.indexChangePct).toBeLessThan(0);
  });

  it("**지수가 오른 구간은 잡지 않는다** — 문장이 거짓이 된다", () => {
    const stock = [100, 105, 110, 115];
    const index = [100, 101, 102, 103];
    expect(detectMarketDivergence(stock, index)).toBeNull();
  });

  it("누적으로만 이긴 것은 잡지 않는다 — 매일 강해야 한다", () => {
    // 첫날 +30%, 그 뒤 지수보다 **더** 빠진다. 누적은 종목 압승이지만 일별은 진다.
    //
    // 처음 쓴 예시는 [100, 130, 129, 128] 이었는데 그건 통과한다 — 떨어지는 날에도
    // −0.77% 대 −1.01% 로 지수보다 덜 빠졌기 때문이다. **약하게 지는 것과 강하게
    // 이기는 것을 섞어 쓴 예시였다.** 검출기가 아니라 시험이 틀렸었다.
    const stock = [100, 130, 126, 122];
    const index = [100, 99, 98, 97];
    expect(detectMarketDivergence(stock, index)).toBeNull();
  });

  it("길이가 다르면 **판정하지 않는다** — 어긋난 날짜 비교는 거짓이다", () => {
    expect(detectMarketDivergence([100, 101, 102, 103], [100, 99, 98])).toBeNull();
  });

  it(`연속 ${MARKET_DIVERGENCE_MIN_DAYS}일 미만은 잡지 않는다`, () => {
    const stock = [100, 99, 101, 102];
    const index = [100, 101, 100, 99];
    expect(detectMarketDivergence(stock, index)).toBeNull();
  });
});

describe("marketDivergence 지표 — 날짜 정렬", () => {
  it("지수에 없는 날은 **빼고** 맞춘다", () => {
    const stock = series([100, 101, 102, 103]);
    // 지수에는 1/2 이 없다. 그냥 붙이면 종목 1/3 과 지수 1/4 를 비교하게 된다.
    const index = [bar("2026-01-01", 100), bar("2026-01-03", 98), bar("2026-01-04", 97)];
    // 맞춘 뒤 3점뿐이라 최소 일수(3+1)에 못 미친다 → null.
    expect(marketDivergence(stock, index)).toBeNull();
  });

  it("지수가 없으면 null 이다 — 0 이 아니다", () => {
    expect(marketDivergence(series([100, 101, 102, 103]), null)).toBeNull();
    expect(marketDivergence(series([100, 101, 102, 103]), [])).toBeNull();
  });

  it("**앞을 보지 않는다** — 창을 늘려도 같은 시점의 판정은 그대로다", () => {
    const closes = [100, 99, 101, 102, 103, 104, 99, 98];
    const indexCloses = [100, 101, 100, 99, 98, 97, 99, 100];
    const stock = series(closes);
    const index = series(indexCloses);

    for (let cut = 4; cut <= closes.length; cut += 1) {
      const short = marketDivergence(stock.slice(0, cut), index.slice(0, cut));
      // 지수 계열을 **끝까지** 줘도, 종목 창이 같으면 판정이 같아야 한다.
      const longIndex = marketDivergence(stock.slice(0, cut), index);
      expect(longIndex).toBe(short);
    }
  });
});

describe("거래량 각성", () => {
  const base = Array.from({ length: VOLUME_AWAKENING_BASE_DAYS }, () => 1000);

  it("평균의 3배가 붙고 가격이 안 움직였으면 잡는다", () => {
    const points = [...base.map((v) => ({ close: 100, volume: v })), { close: 101, volume: 4000 }];
    const found = detectVolumeAwakening(points);
    expect(found?.multiple).toBeCloseTo(4);
    expect(Math.abs(found?.movePct ?? 99)).toBeLessThanOrEqual(3);
  });

  it("**가격이 이미 움직였으면 잡지 않는다** — 그 문장이 거짓이다", () => {
    const points = [...base.map((v) => ({ close: 100, volume: v })), { close: 120, volume: 4000 }];
    expect(detectVolumeAwakening(points)).toBeNull();
  });

  it("배경이 모자라면 판정하지 않는다 — 거짓 각성은 없는 것보다 나쁘다", () => {
    const short = Array.from({ length: 10 }, () => ({ close: 100, volume: 1000 }));
    expect(detectVolumeAwakening([...short, { close: 100, volume: 9999 }])).toBeNull();
  });

  it("**오늘을 기준 평균에서 뺀다** — 넣으면 급증분이 스스로를 희석한다", () => {
    // 오늘 거래량이 기준의 정확히 3배. 오늘을 분모에 넣으면 3배 밑으로 내려가 못 잡는다.
    const points = [...base.map((v) => ({ close: 100, volume: v })), { close: 100, volume: 3000 }];
    expect(detectVolumeAwakening(points)?.multiple).toBeCloseTo(3);
  });

  it("지표는 배수를 낸다", () => {
    const closes = [...base.map(() => 100), 101];
    const volumes = [...base.map(() => 1000), 4000];
    const bars: Bar[] = closes.map((close, i) => ({
      at: new Date(Date.UTC(2026, 0, 1 + i)),
      open: close,
      high: close,
      low: close,
      close,
      volume: volumes[i] as number,
    }));
    expect(volumeAwakening(bars)).toBeCloseTo(4);
  });
});

describe("연속 순매수", () => {
  const flow = (foreign: number, institution: number) => ({
    foreignNet: foreign,
    institutionNet: institution,
  });

  it("마지막 날부터 거슬러 센다", () => {
    const points = [flow(-1, 1), flow(1, 1), flow(2, -1), flow(3, 5)];
    expect(buyStreak(points, "foreign")).toBe(3);
    expect(buyStreak(points, "institution")).toBe(1);
  });

  it("오늘 순매수가 아니면 0 이다", () => {
    expect(buyStreak([flow(5, 5), flow(-1, -1)], "foreign")).toBe(0);
  });

  it("**자료가 없으면 null 이다** — 0(안 샀다)과 구분한다", () => {
    expect(buyStreak([], "foreign")).toBeNull();
  });
});
